import { consola } from 'consola';
import { simpleGit } from 'simple-git';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentLogger } from '../util/agent-logger.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

type CursorAgentStatus = 'CREATING' | 'RUNNING' | 'FINISHED' | 'FAILED';

type CursorAgent = {
  id: string;
  name: string;
  status: CursorAgentStatus;
  source: {
    repository: string;
    ref: string;
  };
  target: {
    branchName: string;
    url?: string;
    prUrl?: string;
  };
  summary?: string;
  createdAt: string;
};

export class CursorRunner implements AgentRunner {
  private readonly baseUrl = 'https://api.cursor.com/v0';

  checkEnv(): void {
    if (!process.env.CURSOR_API_KEY) {
      throw new Error('CURSOR_API_KEY must be set to run the Cursor agent.');
    }
  }

  private getApiKey(): string {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      throw new Error('CURSOR_API_KEY must be set to run the Cursor agent.');
    }
    return apiKey;
  }

  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const apiKey = this.getApiKey();
    const headers: Record<string, string> = {
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // Debug logging (only in verbose mode or when DEBUG env var is set)
    if (process.env.DEBUG === 'cursor' || process.env.VERBOSE) {
      consola.debug('[cursor] API Request:', {
        method,
        url,
        headers: { ...headers, Authorization: '[REDACTED]' },
        body: body ? JSON.stringify(body, null, 2) : undefined,
      });
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Log response details for debugging
    if (process.env.DEBUG === 'cursor' || process.env.VERBOSE) {
      const responseClone = response.clone();
      const responseText = await responseClone.text();
      consola.debug('[cursor] API Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText,
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');

      // Enhanced error message with helpful hints
      let errorMessage = `Cursor API error (${response.status}): ${errorText}`;

      if (response.status === 403) {
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.includes('Storage mode is disabled')) {
            errorMessage += '\n\n💡 How to fix:\n';
            errorMessage += '   1. Open Cursor IDE\n';
            errorMessage += '   2. Go to Settings → Privacy\n';
            errorMessage += '   3. Disable "Privacy Mode" or enable "Storage Mode"\n';
            errorMessage += '   4. Cloud Agents require data retention for operation\n';
            errorMessage += '\n   Learn more: https://cursor.com/docs/cloud-agent';
          }
        } catch {
          // Not JSON or parsing failed, keep original message
        }
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  private sanitizeUrl(url: string): string {
    // Remove any embedded tokens from URLs for safe logging
    return url.replace(/https:\/\/[^@]+@github\.com/, 'https://github.com');
  }

  private async getRepositoryUrl(worktreeDir: string): Promise<string> {
    const git = simpleGit(worktreeDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];

    if (!origin) {
      throw new Error('No git remote found. Cursor requires a GitHub repository.');
    }

    let repoUrl = origin.refs.fetch;

    // Convert SSH URL to HTTPS
    if (repoUrl.startsWith('git@github.com:')) {
      repoUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    // Remove .git suffix
    repoUrl = repoUrl.replace(/\.git$/, '');

    // Remove any embedded authentication tokens
    repoUrl = this.sanitizeUrl(repoUrl);

    // Validate it's a GitHub URL
    if (!repoUrl.includes('github.com')) {
      throw new Error(`Cursor only works with GitHub repositories. Got: ${repoUrl}`);
    }

    return repoUrl;
  }

  private async pushBaseBranch(
    worktreeDir: string,
    localBranch: string,
    remoteBranch: string,
  ): Promise<void> {
    const git = simpleGit(worktreeDir);

    // Push the current worktree state to a different remote branch name for Cursor to use as base
    // Format: localBranch:remoteBranch pushes local branch to remote with different name
    await git.push('origin', `${localBranch}:${remoteBranch}`, ['--force']);
  }

  private async pullCursorChanges(
    worktreeDir: string,
    cursorBranch: string,
  ): Promise<void> {
    const git = simpleGit(worktreeDir);

    // Fetch the branch Cursor created
    await git.fetch('origin', cursorBranch);

    // Reset to Cursor's branch (this will bring all changes into the worktree)
    await git.reset(['--hard', `origin/${cursorBranch}`]);
  }

  private async pollAgentStatus(
    agentId: string,
    scratchpadPath: string,
    timeoutMs: number = 600000, // 10 minutes
  ): Promise<CursorAgent> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    let lastStatus: CursorAgentStatus | null = null;

    while (Date.now() - startTime < timeoutMs) {
      const agent = await this.apiRequest<CursorAgent>('GET', `/agents/${agentId}`);

      // Log status changes
      if (agent.status !== lastStatus) {
        await appendScratchpadEntry(scratchpadPath, `Status: ${agent.status}`);
        lastStatus = agent.status;
      }

      if (agent.status === 'FINISHED') {
        return agent;
      }

      if (agent.status === 'FAILED') {
        throw new Error('Cursor agent failed to complete the task');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Cursor agent timed out after ${timeoutMs}ms`);
  }

  private async commitWorktree(worktreeDir: string): Promise<void> {
    const git = simpleGit(worktreeDir);

    // Add all files (including .ob1 tracking files)
    await git.add('.');

    // Check if there's anything to commit
    const status = await git.status();
    if (status.isClean()) {
      return; // Nothing to commit
    }

    // Create initial commit for Cursor to work from
    await git.commit('ob1: Initialize worktree for Cursor agent');
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[cursor] Starting Cursor Cloud agent for task: ${context.prompt}`);

    // Initialize detailed logger
    const logger = new AgentLogger(context.name, context.taskId, context.runRoot);
    await logger.init();
    await logger.logStart(context.prompt);

    await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
    await appendTodo(context.todoPath, 'Initialize Cursor Cloud Agent', false);

    const startTime = Date.now();
    let turnCount = 0;

    try {
      // Step 1: Get repository URL
      turnCount++;
      await appendScratchpadEntry(context.scratchpadPath, 'Detecting GitHub repository...');
      await logger.logThought(turnCount, 'Detecting GitHub repository from git remote...');
      const repoUrl = await this.getRepositoryUrl(context.dir);
      await appendScratchpadEntry(context.scratchpadPath, `Repository: ${repoUrl}`);
      await logger.logToolCall(turnCount, 'get_repository_url', { worktreeDir: context.dir });
      await logger.logToolResult(turnCount, 'get_repository_url', true, repoUrl);

      // Step 2: Commit current worktree state (with .ob1 files)
      turnCount++;
      await appendScratchpadEntry(context.scratchpadPath, 'Committing worktree state...');
      await logger.logThought(turnCount, 'Committing current worktree state for Cursor to use as base...');
      await this.commitWorktree(context.dir);
      await logger.logToolCall(turnCount, 'commit_worktree', { worktreeDir: context.dir });
      await logger.logToolResult(turnCount, 'commit_worktree', true, 'Worktree committed');

      // Step 3: Push current worktree as base branch
      turnCount++;
      const baseBranch = `${context.branch}-base`;
      await appendScratchpadEntry(context.scratchpadPath, 'Pushing base branch to GitHub...');
      await logger.logThought(turnCount, `Pushing base branch ${baseBranch} to GitHub...`);
      await this.pushBaseBranch(context.dir, context.branch, baseBranch);
      await appendScratchpadEntry(context.scratchpadPath, `Base branch: ${baseBranch}`);
      await logger.logToolCall(turnCount, 'push_base_branch', {
        localBranch: context.branch,
        remoteBranch: baseBranch,
      });
      await logger.logToolResult(turnCount, 'push_base_branch', true, `Pushed to ${baseBranch}`);

      // Step 4: Launch Cursor agent
      turnCount++;
      await appendScratchpadEntry(context.scratchpadPath, 'Launching Cursor Cloud agent...');
      await logger.logThought(turnCount, 'Launching Cursor Cloud agent via API...');
      const cursorBranch = `${context.branch}-cursor`;

      const createPayload = {
        prompt: {
          text: context.prompt,
        },
        source: {
          repository: repoUrl,
          ref: baseBranch,
        },
        target: {
          branchName: cursorBranch,
          autoCreatePr: false, // We'll handle PR creation in the orchestrator
        },
      };

      await logger.logToolCall(turnCount, 'cursor_api_create_agent', createPayload);
      const createResponse = await this.apiRequest<CursorAgent>('POST', '/agents', createPayload);
      await logger.logToolResult(turnCount, 'cursor_api_create_agent', true, {
        agentId: createResponse.id,
        status: createResponse.status,
      });

      await appendScratchpadEntry(
        context.scratchpadPath,
        `Agent created: ${createResponse.id}`,
      );
      await appendTodo(context.todoPath, 'Cursor agent created', true);
      await appendTodo(context.todoPath, 'Waiting for Cursor to complete', false);

      // Step 5: Poll for completion
      turnCount++;
      await logger.logThought(turnCount, `Polling Cursor agent ${createResponse.id} for completion...`);
      await logger.logToolCall(turnCount, 'poll_agent_status', {
        agentId: createResponse.id,
        timeoutMs: 600000,
      });
      const completedAgent = await this.pollAgentStatus(
        createResponse.id,
        context.scratchpadPath,
        600000, // 10 minutes timeout
      );
      await logger.logToolResult(turnCount, 'poll_agent_status', true, {
        status: completedAgent.status,
        summary: completedAgent.summary,
      });

      await appendTodo(context.todoPath, 'Cursor agent completed', true);
      await appendScratchpadEntry(
        context.scratchpadPath,
        `Summary: ${completedAgent.summary || 'No summary provided'}`,
      );

      // Step 6: Pull Cursor's changes into worktree
      turnCount++;
      await appendScratchpadEntry(
        context.scratchpadPath,
        'Pulling changes from Cursor branch...',
      );
      await logger.logThought(turnCount, `Pulling changes from Cursor branch ${cursorBranch}...`);
      await appendTodo(context.todoPath, 'Pulling changes to worktree', false);

      await logger.logToolCall(turnCount, 'pull_cursor_changes', {
        worktreeDir: context.dir,
        cursorBranch,
      });
      await this.pullCursorChanges(context.dir, cursorBranch);
      await logger.logToolResult(turnCount, 'pull_cursor_changes', true, 'Changes pulled successfully');

      await appendTodo(context.todoPath, 'Changes pulled successfully', true);

      // Step 7: Build result
      const duration = Date.now() - startTime;
      const notes: string[] = [
        `Duration: ${(duration / 1000).toFixed(1)}s`,
        `Cursor Agent ID: ${completedAgent.id}`,
        `Branch: ${completedAgent.target.branchName}`,
      ];

      if (completedAgent.target.url) {
        notes.push(`Cursor URL: ${completedAgent.target.url}`);
      }

      consola.success(`[cursor] Task completed`);

      // Log completion to detailed logger
      const duration_ms = Date.now() - startTime;
      await logger.logComplete({
        turns: turnCount,
        duration_ms,
        success: true,
        summary: completedAgent.summary || 'Cursor agent completed the task',
      });

      return {
        agent: context.name,
        summary: completedAgent.summary || 'Cursor agent completed the task',
        notes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);
      await logger.logError(errorMessage);

      // Log failed completion
      const duration_ms = Date.now() - startTime;
      await logger.logComplete({
        turns: turnCount,
        duration_ms,
        success: false,
        summary: `Error: ${errorMessage}`,
      });

      throw error;
    }
  }
}

export default CursorRunner;
