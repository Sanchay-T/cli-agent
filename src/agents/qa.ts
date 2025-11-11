import { consola } from 'consola';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { loadMcpServers } from '../util/mcp.js';
import { AgentLogger } from '../util/agent-logger.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class QaRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY must be set to run the QA agent.');
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

    // Declare heartbeatInterval outside try/catch so it's accessible in catch block
    let heartbeatInterval: NodeJS.Timeout | null = null;

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

PHASE 4: TEST DESIGN - Plan Comprehensive Workflow-Based Tests

**CRITICAL: Design tests as USER JOURNEYS, not atomic test cases**

Your goal: Create a small number of comprehensive test workflows that tell complete stories.

Decision Framework (you decide based on feature complexity):
1. **Analyze Feature Scope**:
   - How many distinct user paths are there?
   - What's the natural flow a user would follow?
   - Which scenarios logically group together?

2. **Plan Workflow Groups** (NOT individual assertions):
   - Group related scenarios into complete user journeys
   - Each workflow = one comprehensive video
   - Aim for the MINIMUM number of workflows that provide MAXIMUM coverage

3. **Determine Optimal Video Count** (YOU decide):
   - Simple feature (1-2 pages, basic flow): Consider 2-3 workflows
   - Medium feature (multiple pages, several interactions): Consider 3-5 workflows
   - Complex feature (multi-step process, many states): Consider 4-6 workflows
   - **Key principle**: Prefer fewer, longer videos over many short ones

4. **Workflow Design Patterns**:

   **Pattern A: Primary Journey** (the happy path)
   - Complete end-to-end successful user flow
   - Covers main feature functionality
   - Shows all key UI elements in natural usage
   - Example: "Complete Login and Dashboard Journey"

   **Pattern B: Validation & Errors** (edge cases together)
   - All error states and validation in ONE workflow
   - Form validation, error messages, boundary conditions
   - Example: "Form Validation and Error Handling"

   **Pattern C: Advanced Features** (secondary functionality)
   - Settings, preferences, admin features, etc.
   - Group related secondary features together
   - Example: "User Settings and Preferences"

   **Pattern D: State Management** (auth, sessions, persistence)
   - Login/logout, session handling, redirects
   - Group authentication-related scenarios
   - Example: "Authentication and Session Management"

5. **Self-Check Your Plan**:
   - ❓ Am I creating too many small, repetitive tests?
   - ❓ Could these 3 tests be combined into 1 comprehensive workflow?
   - ❓ Would a reviewer understand the feature from just these videos?
   - ❓ Am I testing the same setup multiple times unnecessarily?
   - ✅ Each workflow should tell a complete, reviewable story

**OUTPUT**: A plan with 2-6 comprehensive workflow test suites (you decide the optimal number)

PHASE 5: TEST IMPLEMENTATION - Write Workflow-Based Playwright Tests

**Structure tests as COMPLETE USER JOURNEYS:**

✅ **GOOD Example - Workflow-Based:**
\`\`\`typescript
import { test, expect } from '@playwright/test';

test.describe('Complete User Journey - Primary Flow', () => {
  test('should complete full login, dashboard interaction, and logout', async ({ page }) => {
    // This ONE test = ONE comprehensive video showing entire feature

    // Step 1: Navigate and verify login page loads
    await page.goto('http://localhost:8000');
    await expect(page.locator('h1')).toContainText('Login');
    await expect(page.locator('#email')).toBeVisible();

    // Step 2: Fill credentials and submit
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // Step 3: Verify redirect and dashboard loads
    await page.waitForURL('**/dashboard.html');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.stats-card')).toHaveCount(4);

    // Step 4: Test navigation functionality
    await page.click('text=Analytics');
    await expect(page.locator('.nav-item.active')).toContainText('Analytics');
    await page.click('text=Settings');
    await expect(page.locator('.nav-item.active')).toContainText('Settings');

    // Step 5: Verify user info displays
    await expect(page.locator('.user-email')).toContainText('test@example.com');

    // Step 6: Complete logout and verify
    await page.click('text=Logout');
    await page.waitForURL('**/index.html');
    await expect(page.locator('h1')).toContainText('Login');
  });
});

test.describe('Form Validation and Error Handling', () => {
  test('should handle all validation and error scenarios', async ({ page }) => {
    // This ONE test = ONE video showing all error cases

    await page.goto('http://localhost:8000');

    // Test 1: Invalid email format (HTML5 validation)
    await page.fill('#email', 'invalid-email');
    await page.fill('#password', 'test123');
    await page.click('button[type="submit"]');
    // Verify HTML5 validation message appears

    // Test 2: Empty fields
    await page.fill('#email', '');
    await page.fill('#password', '');
    await page.click('button[type="submit"]');
    // Verify required field validation

    // Test 3: Wrong password
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Invalid');
  });
});
\`\`\`

❌ **BAD Example - Atomic/Fragmented:**
\`\`\`typescript
// DO NOT DO THIS - creates too many small videos!
test('should display login page', ...);         // Video 1
test('should show email field', ...);           // Video 2
test('should show password field', ...);        // Video 3
test('should have submit button', ...);         // Video 4
test('should allow login', ...);                // Video 5
// Result: 5 short videos instead of 1 comprehensive one
\`\`\`

**Best Practices for Workflow Tests:**
- Use descriptive names that explain the complete journey
- Include multiple related assertions in each test
- Think: "What story does this video tell?"
- Each test should be 1-3 minutes of actual user interaction
- Group setup/teardown to avoid repetition across videos
- Use test.describe() to organize workflow groups

**Video Recording**:
- Each test() block = ONE video
- Playwright automatically records with video settings in config
- Your workflow grouping directly controls video count
- Fewer test() blocks = fewer, more comprehensive videos

**Video Quality & Pacing** (CRITICAL for reviewer experience):

Videos are for HUMAN TESTERS to review. They must be watchable and clear.

**Configuration** (Add to playwright.config.ts):
- Set video size to HD: { width: 1280, height: 720 } (good balance of quality and content fit)
- Match viewport to video size so content fills the frame
- Enable trace: 'on' for detailed debugging
- Example config structure to use:
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000
  }
- Alternative for larger screens: 1366x768 (common laptop size)
- Avoid 1920x1080 unless the app is specifically designed for large screens

**Test Execution Pacing** (Add strategic waits for better video clarity):
- After page navigation: await page.waitForLoadState('networkidle') or page.waitForTimeout(800)
- After form submission: Small pause (500-800ms) before checking results
- After clicks/interactions: Brief pause (300-500ms) to show state changes
- Between test phases: Pause (500ms) to create visual separation
- Goal: Reviewers should clearly see each action and its result
- NOT too fast (reviewer can't follow) - NOT too slow (wastes time)
- Sweet spot: Each significant action visible for 0.5-1 second

Example pattern with good pacing:
  1. Fill form field -> wait 300ms (let viewer see value)
  2. Fill next field -> wait 300ms
  3. Click submit -> wait 800ms (show submission and response)
  4. Check result message
This creates videos that are easy to follow and review.

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

      // ========== DIAGNOSTIC LOGGING: Validate SDK Environment ==========
      consola.info('[qa] PRE-SDK DIAGNOSTICS:');

      // 1. Check environment variables
      const envVars = {
        CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? `present (${process.env.CLAUDE_API_KEY.substring(0, 8)}...)` : 'MISSING',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `present (${process.env.ANTHROPIC_API_KEY.substring(0, 8)}...)` : 'not set',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'present' : 'MISSING',
        NODE_ENV: process.env.NODE_ENV || 'not set',
        CI: process.env.CI || 'not set',
        HOME: process.env.HOME || 'not set',
      };
      consola.info('[qa] Environment variables:', envVars);
      await appendScratchpadEntry(context.scratchpadPath, `Env check: ${JSON.stringify(envVars, null, 2)}`);

      // 2. Check working directory and filesystem
      const fs = await import('node:fs/promises');
      try {
        const dirContents = await fs.readdir(context.dir);
        consola.info('[qa] Working directory contents:', dirContents.slice(0, 10));
        await appendScratchpadEntry(context.scratchpadPath, `CWD: ${context.dir}, Files: ${dirContents.length}`);
      } catch (err) {
        consola.error('[qa] Failed to read working directory:', err);
        await appendScratchpadEntry(context.scratchpadPath, `ERROR: Cannot read CWD - ${err}`);
      }

      // 3. Check if SDK package is available
      try {
        const sdkPath = require.resolve('@anthropic-ai/claude-agent-sdk');
        consola.info('[qa] SDK package resolved at:', sdkPath);
        await appendScratchpadEntry(context.scratchpadPath, `SDK found: ${sdkPath}`);
      } catch (err) {
        consola.error('[qa] SDK package NOT FOUND:', err);
        await appendScratchpadEntry(context.scratchpadPath, `ERROR: SDK not found - ${err}`);
      }

      // 4. Check TTY availability
      const ttyStatus = {
        stdin_isTTY: process.stdin.isTTY || false,
        stdout_isTTY: process.stdout.isTTY || false,
        stderr_isTTY: process.stderr.isTTY || false,
      };
      consola.info('[qa] TTY status:', ttyStatus);
      await appendScratchpadEntry(context.scratchpadPath, `TTY: ${JSON.stringify(ttyStatus)}`);

      // 5. Node version and platform
      const systemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      };
      consola.info('[qa] System info:', systemInfo);
      await appendScratchpadEntry(context.scratchpadPath, `System: ${JSON.stringify(systemInfo)}`);

      consola.info('[qa] Starting SDK query() call...');
      await appendScratchpadEntry(context.scratchpadPath, 'Calling SDK query()...');
      // ========== END DIAGNOSTIC LOGGING ==========

      // ========== CRITICAL FIX: Clean environment variables ==========
      // The Claude CLI subprocess inherits environment variables from the parent process.
      // In GitHub Actions (and other CI environments), NODE_OPTIONS and VSCODE_INSPECTOR_OPTIONS
      // cause the subprocess to crash with exit code 1 when it tries to attach to debuggers.
      // Reference: https://github.com/anthropics/claude-code/issues/4619
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_OPTIONS;
      delete cleanEnv.VSCODE_INSPECTOR_OPTIONS;

      consola.info('[qa] Environment cleaned for subprocess');
      await appendScratchpadEntry(context.scratchpadPath, 'Environment cleaned: removed NODE_OPTIONS, VSCODE_INSPECTOR_OPTIONS');
      // ========== END ENVIRONMENT CLEANING ==========

      // Start the query with QA-focused options
      let result;
      try {
        result = query({
          prompt:
            'Review this pull request by analyzing changes, setting up the project, writing Playwright tests, and reporting results.',
          options: {
            cwd: context.dir,
            env: cleanEnv, // Pass cleaned environment to subprocess
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
        consola.info('[qa] SDK query() call succeeded, generator created');
        await appendScratchpadEntry(context.scratchpadPath, 'SDK query() succeeded');
      } catch (error) {
        consola.error('[qa] SDK query() call FAILED:', error);
        await appendScratchpadEntry(context.scratchpadPath, `FATAL: SDK query() failed - ${error}`);
        throw new Error(`Failed to initialize SDK query: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Stream messages and collect results
      const messages: SDKMessage[] = [];
      let finalResult: SDKResultMessage | null = null;
      let turnCount = 0;

      consola.info('[qa] SDK query() returned, starting message stream...');
      await appendScratchpadEntry(context.scratchpadPath, 'SDK initialized, receiving messages...');

      // ========== ULTRA-VERBOSE LOGGING FOR CI DEBUGGING ==========
      let messageCount = 0;
      let lastLogTime = Date.now();

      // Heartbeat to prove process is alive
      heartbeatInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        consola.info(`[qa] ❤️ HEARTBEAT at ${elapsed}s - Messages: ${messageCount}, Turn: ${turnCount}, Alive: true`);
      }, 5000); // Every 5 seconds

      try {
        consola.info('[qa] 🔄 Entering message loop...');

        for await (const message of result) {
          messageCount++;
          const loopStartTime = Date.now();
          const elapsed = ((loopStartTime - startTime) / 1000).toFixed(1);

          // Log EVERY message with detailed info
          consola.info(`[qa] 📨 Message #${messageCount} at ${elapsed}s: type=${message.type}`);

          messages.push(message);

          // Extra verbose logging for first few messages
          if (messageCount <= 5) {
            consola.info(`[qa] 🔍 Message #${messageCount} details: type=${message.type}, hasContent=${!!(message as any).message?.content}`);
          }

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
      } catch (streamError) {
        consola.error('[qa] Error during message streaming:', streamError);
        await appendScratchpadEntry(context.scratchpadPath, `FATAL: Message streaming failed - ${streamError}`);
        throw new Error(`SDK message stream failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
      }

      consola.info(`[qa] Message stream complete, received ${messages.length} messages`);
      await appendScratchpadEntry(context.scratchpadPath, `Received ${messages.length} messages from SDK`);

      // CRITICAL: Clear heartbeat interval to allow process to exit
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        consola.info('[qa] ✓ Heartbeat interval cleared');
      }

      clearTimeout(timeoutId);

      // CRITICAL: Kill any lingering child processes to ensure clean exit
      // The QA agent spawns: http-server, npm, playwright, chromium
      // These can prevent the process from exiting even after the agent completes
      consola.info('[qa] 🧹 Cleaning up child processes...');
      try {
        const { execSync } = await import('node:child_process');

        // Kill http-server processes (common dev server)
        try {
          execSync("pkill -f 'http-server' || true", { stdio: 'ignore' });
          consola.info('[qa] ✓ Killed http-server processes');
        } catch (e) {
          // Ignore errors - process might not exist
        }

        // Kill any chromium/playwright browser processes
        try {
          execSync("pkill -f 'chromium' || pkill -f 'chrome' || true", { stdio: 'ignore' });
          consola.info('[qa] ✓ Killed browser processes');
        } catch (e) {
          // Ignore errors - process might not exist
        }

        // Kill any node processes running dev servers on common ports
        try {
          execSync("lsof -ti:8000,8080,3000,5000 | xargs kill -9 2>/dev/null || true", { stdio: 'ignore' });
          consola.info('[qa] ✓ Killed dev servers on common ports');
        } catch (e) {
          // Ignore errors - ports might not be in use
        }

        consola.info('[qa] ✅ Cleanup complete');
      } catch (cleanupError) {
        consola.warn('[qa] ⚠️  Cleanup had issues (non-fatal):', cleanupError);
      }

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
      // CRITICAL: Clear heartbeat interval to allow process to exit
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      clearTimeout(timeoutId);

      // CRITICAL: Kill any lingering child processes even on error
      consola.info('[qa] 🧹 Cleaning up child processes (error path)...');
      try {
        const { execSync } = await import('node:child_process');
        execSync("pkill -f 'http-server' || true", { stdio: 'ignore' });
        execSync("pkill -f 'chromium' || pkill -f 'chrome' || true", { stdio: 'ignore' });
        execSync("lsof -ti:8000,8080,3000,5000 | xargs kill -9 2>/dev/null || true", { stdio: 'ignore' });
        consola.info('[qa] ✅ Cleanup complete (error path)');
      } catch (cleanupError) {
        consola.warn('[qa] ⚠️  Cleanup had issues (non-fatal):', cleanupError);
      }

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
