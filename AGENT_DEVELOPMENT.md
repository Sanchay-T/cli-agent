# Agent Development Guide

This guide explains how to add new AI coding agents to ob1. ob1 is an orchestrator that runs multiple coding agents in parallel on separate git worktrees, allowing you to compare their approaches to solving the same task.

## Table of Contents

1. [Agent Interface](#agent-interface)
2. [Implementation Guide](#implementation-guide)
3. [Agent Lifecycle](#agent-lifecycle)
4. [AgentContext](#agentcontext)
5. [Scratchpad Logging](#scratchpad-logging)
6. [TODO Logging](#todo-logging)
7. [Environment Validation](#environment-validation)
8. [Error Handling](#error-handling)
9. [Testing New Agents](#testing-new-agents)
10. [Integration](#integration)
11. [Complete Example](#complete-example)
12. [Agent Comparison](#agent-comparison)

---

## Agent Interface

All agents must implement the `AgentRunner` interface defined in `src/agents/types.ts`:

```typescript
export interface AgentRunner {
  checkEnv(): Promise<void> | void;
  run(context: AgentContext): Promise<AgentRunResult>;
}
```

### Methods

#### `checkEnv()`
- **Purpose**: Validates environment prerequisites (API keys, CLI tools, etc.)
- **When Called**: Before any agent is executed
- **Returns**: `void` or `Promise<void>`
- **Throws**: Error if prerequisites are not met

#### `run(context: AgentContext)`
- **Purpose**: Executes the agent's task in its dedicated worktree
- **When Called**: After environment validation passes
- **Returns**: `Promise<AgentRunResult>` with summary and metadata
- **Throws**: Error if execution fails

---

## Implementation Guide

Follow these steps to create a new agent:

### Step 1: Create Agent File

Create a new file in `src/agents/` following the naming convention: `{agent-name}.ts`

```typescript
import { consola } from 'consola';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class MyAgentRunner implements AgentRunner {
  checkEnv(): void {
    // Validate prerequisites
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    // Implement agent logic
  }
}

export default MyAgentRunner;
```

### Step 2: Implement `checkEnv()`

Validate all required environment variables and dependencies:

```typescript
checkEnv(): void {
  if (!process.env.MY_AGENT_API_KEY) {
    throw new Error('MY_AGENT_API_KEY must be set to run the MyAgent agent.');
  }

  // Check for additional dependencies if needed
  // e.g., CLI tools, config files, etc.
}
```

### Step 3: Implement `run()`

Implement the core agent logic following the pattern:

```typescript
async run(context: AgentContext): Promise<AgentRunResult> {
  // 1. Log task start
  consola.info(`[myagent] Starting autonomous agent for task: ${context.prompt}`);

  // 2. Initialize scratchpad and TODO
  await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
  await appendTodo(context.todoPath, 'Initialize MyAgent', false);

  try {
    // 3. Set up timeout
    const timeoutMs = 600000; // 10 minutes

    // 4. Execute agent-specific logic
    // ... your agent implementation ...

    // 5. Log completion
    await appendTodo(context.todoPath, 'MyAgent execution completed', true);

    // 6. Return result
    return {
      agent: context.name,
      summary: 'Task completed successfully',
      notes: ['Duration: 123s', 'Additional metadata'],
    };
  } catch (error) {
    // 7. Log error
    const errorMessage = error instanceof Error ? error.message : String(error);
    await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);
    throw error;
  }
}
```

### Step 4: Update Type Definitions

Add your agent name to the `AgentName` type in `src/agents/types.ts`:

```typescript
export type AgentName = 'codex' | 'claude' | 'cursor' | 'myagent';
```

### Step 5: Register Agent

Register your agent in `src/agents/index.ts`:

```typescript
import { MyAgentRunner } from './myagent.js';

const runnerMap: Record<AgentName, AgentRunner> = {
  codex: new CodexRunner(),
  claude: new ClaudeRunner(),
  cursor: new CursorRunner(),
  myagent: new MyAgentRunner(),
};

export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor', 'myagent'];
```

---

## Agent Lifecycle

The orchestrator follows this execution flow for each agent:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Environment Validation                                   │
│    - orchestrator calls checkEnv() for all agents           │
│    - Throws error if any validation fails                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Worktree Creation                                        │
│    - Creates isolated git worktree for each agent           │
│    - Branch name: ob1-{taskId}-{agentName}                  │
│    - Each agent has its own working directory               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Agent Execution (Parallel)                               │
│    - orchestrator calls run(context) for each agent         │
│    - Agents work independently in their worktrees           │
│    - Progress logged to .ob1/scratchpad-{agent}.txt         │
│    - TODOs logged to .ob1/todo-{agent}.txt                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Result Collection                                        │
│    - Agents return AgentRunResult                           │
│    - orchestrator displays summary and diffs                │
│    - User can review each agent's approach                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Points

- **Parallel Execution**: All agents run simultaneously
- **Isolation**: Each agent has its own git worktree (working directory)
- **Autonomy**: Agents should not require user interaction during execution
- **Logging**: Continuous logging to scratchpad and TODO files for transparency

---

## AgentContext

The `AgentContext` object provides all information needed for agent execution:

```typescript
export type AgentContext = {
  name: AgentName;          // Agent identifier (e.g., 'claude', 'codex')
  dir: string;              // Absolute path to agent's worktree directory
  branch: string;           // Git branch name for this agent
  prompt: string;           // User's task description
  scratchpadPath: string;   // Path to .ob1/scratchpad-{agent}.txt
  todoPath: string;         // Path to .ob1/todo-{agent}.txt
  taskId: string;           // Unique task identifier (timestamp-based)
};
```

### Usage Example

```typescript
async run(context: AgentContext): Promise<AgentRunResult> {
  // Access agent's working directory
  console.log(`Working in: ${context.dir}`);

  // Use agent name for logging
  consola.info(`[${context.name}] Starting task: ${context.prompt}`);

  // Log to agent-specific scratchpad
  await appendScratchpadEntry(context.scratchpadPath, 'Agent started');

  // All file operations should happen within context.dir
  const configPath = path.join(context.dir, 'package.json');
}
```

---

## Scratchpad Logging

The scratchpad is a real-time log that tracks the agent's progress. It's visible to users and helps with debugging.

### Logging Function

```typescript
import { appendScratchpadEntry } from '../util/fs.js';

// Log a message to the scratchpad
await appendScratchpadEntry(context.scratchpadPath, 'Message to log');
```

### Best Practices

1. **Initialize Early**: Log the task at the start
   ```typescript
   await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
   ```

2. **Log State Changes**: Track important transitions
   ```typescript
   await appendScratchpadEntry(context.scratchpadPath, 'Starting API call...');
   await appendScratchpadEntry(context.scratchpadPath, 'API call completed');
   ```

3. **Log Key Events**: Record significant actions
   ```typescript
   await appendScratchpadEntry(context.scratchpadPath, `Thread started: ${threadId}`);
   await appendScratchpadEntry(context.scratchpadPath, `Turn ${turnCount} completed`);
   ```

4. **Log Errors**: Always log errors before throwing
   ```typescript
   const errorMessage = error instanceof Error ? error.message : String(error);
   await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);
   ```

5. **Truncate Long Content**: Keep logs readable
   ```typescript
   const preview = longText.substring(0, 150);
   await appendScratchpadEntry(
     context.scratchpadPath,
     `Response: ${preview}${longText.length > 150 ? '...' : ''}`
   );
   ```

### Example: Claude Agent Scratchpad

```
Task: Add dark mode support to the application
Starting Claude Agent SDK query...
Turn 1: Reading application structure...
Turn 2: Creating dark mode theme configuration...
Turn 3: Updating component styles...
Files changed: create src/theme/dark.ts, edit src/App.tsx
Final result: Dark mode support has been added with a toggle in settings
```

---

## TODO Logging

TODOs track discrete tasks and their completion status. They provide a structured progress view.

### Logging Functions

```typescript
import { appendTodo } from '../util/fs.js';

// Add an incomplete TODO
await appendTodo(context.todoPath, 'Initialize agent SDK', false);

// Mark a TODO as complete
await appendTodo(context.todoPath, 'Agent SDK initialized', true);
```

### Best Practices

1. **Track Major Steps**: Log significant milestones
   ```typescript
   await appendTodo(context.todoPath, 'Initialize agent', false);
   await appendTodo(context.todoPath, 'Execute task', false);
   await appendTodo(context.todoPath, 'Finalize results', false);
   ```

2. **Update Status**: Mark items complete as you progress
   ```typescript
   await appendTodo(context.todoPath, 'API call completed', true);
   ```

3. **Be Specific**: Use descriptive task names
   ```typescript
   // Good
   await appendTodo(context.todoPath, 'Cursor agent created', true);

   // Less helpful
   await appendTodo(context.todoPath, 'Done', true);
   ```

### Example: Cursor Agent TODOs

```
[ ] Initialize Cursor Cloud Agent
[✓] Cursor agent created
[ ] Waiting for Cursor to complete
[✓] Cursor agent completed
[ ] Pulling changes to worktree
[✓] Changes pulled successfully
```

---

## Environment Validation

The `checkEnv()` method validates that all prerequisites are met before execution begins.

### Common Validations

#### 1. API Key Validation

```typescript
checkEnv(): void {
  if (!process.env.MY_AGENT_API_KEY) {
    throw new Error('MY_AGENT_API_KEY must be set to run the MyAgent agent.');
  }
}
```

#### 2. CLI Tool Validation

```typescript
import { execSync } from 'child_process';

checkEnv(): void {
  try {
    execSync('my-cli --version', { stdio: 'ignore' });
  } catch {
    throw new Error('my-cli is not installed. Install it with: npm install -g my-cli');
  }
}
```

#### 3. Configuration File Validation

```typescript
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

checkEnv(): void {
  const configPath = path.join(homedir(), '.myagent', 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
}
```

#### 4. Multiple Requirements

```typescript
checkEnv(): void {
  const errors: string[] = [];

  if (!process.env.MY_AGENT_API_KEY) {
    errors.push('MY_AGENT_API_KEY must be set');
  }

  if (!process.env.MY_AGENT_BASE_URL) {
    errors.push('MY_AGENT_BASE_URL must be set');
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}
```

### Testing Environment Validation

```bash
# Test that checkEnv() throws without API key
unset MY_AGENT_API_KEY
npm run ob1 -- -a myagent "test task"  # Should fail with clear error

# Test that checkEnv() passes with API key
export MY_AGENT_API_KEY="test-key"
npm run ob1 -- -a myagent "test task"  # Should proceed to execution
```

---

## Error Handling

Robust error handling ensures failures are reported clearly and debugging is straightforward.

### Error Handling Pattern

```typescript
async run(context: AgentContext): Promise<AgentRunResult> {
  try {
    // Agent logic here

    return {
      agent: context.name,
      summary: 'Success',
      notes: [],
    };
  } catch (error) {
    // Log error to scratchpad
    const errorMessage = error instanceof Error ? error.message : String(error);
    await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);

    // Re-throw to let orchestrator handle it
    throw error;
  }
}
```

### Timeout Handling

#### Approach 1: AbortController (Claude)

```typescript
const timeoutMs = 600000; // 10 minutes
const abortController = new AbortController();
const timeoutId = setTimeout(() => {
  consola.warn(`[${context.name}] Timeout reached after ${timeoutMs}ms, aborting...`);
  abortController.abort();
}, timeoutMs);

try {
  // Pass abortController to API calls
  await apiCall({ abortController });
  clearTimeout(timeoutId);
} catch (error) {
  clearTimeout(timeoutId);
  throw error;
}
```

#### Approach 2: Promise.race (Codex)

```typescript
const timeoutMs = 600000; // 10 minutes
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => {
    reject(new Error(`Timeout reached after ${timeoutMs}ms`));
  }, timeoutMs);
});

const taskPromise = executeTask();

const result = await Promise.race([taskPromise, timeoutPromise]);
```

### API Error Handling

```typescript
private async apiRequest<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    let errorMessage = `API error (${response.status}): ${errorText}`;

    // Add helpful hints for common errors
    if (response.status === 401) {
      errorMessage += '\n\nCheck that your API key is valid and not expired.';
    }

    if (response.status === 403) {
      errorMessage += '\n\nCheck that your API key has the necessary permissions.';
    }

    throw new Error(errorMessage);
  }

  return response.json();
}
```

### Graceful Degradation

```typescript
try {
  const detailedResult = await getDetailedResult();
  return formatDetailedResult(detailedResult);
} catch (error) {
  consola.warn(`[${context.name}] Failed to get detailed result, using basic info`);
  await appendScratchpadEntry(
    context.scratchpadPath,
    `Warning: ${error.message}. Continuing with basic result.`
  );
  return formatBasicResult();
}
```

---

## Testing New Agents

### Manual Testing Checklist

#### 1. Environment Validation

```bash
# Test without API key
unset MY_AGENT_API_KEY
npm run ob1 -- -a myagent "simple task"
# Expected: Clear error about missing API key

# Test with API key
export MY_AGENT_API_KEY="your-key-here"
npm run ob1 -- -a myagent "simple task"
# Expected: Proceeds to execution
```

#### 2. Basic Execution

```bash
# Test simple task
npm run ob1 -- -a myagent "create a hello.txt file with 'Hello World'"

# Verify:
# - Agent completes without errors
# - Scratchpad shows progress
# - TODO list tracks steps
# - Changes appear in git diff
```

#### 3. Error Handling

```bash
# Test with invalid API key
export MY_AGENT_API_KEY="invalid-key"
npm run ob1 -- -a myagent "simple task"
# Expected: Clear error message about authentication

# Test timeout (if applicable)
npm run ob1 -- -a myagent "extremely complex task that might timeout"
# Expected: Timeout error after configured duration
```

#### 4. Logging Verification

```bash
# Run a task
npm run ob1 -- -a myagent "add a new feature"

# Check scratchpad
cat .ob1-{taskId}-myagent/.ob1/scratchpad-myagent.txt
# Expected: Clear progression of steps

# Check TODO
cat .ob1-{taskId}-myagent/.ob1/todo-myagent.txt
# Expected: List of completed and pending tasks
```

#### 5. Multi-Agent Testing

```bash
# Test alongside other agents
npm run ob1 -- -a myagent,claude "implement authentication"

# Verify:
# - Both agents run in parallel
# - Each has its own worktree
# - Results are clearly separated
# - Comparison view shows differences
```

### Automated Testing

Create unit tests in `src/agents/__tests__/myagent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyAgentRunner } from '../myagent.js';
import type { AgentContext } from '../types.js';

describe('MyAgentRunner', () => {
  let runner: MyAgentRunner;

  beforeEach(() => {
    runner = new MyAgentRunner();
  });

  describe('checkEnv', () => {
    it('throws when API key is missing', () => {
      delete process.env.MY_AGENT_API_KEY;
      expect(() => runner.checkEnv()).toThrow('MY_AGENT_API_KEY must be set');
    });

    it('passes when API key is present', () => {
      process.env.MY_AGENT_API_KEY = 'test-key';
      expect(() => runner.checkEnv()).not.toThrow();
    });
  });

  describe('run', () => {
    it('returns AgentRunResult on success', async () => {
      // Mock context
      const context: AgentContext = {
        name: 'myagent',
        dir: '/tmp/test',
        branch: 'test-branch',
        prompt: 'test task',
        scratchpadPath: '/tmp/scratchpad.txt',
        todoPath: '/tmp/todo.txt',
        taskId: 'test-123',
      };

      // Mock API calls
      vi.mock('your-agent-sdk', () => ({
        execute: vi.fn().mockResolvedValue({ success: true }),
      }));

      const result = await runner.run(context);

      expect(result).toHaveProperty('agent', 'myagent');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('notes');
    });
  });
});
```

---

## Integration

Follow this checklist to fully integrate your new agent:

### Integration Checklist

- [ ] **Create agent file**: `src/agents/myagent.ts`
  - [ ] Implement `AgentRunner` interface
  - [ ] Add `checkEnv()` method
  - [ ] Add `run()` method
  - [ ] Include proper error handling
  - [ ] Add scratchpad and TODO logging

- [ ] **Update type definitions**: `src/agents/types.ts`
  - [ ] Add agent name to `AgentName` type
  ```typescript
  export type AgentName = 'codex' | 'claude' | 'cursor' | 'myagent';
  ```

- [ ] **Register agent**: `src/agents/index.ts`
  - [ ] Import agent runner
  ```typescript
  import { MyAgentRunner } from './myagent.js';
  ```
  - [ ] Add to `runnerMap`
  ```typescript
  const runnerMap: Record<AgentName, AgentRunner> = {
    // ... existing agents
    myagent: new MyAgentRunner(),
  };
  ```
  - [ ] Add to `ALL_AGENTS` array
  ```typescript
  export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor', 'myagent'];
  ```

- [ ] **Update documentation**
  - [ ] Add to README.md
  - [ ] Document required environment variables
  - [ ] Add example usage
  - [ ] Update agent comparison table

- [ ] **Testing**
  - [ ] Test environment validation
  - [ ] Test basic execution
  - [ ] Test error handling
  - [ ] Test logging output
  - [ ] Test multi-agent execution
  - [ ] Add unit tests (optional but recommended)

- [ ] **Environment setup**
  - [ ] Update `.env.example` with required variables
  ```bash
  # MyAgent Configuration
  MY_AGENT_API_KEY=your-api-key-here
  MY_AGENT_BASE_URL=https://api.myagent.com
  ```

---

## Complete Example

Here's a complete stub implementation for a new agent called "example":

### src/agents/example.ts

```typescript
import { consola } from 'consola';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

/**
 * ExampleRunner demonstrates a minimal agent implementation.
 * Replace this with your actual agent SDK integration.
 */
export class ExampleRunner implements AgentRunner {
  /**
   * Validates that all required environment variables are set.
   * Throws an error if prerequisites are not met.
   */
  checkEnv(): void {
    if (!process.env.EXAMPLE_API_KEY) {
      throw new Error('EXAMPLE_API_KEY must be set to run the Example agent.');
    }
  }

  /**
   * Executes the agent's task in its dedicated worktree.
   *
   * @param context - Contains all information needed for execution
   * @returns AgentRunResult with summary and metadata
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[example] Starting autonomous agent for task: ${context.prompt}`);

    // Initialize scratchpad and TODO tracking
    await appendScratchpadEntry(context.scratchpadPath, `Task: ${context.prompt}`);
    await appendTodo(context.todoPath, 'Initialize Example Agent', false);

    // Track start time for duration calculation
    const startTime = Date.now();

    // Set up timeout (default 10 minutes)
    const timeoutMs = 600000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout reached after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      // Log initialization
      await appendScratchpadEntry(context.scratchpadPath, 'Connecting to Example API...');

      // Initialize your agent SDK here
      // Example: const client = new ExampleClient({ apiKey: process.env.EXAMPLE_API_KEY });

      await appendTodo(context.todoPath, 'Initialize Example Agent', true);
      await appendTodo(context.todoPath, 'Execute task', false);

      // Execute the main task
      const taskPromise = this.executeTask(context);
      const result = await Promise.race([taskPromise, timeoutPromise]);

      await appendTodo(context.todoPath, 'Execute task', true);

      // Calculate duration
      const duration = Date.now() - startTime;

      // Log completion
      await appendScratchpadEntry(
        context.scratchpadPath,
        `Task completed in ${(duration / 1000).toFixed(1)}s`
      );

      // Build notes with metadata
      const notes: string[] = [
        `Duration: ${(duration / 1000).toFixed(1)}s`,
        `Working directory: ${context.dir}`,
        `Branch: ${context.branch}`,
      ];

      // Add additional metadata if available
      if (result.tokensUsed) {
        notes.push(`Tokens used: ${result.tokensUsed}`);
      }

      if (result.cost) {
        notes.push(`Cost: $${result.cost.toFixed(4)}`);
      }

      consola.success(`[example] Task completed successfully`);

      return {
        agent: context.name,
        summary: result.summary || 'Task completed successfully',
        notes,
      };
    } catch (error) {
      // Log error to scratchpad for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      await appendScratchpadEntry(context.scratchpadPath, `Error: ${errorMessage}`);

      // Re-throw to let orchestrator handle the error
      throw error;
    }
  }

  /**
   * Executes the actual task using your agent SDK.
   * Replace this with your agent's implementation.
   */
  private async executeTask(context: AgentContext): Promise<{
    summary: string;
    tokensUsed?: number;
    cost?: number;
  }> {
    // Log progress
    await appendScratchpadEntry(context.scratchpadPath, 'Analyzing task requirements...');

    // Example: Call your agent SDK
    // const response = await client.execute({
    //   prompt: context.prompt,
    //   workingDirectory: context.dir,
    // });

    // Simulate agent work (replace with actual implementation)
    await this.simulateWork(context);

    // Log intermediate progress
    await appendScratchpadEntry(context.scratchpadPath, 'Generating solution...');

    // More agent work...
    await this.simulateWork(context);

    // Final logging
    await appendScratchpadEntry(context.scratchpadPath, 'Finalizing changes...');

    // Return result
    return {
      summary: 'Example agent completed the task',
      tokensUsed: 1000,
      cost: 0.02,
    };
  }

  /**
   * Simulates agent work for demonstration.
   * Remove this and replace with actual agent implementation.
   */
  private async simulateWork(context: AgentContext): Promise<void> {
    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Log progress
    await appendScratchpadEntry(
      context.scratchpadPath,
      `Processing in ${context.dir}...`
    );
  }
}

export default ExampleRunner;
```

### Integration Steps

1. **Update `src/agents/types.ts`**:
```typescript
export type AgentName = 'codex' | 'claude' | 'cursor' | 'example';
```

2. **Update `src/agents/index.ts`**:
```typescript
import { ExampleRunner } from './example.js';

const runnerMap: Record<AgentName, AgentRunner> = {
  codex: new CodexRunner(),
  claude: new ClaudeRunner(),
  cursor: new CursorRunner(),
  example: new ExampleRunner(),
};

export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor', 'example'];
```

3. **Update `.env.example`**:
```bash
# Example Agent Configuration
EXAMPLE_API_KEY=your-api-key-here
```

4. **Test the agent**:
```bash
export EXAMPLE_API_KEY="your-key"
npm run ob1 -- -a example "create a hello.txt file"
```

---

## Agent Comparison

Here's a comparison of the existing agents to help you understand different implementation approaches:

| Feature | Claude | Codex | Cursor |
|---------|--------|-------|--------|
| **SDK Used** | `@anthropic-ai/claude-agent-sdk` | `@openai/codex-sdk` | REST API (custom) |
| **Execution Mode** | Autonomous (local) | Autonomous (local) | Cloud-based |
| **API Key** | `CLAUDE_API_KEY` | `OPENAI_API_KEY` | `CURSOR_API_KEY` |
| **Timeout** | AbortController (10 min) | Promise.race (10 min) | API polling (10 min) |
| **Streaming** | Async iterator | Async iterator | Polling |
| **File Operations** | Direct (SDK tools) | Direct (SDK tools) | Git push/pull |
| **Progress Tracking** | Message events | Thread events | Status polling |
| **Cost Tracking** | Built-in (USD) | Estimated (tokens) | Not provided |
| **Model** | claude-sonnet-4-5 | GPT-4 (configurable) | Cursor's model |
| **MCP Support** | Yes | No | No |
| **Advantages** | Best integration, cost tracking, MCP servers | Fast, token caching, detailed events | No local setup, cloud compute |
| **Disadvantages** | Requires API key | Requires API key | Requires GitHub, Privacy Mode must be off |

### Implementation Patterns

#### Local SDK Pattern (Claude, Codex)
- Agent SDK runs locally
- Direct file system access
- Real-time streaming of events
- Full control over execution

```typescript
// Initialize SDK locally
const sdk = initializeSDK({ apiKey, workingDirectory });

// Stream events
for await (const event of sdk.run(prompt)) {
  // Handle events in real-time
  await logProgress(event);
}
```

#### Cloud API Pattern (Cursor)
- Agent runs in the cloud
- Git-based file synchronization
- Polling for status updates
- Less control, more managed

```typescript
// Create cloud agent
const agent = await api.createAgent({ prompt, repository, branch });

// Poll for completion
while (agent.status !== 'FINISHED') {
  await sleep(5000);
  agent = await api.getAgent(agent.id);
}

// Pull changes from cloud
await git.pull(agent.branch);
```

### When to Use Each Pattern

**Use Local SDK Pattern when**:
- You need real-time progress updates
- You want full control over execution
- The agent SDK provides good local tooling
- You need to integrate MCP servers or custom tools

**Use Cloud API Pattern when**:
- The agent doesn't provide a local SDK
- You want to offload compute to the cloud
- The API provides good status tracking
- Git-based workflow is acceptable

---

## Additional Resources

### Utilities

The following utility functions are available in `src/util/fs.js`:

```typescript
// Append a timestamped entry to the scratchpad
await appendScratchpadEntry(scratchpadPath: string, message: string): Promise<void>

// Append a TODO item (checked or unchecked)
await appendTodo(todoPath: string, task: string, completed: boolean): Promise<void>
```

### Logging with Consola

```typescript
import { consola } from 'consola';

consola.info('[agent] Informational message');
consola.success('[agent] Success message');
consola.warn('[agent] Warning message');
consola.error('[agent] Error message');
consola.debug('[agent] Debug message (only with DEBUG flag)');
```

### Git Operations

If your agent needs to interact with git:

```typescript
import { simpleGit } from 'simple-git';

const git = simpleGit(context.dir);

// Get current status
const status = await git.status();

// Get remote URL
const remotes = await git.getRemotes(true);

// Commit changes
await git.add('.');
await git.commit('Commit message');

// Push to remote
await git.push('origin', context.branch);
```

### Environment Variables

Access environment variables using `process.env`:

```typescript
const apiKey = process.env.MY_AGENT_API_KEY;
const baseUrl = process.env.MY_AGENT_BASE_URL || 'https://default.api.com';
const timeout = parseInt(process.env.AGENT_TIMEOUT || '600000', 10);
```

---

## Best Practices Summary

1. **Environment Validation**
   - Always validate prerequisites in `checkEnv()`
   - Provide clear error messages
   - Check for API keys, CLI tools, and config files

2. **Logging**
   - Log task start and completion
   - Track progress in scratchpad
   - Use TODOs for discrete tasks
   - Always log errors before throwing

3. **Error Handling**
   - Catch all errors in `run()`
   - Log to scratchpad before re-throwing
   - Provide helpful error messages
   - Clean up resources in finally blocks

4. **Timeouts**
   - Always implement timeouts
   - Default to 10 minutes
   - Log timeout warnings
   - Clean up when timeout occurs

5. **Result Reporting**
   - Provide clear summaries
   - Include relevant metadata in notes
   - Report costs and token usage when available
   - Keep summaries concise (under 500 chars)

6. **Testing**
   - Test environment validation
   - Test basic execution
   - Test error cases
   - Test alongside other agents

7. **Documentation**
   - Update README.md
   - Update .env.example
   - Document required setup
   - Include usage examples

---

## Support

For questions or issues:

1. Check existing agent implementations for reference
2. Review the orchestrator code in `src/orchestrator.ts`
3. Test with `--dry-run` flag first
4. Enable debug logging with `DEBUG=cursor` or `VERBOSE=true`

Happy agent building!
