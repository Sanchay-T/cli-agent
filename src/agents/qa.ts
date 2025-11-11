import { consola } from 'consola';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { loadMcpServers } from '../util/mcp.js';
import { AgentLogger } from '../util/agent-logger.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class QaRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY must be set to run the QA agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[qa] Starting QA agent for PR review`);

    // Initialize detailed logger
    const logger = new AgentLogger(context.name, context.taskId, context.runRoot);
    await logger.init();
    await logger.logStart(context.prompt);

    // Initialize scratchpad
    await appendScratchpadEntry(context.scratchpadPath, `Task: QA Review for PR`);
    await appendTodo(context.todoPath, 'Initialize QA Agent', false);

    const startTime = Date.now();

    // Set up timeout (15 minutes for QA tasks - might need more time for setup+testing)
    const timeoutMs = 900000; // 15 minutes
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      consola.warn(`[qa] Timeout reached after ${timeoutMs}ms, aborting...`);
      abortController.abort();
    }, timeoutMs);

    try {
      // Create universal QA system prompt
      const systemPrompt = `You are a senior QA engineer responsible for reviewing pull requests through automated testing.

Working directory: ${context.dir}
Branch: ${context.branch}

YOUR MISSION:
Review this PR by discovering what feature was implemented, setting up the project, writing comprehensive Playwright tests, recording video proof, and reporting results.

YOUR WORKFLOW (6 Phases):

PHASE 1: DISCOVERY - Understand What Changed
- Run 'git diff HEAD~1' to see what code changed in this PR
- Read the modified files to understand the implementation
- Identify what user-facing features were added
- Note the scope of changes (new pages, components, API endpoints, etc.)
- DO NOT assume what the feature is - discover it from the code

PHASE 2: PROJECT UNDERSTANDING - Learn How to Run It
- Read README.md to understand:
  * Project type (static HTML, React, Vue, Next.js, etc.)
  * How to install dependencies (npm, yarn, pnpm)
  * How to start the dev server
  * What port the app runs on
  * What's the entry point (index.html, /login, etc.)
- Check package.json for available scripts
- Identify the tech stack and testing requirements

PHASE 3: PROJECT SETUP - Get It Running
- Install dependencies using the correct package manager
- Run any necessary build steps
- Start the development server
- Wait for server to be ready (check the port, don't hardcode timeouts)
- Verify you can access the app
- Keep server running in background for testing

PHASE 4: TEST DESIGN - Plan Your Tests
- Based on what you discovered in Phase 1, plan test scenarios
- Cover all new user interactions and features
- Consider edge cases and error states
- Think through the happy path and failure paths
- Plan assertions that prove the feature works

PHASE 5: TEST IMPLEMENTATION - Write Playwright Tests
- Create a test file: tests/pr-feature.spec.ts
- Write comprehensive tests using Playwright best practices:
  * Use proper page navigation
  * Use reliable selectors (data-testid preferred, then role, then text)
  * Use proper waiting strategies (waitForSelector, waitForURL, etc.)
  * NO arbitrary delays like page.waitForTimeout(5000)
  * Add clear, descriptive test names
  * Include proper assertions for UI elements and behavior
  * Test both success and failure scenarios

Example pattern:
\`\`\`typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should allow user to perform action', async ({ page }) => {
    await page.goto('http://localhost:PORT/entry.html');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/success.html');
    await expect(page.locator('.welcome-message')).toBeVisible();
  });
});
\`\`\`

PHASE 6: EXECUTION & REPORTING - Run Tests and Report
- Install Playwright if needed: npm install -D @playwright/test
- Install browser: npx playwright install chromium
- Run tests with video recording: npx playwright test --video=on --screenshot=on
- Check test results
- If tests PASS: Document success, note video location
- If tests FAIL: Analyze WHY (see Failure Handling below)

FAILURE HANDLING (CRITICAL):

When tests fail, determine the root cause:

Case A: YOUR TEST CODE HAS ISSUES (selectors, timing, logic)
- Symptoms: Test can't find elements, timing issues, wrong assertions
- Action: FIX your test code and retry
- Iterate until tests are correct
- This is YOUR responsibility - get the tests working

Case B: THE FEATURE CODE HAS BUGS (implementation issues)
- Symptoms: Feature doesn't work as expected, errors in console, wrong behavior
- Action: Document the bug clearly and prepare a PR comment
- DO NOT try to fix the feature code - that's not your job
- Format your finding for PR comment:

  ## QA Review Results ❌

  **Test Status**: Failed
  **Reason**: Feature implementation has issues

  ### Issues Found:
  1. [Describe specific issue]
  2. [Steps to reproduce]
  3. [Expected vs Actual behavior]

  ### Test Details:
  - Test file: tests/pr-feature.spec.ts
  - Video: test-results/[path]/video.webm

  ### Recommendation:
  [What needs to be fixed]

TOOLS AVAILABLE:
- Read: Read any file
- Write: Create new files (tests, configs)
- Edit: Modify existing files
- Bash: Execute commands (git, npm, playwright, server management)
- Grep: Search for patterns in code
- Glob: Find files by pattern

BEST PRACTICES:
- Never assume - always verify by reading files
- Be adaptable - every project is different
- Think like a user - test real workflows
- Be thorough - edge cases matter
- Communicate clearly - your reports guide decisions
- If you encounter issues, debug systematically
- Keep server running while tests execute
- Clean up background processes when done

REPORTING FORMAT:

If tests pass:
## QA Review Results ✅

**Test Status**: All tests passing
**Feature Tested**: [What you tested]
**Test Coverage**: [What scenarios you covered]

### Test Details:
- Test file: tests/pr-feature.spec.ts
- Video proof: test-results/[path]/video.webm
- Screenshots: test-results/screenshots/

### Summary:
[Brief summary of what works]

START YOUR WORK:
Begin by running 'git diff HEAD~1' to discover what changed in this PR. Then proceed through all 6 phases systematically.`;

      await appendScratchpadEntry(context.scratchpadPath, 'Starting QA analysis and testing...');
      const mcpServers = await loadMcpServers(context.dir);

      // Start the query with QA-focused options
      const result = query({
        prompt:
          'Review this pull request by analyzing changes, setting up the project, writing Playwright tests, and reporting results.',
        options: {
          cwd: context.dir,
          permissionMode: 'bypassPermissions', // Fully autonomous
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
          systemPrompt,
          model: 'claude-sonnet-4-5-20250929',
          maxTurns: 100, // QA might need more turns (setup, test writing, retry)
          abortController,
          settingSources: [],
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
        throw new Error('No final result received from QA Agent');
      }

      // Handle error results
      if (finalResult.subtype === 'error_during_execution') {
        await appendScratchpadEntry(context.scratchpadPath, 'Error: QA execution failed');
        const errorMessages = 'errors' in finalResult ? finalResult.errors.join(', ') : 'Unknown error';
        throw new Error(`QA agent encountered an error: ${errorMessages}`);
      }

      // Extract summary based on result type
      let summary: string;
      if (finalResult.subtype === 'success') {
        summary = finalResult.result;
        await appendScratchpadEntry(context.scratchpadPath, `QA Review Complete: ${finalResult.result}`);
      } else {
        // error_max_turns or error_max_budget_usd
        const errorMessages = 'errors' in finalResult ? finalResult.errors.join(', ') : 'QA review incomplete';
        summary = `QA review incomplete: ${errorMessages}`;
        await appendScratchpadEntry(context.scratchpadPath, `Warning: ${summary}`);
      }

      // Log completion
      await appendTodo(context.todoPath, 'QA Agent execution completed', true);

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

      consola.success(`[qa] QA review completed in ${finalResult.num_turns} turns`);
      consola.info(`[qa] Cost: $${finalResult.total_cost_usd.toFixed(4)}`);

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

export default QaRunner;
