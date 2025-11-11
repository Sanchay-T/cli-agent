import { consola } from 'consola';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { loadMcpServers } from '../util/mcp.js';
import { AgentLogger } from '../util/agent-logger.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class ClaudeRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY must be set to run the Claude agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[claude] Starting autonomous agent for task: ${context.prompt}`);

    // Initialize detailed logger
    const logger = new AgentLogger(context.name, context.taskId, context.runRoot);
    await logger.init();
    await logger.logStart(context.prompt);

    // Initialize scratchpad
    await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
    await appendTodo(context.todoPath, 'Initialize Claude Agent SDK', false);

    const startTime = Date.now();

    // Set up timeout (default 10 minutes)
    const timeoutMs = 600000; // 10 minutes
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      consola.warn(`[claude] Timeout reached after ${timeoutMs}ms, aborting...`);
      abortController.abort();
    }, timeoutMs);

    try {
      // Create system prompt for autonomous operation
      const systemPrompt = `You are an autonomous coding agent working on a software development task.

Task: ${context.prompt}

Working directory: ${context.dir}
Branch: ${context.branch}

Instructions:
- Complete the task by reading, editing, creating, and deleting files as needed
- Use the available tools (Read, Write, Edit, Glob, Grep, Bash) to accomplish the task
- Work autonomously - all your actions will be automatically executed
- When you're done, provide a clear summary of the changes you made
- Focus on writing clean, working code that fulfills the task requirements`;

      await appendScratchpadEntry(context.scratchpadPath, 'Starting Claude Agent SDK query...');
      const mcpServers = await loadMcpServers(context.dir);

      // Start the query with appropriate options
      const result = query({
        prompt: context.prompt,
        options: {
          cwd: context.dir,
          permissionMode: 'bypassPermissions', // Fully autonomous
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
          systemPrompt,
          model: 'claude-sonnet-4-5-20250929',
          maxTurns: 50, // Prevent infinite loops
          abortController,
          settingSources: [], // Don't load filesystem settings
          mcpServers,
        },
      });

      // Stream messages and collect results
      const messages: SDKMessage[] = [];
      let finalResult: SDKResultMessage | null = null;
      let turnCount = 0;

      for await (const message of result) {
        messages.push(message);

        // Log assistant messages to scratchpad (truncated) and detailed logger
        if (message.type === 'assistant') {
          turnCount++;
          const content = message.message.content[0];
          if (content && 'text' in content && content.text) {
            const preview = content.text.substring(0, 150);
            await appendScratchpadEntry(
              context.scratchpadPath,
              `Turn ${turnCount}: ${preview}${content.text.length > 150 ? '...' : ''}`,
            );

            // Log full thought to detailed logger
            await logger.logThought(turnCount, content.text);
          }

          // Log tool calls if present
          for (const item of message.message.content) {
            if (item.type === 'tool_use') {
              await logger.logToolCall(turnCount, item.name, item.input as Record<string, unknown>);
            }
          }
        }

        // Log tool results
        if (message.type === 'user' && message.message.content) {
          for (const item of message.message.content) {
            if (item.type === 'tool_result') {
              const success = !item.is_error;
              const result = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
              await logger.logToolResult(
                turnCount,
                item.tool_use_id || 'unknown',
                success,
                success ? result : undefined,
                success ? undefined : result,
              );
            }
          }
        }

        // Capture final result
        if (message.type === 'result') {
          finalResult = message;
        }
      }

      clearTimeout(timeoutId);

      // Handle missing result
      if (!finalResult) {
        throw new Error('No final result received from Claude Agent SDK');
      }

      // Handle error results
      if (finalResult.subtype === 'error_during_execution') {
        await appendScratchpadEntry(context.scratchpadPath, 'Error: Execution failed');
        const errorMessages = 'errors' in finalResult ? finalResult.errors.join(', ') : 'Unknown error';
        throw new Error(`Claude encountered an error during execution: ${errorMessages}`);
      }

      // Extract summary based on result type
      let summary: string;
      if (finalResult.subtype === 'success') {
        summary = finalResult.result;
        await appendScratchpadEntry(context.scratchpadPath, `Final result: ${finalResult.result}`);
      } else {
        // error_max_turns or error_max_budget_usd
        const errorMessages = 'errors' in finalResult ? finalResult.errors.join(', ') : 'Task incomplete';
        summary = `Task incomplete: ${errorMessages}`;
        await appendScratchpadEntry(context.scratchpadPath, `Warning: ${summary}`);
      }

      // Log completion
      await appendTodo(context.todoPath, 'Claude Agent SDK execution completed', true);

      // Build notes with metadata
      const notes: string[] = [
        `Duration: ${finalResult.duration_ms}ms (${(finalResult.duration_ms / 1000).toFixed(1)}s)`,
        `Cost: $${finalResult.total_cost_usd.toFixed(4)} USD`,
        `Tokens: ${finalResult.usage.input_tokens} input, ${finalResult.usage.output_tokens} output`,
        `Turns: ${finalResult.num_turns}`,
      ];

      if (finalResult.subtype === 'error_max_turns') {
        notes.push('⚠️  Warning: Reached maximum turns limit');
      }

      if (finalResult.subtype === 'error_max_budget_usd') {
        notes.push('⚠️  Warning: Reached maximum budget');
      }

      if (finalResult.permission_denials && finalResult.permission_denials.length > 0) {
        notes.push(`Permission denials: ${finalResult.permission_denials.length}`);
      }

      consola.success(`[claude] Task completed in ${finalResult.num_turns} turns`);
      consola.info(`[claude] Cost: $${finalResult.total_cost_usd.toFixed(4)}`);

      // Log completion to detailed logger
      const duration_ms = Date.now() - startTime;
      await logger.logComplete({
        turns: finalResult.num_turns,
        duration_ms,
        cost_usd: finalResult.total_cost_usd,
        success: finalResult.subtype === 'success',
        summary,
      });

      return {
        agent: context.name,
        summary,
        notes,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Log error to scratchpad and detailed logger
      const errorMessage = error instanceof Error ? error.message : String(error);
      await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);
      await logger.logError(errorMessage);

      // Log failed completion
      const duration_ms = Date.now() - startTime;
      await logger.logComplete({
        turns: 0,
        duration_ms,
        success: false,
        summary: `Error: ${errorMessage}`,
      });

      throw error;
    }
  }
}

export default ClaudeRunner;
