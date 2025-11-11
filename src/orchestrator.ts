import path from 'node:path';
import { consola } from 'consola';
import ora from 'ora';
import pLimit from 'p-limit';
import { simpleGit } from 'simple-git';
import chalk from 'chalk';
import { ALL_AGENTS, getAgentRunner } from './agents/index.js';
import type { AgentContext, AgentName } from './agents/types.js';
import { assertRequiredEnv, ensureEnvLoaded } from './util/env.js';
import {
  appendScratchpadEntry,
  appendTodo,
  ensureDir,
  writeFallbackFile,
  writeJsonFile,
} from './util/fs.js';
import { RunLogger } from './util/run-logger.js';
import {
  commitAll,
  createWorktree,
  ensureCleanRepo,
  ensureGitHubRepo,
  getRepoInfo,
  getRepoRoot,
  makeTaskId,
  pushBranch,
} from './git.js';
import { buildPrBody, createPullRequest } from './pr.js';

export type AgentExecutionSummary = {
  agent: AgentName;
  branch: string;
  worktreePath: string;
  commitSha?: string;
  prUrl?: string;
  fallbackFile?: string;
  changedFiles: number;
  error?: string;
};

export type OrchestratorOptions = {
  message: string;
  k: number;
  repo?: string;
  baseBranch: string;
  dryRun: boolean;
  agents?: string[];
  allowDirty: boolean;
  timeoutMs?: number;
  workRoot: string;
};

export type OrchestratorSummary = {
  taskId: string;
  message: string;
  baseBranch: string;
  repoDir: string;
  dryRun: boolean;
  runRoot: string;
  agents: AgentExecutionSummary[];
};

const SCRATCHPAD_FILENAME = 'scratchpad.md';
const TODO_FILENAME = 'todo.md';

export async function runOb1(options: OrchestratorOptions): Promise<OrchestratorSummary> {
  ensureEnvLoaded();

  // Determine which agents will be used
  const requestedAgents = options.agents?.length
    ? options.agents.filter((agent): agent is AgentName => (ALL_AGENTS as string[]).includes(agent))
    : [...ALL_AGENTS];

  // Only validate env keys for agents that will actually be used
  const { assertAgentEnv } = await import('./util/env.js');
  assertAgentEnv(requestedAgents);

  // Check if repo is a GitHub URL
  let repoDir: string;
  if (options.repo && options.repo.includes('github.com')) {
    // GitHub URL provided - ensure it exists and clone if necessary
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is required when using a GitHub repository URL');
    }
    repoDir = await ensureGitHubRepo(options.repo, githubToken);
  } else {
    // Local path or no repo specified - use existing logic
    repoDir = await getRepoRoot(options.repo);
  }

  await ensureCleanRepo(repoDir, options.allowDirty);

  const taskId = makeTaskId();
  const runRoot = path.resolve('runs', taskId);
  await ensureDir(runRoot);

  const workRoot = path.resolve(options.workRoot ?? 'work');
  await ensureDir(workRoot);

  // requestedAgents already determined above for env validation
  if (requestedAgents.length === 0) {
    throw new Error('No valid agents selected.');
  }

  const selectedAgents = requestedAgents.slice(0, Math.min(options.k, requestedAgents.length));
  if (selectedAgents.length < options.k) {
    consola.warn(
      `Requested ${options.k} agents but only ${selectedAgents.length} available. Proceeding with available agents.`,
    );
  }

  const repoInfo = options.dryRun ? null : await getRepoInfo(repoDir);
  const logger = new RunLogger(path.join(runRoot, 'run.jsonl'));

  consola.start(`Starting ob1 run with agents: ${selectedAgents.join(', ')} (taskId=${taskId})`);
  await logger.log({ event: 'start', taskId, agents: selectedAgents, message: options.message });

  const agentContexts: AgentContext[] = [];
  for (const agent of selectedAgents) {
    const branch = `agent/${agent}/${taskId}`;
    const worktreeDir = path.join(workRoot, agent, taskId);
    await createWorktree(repoDir, worktreeDir, branch, options.baseBranch);

    const ob1Dir = path.join(worktreeDir, '.ob1');
    await ensureDir(ob1Dir);
    const scratchpadPath = path.join(ob1Dir, SCRATCHPAD_FILENAME);
    const todoPath = path.join(ob1Dir, TODO_FILENAME);
    await appendScratchpadEntry(scratchpadPath, `Task: ${options.message}`);
    await appendTodo(todoPath, 'Initialise ob1 run', true);

    agentContexts.push({
      name: agent,
      dir: worktreeDir,
      branch,
      prompt: options.message,
      scratchpadPath,
      todoPath,
      taskId,
      runRoot,
    });
  }

  const limit = pLimit(options.k);
  const executionSummaries: AgentExecutionSummary[] = [];

  let failure: unknown = null;

  await Promise.all(
    agentContexts.map((context) =>
      limit(async () => {
        const spinner = ora({ text: `[${context.name}] preparing worktree`, spinner: 'dots' }).start();
        const runner = getAgentRunner(context.name);
        try {
          await logger.log({ event: 'agent:start', agent: context.name, branch: context.branch });
          runner.checkEnv();
          spinner.text = `[${context.name}] running agent`;
          const result = await runner.run(context);
          if (result.notes) {
            for (const note of result.notes) {
              await appendScratchpadEntry(context.scratchpadPath, note);
            }
          }

          const git = simpleGit(context.dir);
          let status = await git.status();
          const hasMeaningfulChanges = status.files.some((file) => !file.path.startsWith('.ob1/'));
          let changedFiles = status.files.length;
          if (!hasMeaningfulChanges) {
            spinner.text = `[${context.name}] applying fallback`;
            const fallbackMessage = `Agent ${context.name} produced no changes. Fallback file generated by orchestrator.`;
            const fallbackFilePath = await writeFallbackFile(context.dir, context.name, fallbackMessage);
            const fallbackFile = path.relative(context.dir, fallbackFilePath);
            await appendScratchpadEntry(context.scratchpadPath, `Fallback file created: ${fallbackFile}`);
            await appendTodo(context.todoPath, 'Fallback summary file generated', true);
            status = await git.status();
            changedFiles = status.files.length;
            result.fallbackFile = fallbackFile;
          }

          if (status.isClean()) {
            throw new Error('Agent completed without producing any file changes.');
          }

          spinner.text = `[${context.name}] committing changes`;
          const commitMessage = `ob1(${context.name}): ${options.message}`;
          const commitSha = await commitAll(context.dir, commitMessage);
          if (!commitSha) {
            throw new Error('Failed to create commit.');
          }

          spinner.text = `[${context.name}] post-commit checks`;
          changedFiles = changedFiles || (await git.diff(['--name-only', 'HEAD^', 'HEAD'])).split('\n').filter(Boolean).length;

          let prUrl: string | undefined;

          // QA agents don't push/create PRs - they generate test artifacts that GitHub Actions uploads
          const isQaAgent = context.name === 'qa';

          if (isQaAgent) {
            consola.info(`[${context.name}] QA agent completed - test artifacts ready for GitHub Actions to upload`);
            await appendScratchpadEntry(context.scratchpadPath, 'QA agent completed: Test results and videos generated. GitHub Actions will upload artifacts.');
          } else if (!options.dryRun && repoInfo) {
            spinner.text = `[${context.name}] pushing branch`;
            await pushBranch(context.dir, context.branch);

            spinner.text = `[${context.name}] creating PR`;
            const prTitle = `[ob1] Agent: ${context.name} — ${options.message}`;
            const prBody = buildPrBody({
              agent: context.name,
              branch: context.branch,
              message: options.message,
              changedFiles,
            });
            prUrl = await createPullRequest(process.env.GITHUB_TOKEN as string, {
              owner: repoInfo.owner,
              repo: repoInfo.name,
              base: options.baseBranch,
              head: context.branch,
              title: prTitle,
              body: prBody,
            });
            await appendScratchpadEntry(context.scratchpadPath, `PR created: ${prUrl}`);
            await appendTodo(context.todoPath, 'PR opened', true);
          } else {
            await appendScratchpadEntry(context.scratchpadPath, 'Dry run: skipping push and PR creation.');
          }

          await appendTodo(context.todoPath, 'ob1 run completed', true);

          const summary: AgentExecutionSummary = {
            agent: context.name,
            branch: context.branch,
            worktreePath: context.dir,
            commitSha,
            prUrl,
            fallbackFile: result.fallbackFile,
            changedFiles,
          };
          executionSummaries.push(summary);
          await logger.log({ event: 'agent:success', agent: context.name, branch: context.branch, commitSha, prUrl });
          spinner.succeed(`[${context.name}] completed${prUrl ? ` → ${chalk.cyan(prUrl)}` : ''}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          executionSummaries.push({
            agent: context.name,
            branch: context.branch,
            worktreePath: context.dir,
            changedFiles: 0,
            error: message,
          });
          await logger.log({ event: 'agent:error', agent: context.name, branch: context.branch, error: message });
          spinner.fail(`[${context.name}] failed: ${message}`);
          if (!failure) {
            failure = error;
          }
        }
      }),
    ),
  );

  const summary: OrchestratorSummary = {
    taskId,
    message: options.message,
    baseBranch: options.baseBranch,
    repoDir,
    dryRun: options.dryRun,
    runRoot,
    agents: executionSummaries,
  };

  await appendScratchpadEntry(
    path.join(repoDir, '.ob1', SCRATCHPAD_FILENAME),
    `Run ${taskId} completed for agents: ${selectedAgents.join(', ')}`,
  ).catch(() => undefined);

  await writeJsonFile(path.join(runRoot, 'summary.json'), summary);
  await logger.log({
    event: failure ? 'finish:with-error' : 'finish',
    taskId,
    agents: executionSummaries.map((agent) => agent.agent),
  });

  for (const agent of executionSummaries) {
    consola.info(
      `${chalk.bold(agent.agent)} → ${agent.prUrl ? chalk.cyan(agent.prUrl) : agent.error ? chalk.red(agent.error) : 'dry run'}`,
    );
  }

  if (failure) {
    throw failure;
  }

  return summary;
}
