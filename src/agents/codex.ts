import { Codex } from '@openai/codex-sdk';
import type { ThreadEvent, Usage, ThreadItem } from '@openai/codex-sdk';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';
import { logger } from '../util/logger.js';

export class CodexRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set to run the Codex agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    logger.info(`[codex] Starting autonomous agent for task: ${context.prompt}`);

    // Initialize scratchpad
    await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
    await appendTodo(context.todoPath, 'Initialize Codex Agent SDK', false);

    // Set up timeout (default 10 minutes)
    const timeoutMs = 600000; // 10 minutes
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout reached after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      // Initialize Codex with API key
      const codex = new Codex({
        apiKey: process.env.OPENAI_API_KEY,
      });

      await appendScratchpadEntry(context.scratchpadPath, 'Starting Codex Agent SDK...');

      // Start a new thread with appropriate options
      const thread = codex.startThread({
        workingDirectory: context.dir,
        skipGitRepoCheck: false, // We're in a git worktree
        sandboxMode: 'workspace-write', // Allow file edits
        networkAccessEnabled: false, // Keep it local
        webSearchEnabled: false, // Don't need web search
        approvalPolicy: 'never', // Fully autonomous - never ask for approval
      });

      // Run the task with streaming to capture events
      const runPromise = (async () => {
        const { events } = await thread.runStreamed(context.prompt);

        let turnCount = 0;
        let finalResponse = '';
        let usage: Usage | null = null;
        const items: ThreadItem[] = [];

        // Stream events and log progress
        for await (const event of events) {
          switch (event.type) {
            case 'thread.started':
              await appendScratchpadEntry(
                context.scratchpadPath,
                `Thread started: ${event.thread_id}`,
              );
              break;

            case 'turn.started':
              turnCount++;
              await appendScratchpadEntry(context.scratchpadPath, `Turn ${turnCount} started`);
              break;

            case 'turn.completed':
              usage = event.usage;
              await appendScratchpadEntry(
                context.scratchpadPath,
                `Turn ${turnCount} completed - Tokens: ${event.usage.input_tokens} input, ${event.usage.output_tokens} output`,
              );
              break;

            case 'turn.failed':
              await appendScratchpadEntry(
                context.scratchpadPath,
                `Turn ${turnCount} failed: ${event.error.message}`,
              );
              throw new Error(`Turn failed: ${event.error.message}`);

            case 'item.started':
              // Log item starts for visibility
              if (event.item.type === 'agent_message') {
                await appendScratchpadEntry(context.scratchpadPath, 'Agent is responding...');
              } else if (event.item.type === 'command_execution') {
                await appendScratchpadEntry(
                  context.scratchpadPath,
                  `Executing: ${event.item.command}`,
                );
              } else if (event.item.type === 'file_change') {
                const changeCount = event.item.changes.length;
                await appendScratchpadEntry(
                  context.scratchpadPath,
                  `Applying ${changeCount} file change(s)...`,
                );
              }
              break;

            case 'item.completed':
              items.push(event.item);
              // Log completed items
              if (event.item.type === 'agent_message') {
                finalResponse = event.item.text;
                const preview = event.item.text.substring(0, 150);
                await appendScratchpadEntry(
                  context.scratchpadPath,
                  `Response: ${preview}${event.item.text.length > 150 ? '...' : ''}`,
                );
              } else if (event.item.type === 'file_change') {
                const changes = event.item.changes
                  .map((c) => `${c.kind} ${c.path}`)
                  .join(', ');
                await appendScratchpadEntry(
                  context.scratchpadPath,
                  `Files changed: ${changes}`,
                );
              } else if (event.item.type === 'command_execution') {
                await appendScratchpadEntry(
                  context.scratchpadPath,
                  `Command completed with exit code: ${event.item.exit_code ?? 'N/A'}`,
                );
              }
              break;

            case 'error':
              await appendScratchpadEntry(context.scratchpadPath, `Error: ${event.message}`);
              throw new Error(`Thread error: ${event.message}`);

            default:
              // Handle other event types if needed
              break;
          }
        }

        return {
          items,
          finalResponse,
          usage,
          turnCount,
        };
      })();

      // Race between the task execution and timeout
      const result = await Promise.race([runPromise, timeoutPromise]);

      // Log completion
      await appendTodo(context.todoPath, 'Codex Agent SDK execution completed', true);

      // Build summary
      let summary = result.finalResponse || 'Task completed';

      // Truncate summary if too long
      if (summary.length > 500) {
        summary = summary.substring(0, 500) + '...';
      }

      await appendScratchpadEntry(context.scratchpadPath, `Final result: ${summary}`);

      // Build notes with metadata
      const notes: string[] = [];

      if (result.usage) {
        notes.push(
          `Tokens: ${result.usage.input_tokens} input (${result.usage.cached_input_tokens} cached), ${result.usage.output_tokens} output`,
        );
        // Estimate cost (approximate pricing for GPT-4 as placeholder)
        // Input: ~$0.01 per 1K tokens, Output: ~$0.03 per 1K tokens
        const inputCost = ((result.usage.input_tokens - result.usage.cached_input_tokens) * 0.01) / 1000;
        const cachedCost = (result.usage.cached_input_tokens * 0.0025) / 1000; // Cached is typically 75% off
        const outputCost = (result.usage.output_tokens * 0.03) / 1000;
        const totalCost = inputCost + cachedCost + outputCost;
        notes.push(`Estimated Cost: $${totalCost.toFixed(4)} USD`);
      }

      notes.push(`Turns: ${result.turnCount}`);

      // Count file changes
      const fileChanges = result.items.filter((item: ThreadItem) => item.type === 'file_change');
      if (fileChanges.length > 0) {
        const totalChanges = fileChanges.reduce(
          (acc: number, item: ThreadItem) => acc + (item.type === 'file_change' ? item.changes.length : 0),
          0,
        );
        notes.push(`File changes: ${totalChanges} file(s) modified`);
      }

      // Count commands executed
      const commands = result.items.filter((item: ThreadItem) => item.type === 'command_execution');
      if (commands.length > 0) {
        notes.push(`Commands executed: ${commands.length}`);
      }

      logger.info(`[codex] Task completed in ${result.turnCount} turn(s)`);
      if (result.usage) {
        const totalTokens =
          result.usage.input_tokens + result.usage.output_tokens;
        logger.info(`[codex] Total tokens: ${totalTokens.toLocaleString()}`);
      }

      return {
        agent: context.name,
        summary,
        notes,
      };
    } catch (error) {
      // Log error to scratchpad
      const errorMessage = error instanceof Error ? error.message : String(error);
      await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);

      throw error;
    }
  }
}

export default CodexRunner;
