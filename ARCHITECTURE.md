# ob1 Orchestrator Architecture

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Breakdown](#2-component-breakdown)
3. [Data Flow](#3-data-flow)
4. [Agent Execution Model](#4-agent-execution-model)
5. [Git Worktree Isolation](#5-git-worktree-isolation)
6. [Concurrency Management](#6-concurrency-management)
7. [Error Handling](#7-error-handling)
8. [Design Decisions](#8-design-decisions)
9. [File Structure](#9-file-structure)
10. [Technology Stack](#10-technology-stack)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI Entry Point                         │
│                           (src/cli.ts)                           │
│                                                                   │
│  Command Parser (Commander.js) → Validates Options → runOb1()   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Core Engine                      │
│                     (src/orchestrator.ts)                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Environment Validation (util/env.ts)                 │   │
│  │ 2. Repository Setup (git.ts)                            │   │
│  │ 3. Worktree Creation (git.ts)                           │   │
│  │ 4. Agent Initialization (agents/index.ts)               │   │
│  │ 5. Parallel Execution (p-limit)                         │   │
│  │ 6. Result Collection & PR Creation (pr.ts)              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   Codex     │  │   Claude    │  │   Cursor    │
    │   Agent     │  │   Agent     │  │   Agent     │
    │             │  │             │  │             │
    │  OpenAI     │  │  Anthropic  │  │   Cursor    │
    │  Codex SDK  │  │  Agent SDK  │  │  Cloud API  │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           ▼                ▼                ▼
    ┌──────────────────────────────────────────────┐
    │         Git Worktree Isolation               │
    │                                              │
    │  work/codex/    work/claude/   work/cursor/ │
    │    <taskId>       <taskId>       <taskId>   │
    │                                              │
    │  Each agent operates in isolated worktree   │
    └──────────────────────────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────┐
    │         Git Operations & PR Creation         │
    │                                              │
    │  1. Commit changes in worktree               │
    │  2. Push branch to origin                    │
    │  3. Create PR via GitHub API (Octokit)       │
    └──────────────────────────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────┐
    │         Run Artifacts & Logging              │
    │                                              │
    │  runs/<taskId>/                              │
    │    ├── run.jsonl     (event stream)          │
    │    └── summary.json  (execution summary)     │
    │                                              │
    │  work/<agent>/<taskId>/.ob1/                 │
    │    ├── scratchpad.md (agent notes)           │
    │    └── todo.md       (task tracking)         │
    └──────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 CLI Entry Point (`src/cli.ts`)

**Purpose**: Command-line interface and user interaction.

**Key Features**:
- Parses CLI arguments using Commander.js
- Validates required options (`-m` message, `-k` agent count)
- Provides `doctor` command for environment diagnostics
- Handles error reporting and exit codes

**Code Snippet** (lines 42-86):
```typescript
program
  .option('-m, --message <message>', 'Task message shared with all agents')
  .option('-k <count>', 'Number of agents to run in parallel (max 3)')
  .option('--repo <repo>', 'Target repository (URL or local path)')
  .option('--base <branch>', 'Base branch to start from', 'main')
  .option('--agents <agents>', 'Comma-separated list of agents')
  .option('--dry', 'Dry run: skip pushing commits and creating PRs')
  .option('--allow-dirty', 'Allow running with a dirty repository state')
  .option('--timeout-ms <timeout>', 'Per-agent timeout in milliseconds')
  .option('--work-root <path>', 'Custom work directory root', 'work')
```

---

### 2.2 Orchestrator Core (`src/orchestrator.ts`)

**Purpose**: Main coordination logic for parallel agent execution.

**Key Responsibilities**:
1. **Environment Setup** (lines 66-74):
   - Load `.env` file
   - Validate API keys for all agents
   - Determine repository root
   - Create run directories

2. **Agent Selection** (lines 79-91):
   - Filter requested agents
   - Limit to `k` agents
   - Warn if fewer agents available than requested

3. **Worktree Provisioning** (lines 99-121):
   - Create isolated git worktrees for each agent
   - Initialize `.ob1/` tracking directory
   - Set up `scratchpad.md` and `todo.md` files

4. **Parallel Execution** (lines 123-232):
   - Use `p-limit` to control concurrency
   - Execute agents in parallel with spinners (ora)
   - Handle agent failures gracefully
   - Collect execution summaries

5. **Post-Execution** (lines 234-266):
   - Write summary JSON
   - Log final results
   - Display PR URLs or error messages

**Critical Code Section** (lines 128-232):
```typescript
await Promise.all(
  agentContexts.map((context) =>
    limit(async () => {
      const spinner = ora({ text: `[${context.name}] preparing worktree` }).start();
      const runner = getAgentRunner(context.name);
      try {
        // Run agent
        const result = await runner.run(context);

        // Check for meaningful changes
        if (!hasMeaningfulChanges) {
          // Create fallback file
          await writeFallbackFile(context.dir, context.name, fallbackMessage);
        }

        // Commit changes
        const commitSha = await commitAll(context.dir, commitMessage);

        // Push and create PR
        if (!options.dryRun) {
          await pushBranch(context.dir, context.branch);
          prUrl = await createPullRequest(token, {...});
        }

        executionSummaries.push({ agent, branch, commitSha, prUrl, ... });
      } catch (error) {
        // Track failure
        executionSummaries.push({ agent, branch, error: message, ... });
      }
    })
  )
);
```

---

### 2.3 Git Operations (`src/git.ts`)

**Purpose**: All git-related operations including worktrees, commits, and pushes.

**Key Functions**:

1. **`getRepoRoot(repo?: string)`** (lines 12-20):
   - Resolves absolute path to git repository
   - Uses `git revparse --show-toplevel` if no path provided

2. **`ensureCleanRepo(repoDir: string, allowDirty: boolean)`** (lines 22-28):
   - Checks for uncommitted changes
   - Throws error unless `--allow-dirty` flag is set

3. **`createWorktree(repoDir, worktreeDir, branch, baseBranch)`** (lines 30-45):
   - Removes existing worktree if present (`--force`)
   - Creates new worktree with `git worktree add -B <branch>`
   - Starts from specified base branch

4. **`commitAll(worktreeDir: string, message: string)`** (lines 54-63):
   - Stages all changes with `git add .`
   - Creates commit with standardized message format
   - Returns commit SHA

5. **`pushBranch(worktreeDir: string, branch: string)`** (lines 65-68):
   - Pushes branch to origin with upstream tracking
   - Sets up branch for PR creation

6. **`getRepoInfo(repoDir: string)`** (lines 70-81):
   - Extracts owner/repo from git remote URL
   - Supports SSH, HTTPS, and local paths
   - Required for GitHub API calls

7. **`makeTaskId()`** (lines 121-125):
   - Generates unique task identifier
   - Format: `YYYYMMDDHHmmss-<random>`
   - Example: `20251111134523-a7x9`

**Worktree Creation Logic** (lines 30-45):
```typescript
export async function createWorktree(
  repoDir: string,
  worktreeDir: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  await ensureDir(path.dirname(worktreeDir));
  // Remove existing worktree (idempotent)
  await execa('git', ['worktree', 'remove', worktreeDir, '--force'], {
    cwd: repoDir,
    reject: false,
  });
  await ensureDir(worktreeDir);
  // Create new worktree from base branch
  await execa('git', ['worktree', 'add', '-B', branch, worktreeDir, baseBranch], {
    cwd: repoDir,
  });
}
```

---

### 2.4 Pull Request Management (`src/pr.ts`)

**Purpose**: GitHub PR creation and formatting.

**Key Functions**:

1. **`createPullRequest(token, input)`** (lines 12-16):
   - Uses Octokit (GitHub REST API client)
   - Creates PR with title, body, base, and head branch
   - Returns HTML URL for PR

2. **`buildPrBody(options)`** (lines 18-25):
   - Formats PR description with agent metadata
   - Includes task message, changed files count
   - Adds checklist for reviewer

**PR Body Template**:
```markdown
## Agent
- Name: codex
- Branch: agent/codex/20251111134523-a7x9
- Task: "Add user authentication system"

## Summary
- Changed files: 12
- Notes: See .ob1/scratchpad.md

## Checklist
- [ ] Smoke-tested build
- [ ] TODOs triaged (see .ob1/todo.md)
```

---

### 2.5 Agent System

#### 2.5.1 Agent Registry (`src/agents/index.ts`)

**Purpose**: Central registry and factory for all agent implementations.

**Code** (lines 1-16):
```typescript
const runnerMap: Record<AgentName, AgentRunner> = {
  codex: new CodexRunner(),
  claude: new ClaudeRunner(),
  cursor: new CursorRunner(),
};

export function getAgentRunner(agent: AgentName): AgentRunner {
  return runnerMap[agent];
}

export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor'];
```

#### 2.5.2 Agent Types (`src/agents/types.ts`)

**Purpose**: Type definitions for agent interface.

**Key Types**:

```typescript
export type AgentName = 'codex' | 'claude' | 'cursor';

export type AgentContext = {
  name: AgentName;
  dir: string;              // Worktree directory
  branch: string;           // Git branch name
  prompt: string;           // User's task message
  scratchpadPath: string;   // .ob1/scratchpad.md
  todoPath: string;         // .ob1/todo.md
  taskId: string;           // Unique run identifier
};

export type AgentRunResult = {
  agent: AgentName;
  summary: string;          // High-level description of changes
  notes?: string[];         // Metadata (cost, tokens, duration)
  fallbackFile?: string;    // Path if no changes made
};

export interface AgentRunner {
  checkEnv(): Promise<void> | void;  // Validate API keys
  run(context: AgentContext): Promise<AgentRunResult>;
}
```

---

#### 2.5.3 Codex Agent (`src/agents/codex.ts`)

**Purpose**: OpenAI Codex autonomous agent integration.

**Key Features**:
- Uses `@openai/codex-sdk` package
- Streams events for progress tracking
- 10-minute timeout with abort mechanism
- Token usage and cost estimation

**Execution Flow** (lines 29-150):
```typescript
// 1. Initialize SDK
const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY });

// 2. Start thread with options
const thread = codex.startThread({
  workingDirectory: context.dir,
  skipGitRepoCheck: false,
  sandboxMode: 'workspace-write',  // Allow file edits
  networkAccessEnabled: false,     // Keep it local
  webSearchEnabled: false,
  approvalPolicy: 'never',         // Fully autonomous
});

// 3. Run with event streaming
const { events } = await thread.runStreamed(context.prompt);

// 4. Process events
for await (const event of events) {
  switch (event.type) {
    case 'turn.started': /* Log turn */ break;
    case 'item.completed': /* Track changes */ break;
    case 'error': /* Handle errors */ break;
  }
}

// 5. Return result with metadata
return { agent, summary, notes: [tokens, cost, turns, files, commands] };
```

**Event Types Tracked**:
- `thread.started` - Thread initialization
- `turn.started/completed/failed` - Execution turns
- `item.started/completed` - Individual actions (messages, commands, file changes)
- `error` - Execution errors

**Cost Estimation** (lines 171-177):
```typescript
// GPT-4 pricing (approximate)
const inputCost = ((result.usage.input_tokens - cached) * 0.01) / 1000;
const cachedCost = (cached * 0.0025) / 1000;  // 75% discount
const outputCost = (result.usage.output_tokens * 0.03) / 1000;
const totalCost = inputCost + cachedCost + outputCost;
```

---

#### 2.5.4 Claude Agent (`src/agents/claude.ts`)

**Purpose**: Anthropic Claude autonomous agent integration.

**Key Features**:
- Uses `@anthropic-ai/claude-agent-sdk` package
- MCP (Model Context Protocol) server support
- Permission bypass for full autonomy
- Detailed cost and token tracking

**Execution Flow** (lines 30-148):
```typescript
// 1. Create system prompt
const systemPrompt = `You are an autonomous coding agent...
Task: ${context.prompt}
Working directory: ${context.dir}
Instructions:
- Complete the task by reading, editing, creating files
- Use available tools (Read, Write, Edit, Glob, Grep, Bash)
- Work autonomously - all actions auto-executed
- Provide clear summary when done`;

// 2. Load MCP servers (optional)
const mcpServers = await loadMcpServers(context.dir);

// 3. Run query with streaming
const result = query({
  prompt: context.prompt,
  options: {
    cwd: context.dir,
    permissionMode: 'bypassPermissions',  // Fully autonomous
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    systemPrompt,
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 50,
    abortController,
    mcpServers,
  },
});

// 4. Stream messages and collect results
for await (const message of result) {
  if (message.type === 'assistant') { /* Log turn */ }
  if (message.type === 'result') { finalResult = message; }
}

// 5. Extract summary and metadata
return {
  agent,
  summary: finalResult.result,
  notes: [duration, cost, tokens, turns, warnings],
};
```

**Result Subtypes**:
- `success` - Task completed successfully
- `error_max_turns` - Reached 50-turn limit
- `error_max_budget_usd` - Exceeded budget cap
- `error_during_execution` - Runtime error

**MCP Server Integration** (lines 47):
- Loads custom MCP servers from `mcp.config.json`
- Enables extended tool capabilities
- Optional - falls back gracefully if not configured

---

#### 2.5.5 Cursor Agent (`src/agents/cursor.ts`)

**Purpose**: Cursor Cloud Agent API integration.

**Key Features**:
- REST API client for Cursor Cloud
- GitHub repository requirement
- Remote branch push/pull workflow
- Status polling with 5-second intervals

**Execution Flow** (lines 214-312):
```typescript
// 1. Get repository URL
const repoUrl = await this.getRepositoryUrl(context.dir);
// Must be GitHub: https://github.com/owner/repo

// 2. Commit current worktree state
await this.commitWorktree(context.dir);

// 3. Push as base branch for Cursor
const baseBranch = `${context.branch}-base`;
await this.pushBaseBranch(context.dir, context.branch, baseBranch);

// 4. Create Cursor agent via API
const createResponse = await this.apiRequest('POST', '/agents', {
  prompt: { text: context.prompt },
  source: { repository: repoUrl, ref: baseBranch },
  target: { branchName: `${context.branch}-cursor`, autoCreatePr: false },
});

// 5. Poll for completion (5-second intervals, 10-min timeout)
const completedAgent = await this.pollAgentStatus(
  createResponse.id,
  context.scratchpadPath,
  600000
);

// 6. Pull Cursor's changes back to worktree
await this.pullCursorChanges(context.dir, completedAgent.target.branchName);

// 7. Return result
return { agent, summary: completedAgent.summary, notes };
```

**API Authentication** (lines 49-51):
```typescript
const headers = {
  'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
};
```

**Error Handling** (lines 89-107):
- Detects 403 "Storage mode disabled" error
- Provides actionable fix instructions
- Guides user to enable Cloud Agents in Cursor settings

**Branch Strategy**:
1. Local worktree branch: `agent/cursor/<taskId>`
2. Pushed base branch: `agent/cursor/<taskId>-base`
3. Cursor's output branch: `agent/cursor/<taskId>-cursor`
4. Final worktree contains Cursor's changes

---

### 2.6 Utility Modules

#### 2.6.1 Environment Management (`src/util/env.ts`)

**Purpose**: Environment variable loading and validation.

**Required Variables**:
```typescript
const REQUIRED_ENV_KEYS = [
  'CLAUDE_API_KEY',     // Anthropic API key
  'CODEX_CLI_KEY',      // OpenAI Codex key (legacy name)
  'OPENAI_API_KEY',     // OpenAI API key
  'CURSOR_API_KEY',     // Cursor Cloud API key
  'GITHUB_TOKEN',       // GitHub personal access token
] as const;
```

**Key Functions**:

1. **`ensureEnvLoaded()`** (lines 32-34):
   - Loads `.env` file from project root
   - Uses dotenv package
   - Idempotent (only loads once)

2. **`assertRequiredEnv(keys?)`** (lines 41-48):
   - Validates presence of API keys
   - Throws descriptive error with missing keys
   - Called at orchestrator start

3. **`runDoctor()`** (lines 50-65):
   - CLI diagnostic command
   - Displays ✅/❌ for each required key
   - Sets exit code if any missing

---

#### 2.6.2 Filesystem Utilities (`src/util/fs.ts`)

**Purpose**: File and directory operations.

**Key Functions**:

1. **`ensureDir(dirPath)`** (lines 4-6):
   - Creates directory recursively
   - Equivalent to `mkdir -p`

2. **`appendScratchpadEntry(filePath, entry)`** (lines 14-16):
   - Appends markdown bullet point to scratchpad
   - Format: `* <entry>`

3. **`appendTodo(filePath, item, done)`** (lines 18-21):
   - Appends task to todo list
   - Format: `- [ ] <item>` or `- [x] <item>`

4. **`writeFallbackFile(dir, agent, message)`** (lines 23-30):
   - Creates fallback markdown file when agent produces no changes
   - Prevents empty commits
   - Returns absolute path to file

5. **`writeJsonFile(filePath, data)`** (lines 32-36):
   - Writes formatted JSON with 2-space indent
   - Used for `summary.json`

6. **`appendJsonLine(filePath, data)`** (lines 38-42):
   - Appends JSON object as single line (JSONL format)
   - Used for event logging in `run.jsonl`

---

#### 2.6.3 Run Logger (`src/util/run-logger.ts`)

**Purpose**: Structured event logging for debugging and audit trails.

**Implementation** (lines 1-14):
```typescript
type RunEvent = Record<string, unknown> & { event: string };

export class RunLogger {
  constructor(private readonly filePath: string) {}

  async log(event: RunEvent): Promise<void> {
    await appendJsonLine(this.filePath, {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }
}
```

**Event Types Logged**:
- `start` - Orchestrator initialization
- `agent:start` - Agent begins execution
- `agent:success` - Agent completes successfully
- `agent:error` - Agent fails with error
- `finish` - Orchestrator completes (with or without errors)

**Example Log Entry**:
```json
{"event":"agent:start","agent":"codex","branch":"agent/codex/20251111134523-a7x9","timestamp":"2025-11-11T13:45:23.456Z"}
```

---

#### 2.6.4 MCP Server Loader (`src/util/mcp.ts`)

**Purpose**: Load and configure Model Context Protocol (MCP) servers for Claude agent.

**Key Features**:
- Searches multiple config locations
- Environment variable interpolation
- Graceful fallback if no config found

**Search Order** (lines 61-82):
```typescript
function buildSearchOrder(baseDir: string, explicitPath?: string): string[] {
  // 1. Explicit path from CLI argument
  // 2. MCP_CONFIG_PATH environment variable
  // 3. <baseDir>/config/mcp.config.json
  // 4. <baseDir>/mcp.config.json
}
```

**Environment Variable Syntax** (lines 12, 85-98):
```json
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["my-mcp-server"],
      "env": {
        "API_KEY": "${env:MY_API_KEY}",
        "ENDPOINT": "${env:ENDPOINT|https://default.com}"
      }
    }
  }
}
```

**Placeholder Resolution**:
- `${env:VAR_NAME}` - Required, throws warning if missing
- `${env:VAR_NAME|default}` - Optional, uses default if missing

---

## 3. Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     USER INVOKES CLI                              │
│                                                                   │
│  $ ob1 -m "Add auth system" -k 2 --agents codex,claude          │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 1: INITIALIZATION                                          │
├──────────────────────────────────────────────────────────────────┤
│ 1. Load .env file (dotenv)                                       │
│ 2. Validate API keys (CLAUDE_API_KEY, OPENAI_API_KEY, etc.)     │
│ 3. Resolve repository root (git revparse --show-toplevel)       │
│ 4. Check for dirty state (git status)                           │
│ 5. Generate taskId (YYYYMMDDHHmmss-<random>)                    │
│ 6. Create runs/<taskId>/ directory                              │
│ 7. Initialize run.jsonl logger                                  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 2: WORKTREE PROVISIONING (for each agent)                 │
├──────────────────────────────────────────────────────────────────┤
│ For agent 'codex':                                               │
│   1. Branch name: agent/codex/<taskId>                           │
│   2. Worktree path: work/codex/<taskId>                         │
│   3. Remove existing worktree (if any)                          │
│   4. Create worktree: git worktree add -B <branch> <path> main │
│   5. Create .ob1/ directory in worktree                         │
│   6. Initialize .ob1/scratchpad.md                              │
│   7. Initialize .ob1/todo.md                                    │
│                                                                  │
│ For agent 'claude':                                             │
│   (same process with 'claude' in paths)                         │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 3: PARALLEL AGENT EXECUTION                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐          ┌────────────────────┐         │
│  │  Codex Agent       │          │  Claude Agent      │         │
│  │  (work/codex/...)  │          │  (work/claude/...) │         │
│  └────────┬───────────┘          └────────┬───────────┘         │
│           │                               │                      │
│           │ Concurrency Limit: k=2        │                      │
│           │ (managed by p-limit)          │                      │
│           │                               │                      │
│           ▼                               ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │  1. checkEnv() - Verify API keys                │            │
│  │  2. runner.run(context) - Execute agent          │            │
│  │     • Stream events/messages                    │            │
│  │     • Modify files in worktree                  │            │
│  │     • Write to .ob1/scratchpad.md               │            │
│  │     • Update .ob1/todo.md                       │            │
│  │  3. Check git status for changes                │            │
│  │  4. If no changes: create fallback file         │            │
│  │  5. git add . && git commit                     │            │
│  │  6. Count changed files                         │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 4: PR CREATION (if not --dry)                             │
├──────────────────────────────────────────────────────────────────┤
│ For each successful agent:                                       │
│   1. git push origin <branch> --set-upstream                    │
│   2. Get repo info from git remote (owner/repo)                 │
│   3. Build PR title: "[ob1] Agent: codex — Add auth system"    │
│   4. Build PR body with metadata                                │
│   5. Create PR via GitHub API (Octokit)                         │
│   6. Return PR URL                                              │
│   7. Log to .ob1/scratchpad.md                                  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 5: RESULT COLLECTION & REPORTING                          │
├──────────────────────────────────────────────────────────────────┤
│ 1. Collect AgentExecutionSummary for each agent:                │
│    {                                                             │
│      agent: 'codex',                                             │
│      branch: 'agent/codex/20251111134523-a7x9',                 │
│      worktreePath: '/path/to/work/codex/...',                   │
│      commitSha: 'abc123...',                                     │
│      prUrl: 'https://github.com/owner/repo/pull/42',            │
│      changedFiles: 12,                                           │
│      fallbackFile?: 'ob1_result_codex.md',                      │
│      error?: 'Error message if failed'                          │
│    }                                                             │
│                                                                  │
│ 2. Write runs/<taskId>/summary.json                             │
│ 3. Log 'finish' event to run.jsonl                              │
│ 4. Display results to console:                                  │
│    ✓ codex → https://github.com/owner/repo/pull/42              │
│    ✓ claude → https://github.com/owner/repo/pull/43             │
│                                                                  │
│ 5. Throw error if any agent failed (non-zero exit)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Execution Model

### 4.1 Concurrency Control

**Implementation** (orchestrator.ts, line 123):
```typescript
const limit = pLimit(options.k);  // e.g., k=2 means max 2 concurrent agents

await Promise.all(
  agentContexts.map((context) =>
    limit(async () => {
      // Agent execution here
    })
  )
);
```

**How p-limit Works**:
1. Creates a concurrency limiter with capacity `k`
2. Each agent execution is wrapped in `limit(async () => {...})`
3. p-limit queues executions and ensures only `k` run simultaneously
4. When an agent completes, the next queued agent starts immediately

**Example Timeline** (k=2, 3 agents):
```
Time →
  0s: [Codex starts] [Claude starts]  (Cursor queued)
 45s: [Codex done]   [Claude still running] [Cursor starts]
 90s:                [Claude done]          [Cursor still running]
120s:                                       [Cursor done]
```

### 4.2 Agent Lifecycle

Each agent goes through these states:

```
┌─────────────┐
│  PENDING    │  Waiting in queue
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  STARTING   │  Spinner: "preparing worktree"
└──────┬──────┘
       │ runner = getAgentRunner(name)
       │ runner.checkEnv()
       ▼
┌─────────────┐
│  RUNNING    │  Spinner: "running agent"
└──────┬──────┘  runner.run(context)
       │
       ├─────────► [Agent SDK executes task]
       │           • Reads/writes files
       │           • Runs commands
       │           • Streams events
       │
       ▼
┌─────────────┐
│ VALIDATING  │  Check for meaningful changes
└──────┬──────┘
       │
       ├─── No changes? ──► Write fallback file
       │
       ▼
┌─────────────┐
│ COMMITTING  │  Spinner: "committing changes"
└──────┬──────┘  git add . && git commit
       │
       ▼
┌─────────────┐
│  PUSHING    │  Spinner: "pushing branch"
└──────┬──────┘  git push origin <branch> --set-upstream
       │
       ▼
┌─────────────┐
│ PR CREATION │  Spinner: "creating PR"
└──────┬──────┘  GitHub API call
       │
       ▼
┌─────────────┐
│ COMPLETED   │  Spinner: ✓ succeeded with PR URL
└─────────────┘

       OR

┌─────────────┐
│   FAILED    │  Spinner: ✗ failed with error message
└─────────────┘
```

### 4.3 Fallback Mechanism

**Problem**: Agent produces no meaningful changes (only `.ob1/` files modified).

**Solution** (orchestrator.ts, lines 146-158):
```typescript
const hasMeaningfulChanges = status.files.some(
  (file) => !file.path.startsWith('.ob1/')
);

if (!hasMeaningfulChanges) {
  spinner.text = `[${context.name}] applying fallback`;
  const fallbackMessage = `Agent ${context.name} produced no changes.
                           Fallback file generated by orchestrator.`;
  const fallbackFilePath = await writeFallbackFile(
    context.dir,
    context.name,
    fallbackMessage
  );
  // This creates: ob1_result_<agent>.md
}
```

**Why?**:
- Prevents empty commits
- Provides artifact for debugging
- Ensures every agent produces trackable output

---

## 5. Git Worktree Isolation

### 5.1 Why Worktrees?

**Problem**: Multiple agents need to work on the same repository simultaneously.

**Traditional Approach Issues**:
- Cloning repo N times wastes disk space
- Switching branches in shared directory causes race conditions
- Each agent would need separate clone + checkout

**Worktree Solution**:
- Single `.git` directory shared across all worktrees
- Each worktree has independent working directory
- No branch conflicts - each worktree has different branch checked out
- Efficient: only stores unique file contents once

### 5.2 Worktree Structure

**Physical Layout**:
```
project-root/
├── .git/                    # Main git directory
│   └── worktrees/           # Worktree metadata
│       ├── codex-<taskId>/
│       ├── claude-<taskId>/
│       └── cursor-<taskId>/
│
├── work/                    # Worktree root
│   ├── codex/
│   │   └── <taskId>/        # Isolated working directory
│   │       ├── .git         # Symbolic link to main .git
│   │       ├── .ob1/
│   │       │   ├── scratchpad.md
│   │       │   └── todo.md
│   │       └── [source files]
│   │
│   ├── claude/
│   │   └── <taskId>/
│   │       └── [isolated workspace]
│   │
│   └── cursor/
│       └── <taskId>/
│           └── [isolated workspace]
```

### 5.3 Worktree Creation Process

**Step-by-Step** (git.ts, lines 30-45):

```bash
# 1. Ensure parent directory exists
mkdir -p work/codex

# 2. Remove existing worktree (idempotent)
git worktree remove work/codex/<taskId> --force

# 3. Recreate directory
mkdir -p work/codex/<taskId>

# 4. Create worktree with new branch
git worktree add -B agent/codex/<taskId> work/codex/<taskId> main
#                 │   │                    │                   │
#                 │   └─ branch name       │                   └─ base branch
#                 │                        └─ worktree path
#                 └─ force create/reset branch
```

**Resulting Branch State**:
```
main ──┬──► agent/codex/<taskId>  (in work/codex/<taskId>)
       ├──► agent/claude/<taskId> (in work/claude/<taskId>)
       └──► agent/cursor/<taskId> (in work/cursor/<taskId>)
```

### 5.4 Worktree Benefits

1. **Isolation**: Each agent cannot interfere with others' files
2. **Performance**: Shared object storage, no duplicate files
3. **Simplicity**: Standard git commands work in each worktree
4. **Cleanup**: `git worktree remove` cleans up completely
5. **Safety**: Main repository remains untouched

### 5.5 Branch Naming Convention

**Format**: `agent/<agent-name>/<task-id>`

**Examples**:
- `agent/codex/20251111134523-a7x9`
- `agent/claude/20251111134523-a7x9`
- `agent/cursor/20251111134523-a7x9`

**Benefits**:
- Clearly identifies agent and run
- Sorts nicely in git tools
- Easy to filter/cleanup old branches
- No naming conflicts across runs

---

## 6. Concurrency Management

### 6.1 p-limit Library

**Purpose**: Control maximum concurrent async operations.

**Installation**:
```json
"dependencies": {
  "p-limit": "^5.0.0"
}
```

**Basic Usage**:
```typescript
import pLimit from 'p-limit';

const limit = pLimit(2);  // Max 2 concurrent

const tasks = [task1, task2, task3, task4];

await Promise.all(
  tasks.map((task) =>
    limit(async () => {
      return await processTask(task);
    })
  )
);
// Only 2 tasks run concurrently at any time
```

### 6.2 ob1 Implementation

**Code** (orchestrator.ts, lines 123-232):
```typescript
const limit = pLimit(options.k);  // User-specified concurrency
const executionSummaries: AgentExecutionSummary[] = [];

await Promise.all(
  agentContexts.map((context) =>
    limit(async () => {
      // Each agent execution is rate-limited
      const spinner = ora({ text: `[${context.name}] preparing` }).start();

      try {
        // Long-running agent execution
        const result = await runner.run(context);
        // ... commit, push, PR creation ...
        executionSummaries.push({ agent, branch, prUrl, ... });
        spinner.succeed(`[${context.name}] completed`);
      } catch (error) {
        executionSummaries.push({ agent, branch, error, ... });
        spinner.fail(`[${context.name}] failed`);
      }
    })
  )
);
```

### 6.3 Concurrency Scenarios

**Scenario 1: k=1 (Sequential)**
```
Agent 1: [████████████] Complete
Agent 2:              [████████████] Complete
Agent 3:                           [████████████] Complete
```

**Scenario 2: k=2 (Dual)**
```
Agent 1: [████████████] Complete
Agent 2: [█████████████████] Complete
Agent 3:              [████████████] Complete (starts when Agent 1 finishes)
```

**Scenario 3: k=3 (Full Parallel)**
```
Agent 1: [████████████] Complete
Agent 2: [█████████████████] Complete
Agent 3: [███████] Complete
```

### 6.4 Resource Considerations

**Why Limit Concurrency?**

1. **API Rate Limits**:
   - OpenAI API: Token-based rate limiting
   - Anthropic API: Request-per-minute limits
   - Cursor API: Concurrent agent limits

2. **System Resources**:
   - Each agent consumes memory
   - Heavy disk I/O from file operations
   - Network bandwidth for API calls

3. **Cost Management**:
   - Running 3 agents simultaneously can exhaust API budget quickly
   - k=2 provides good balance of speed vs. cost

**Recommended Settings**:
- Local development: `k=1` (sequential, easier debugging)
- CI/CD: `k=2` (balanced)
- Production: `k=3` (maximum parallelism, but monitor costs)

---

## 7. Error Handling

### 7.1 Error Handling Strategy

**Philosophy**: Fail gracefully, preserve partial results, provide actionable feedback.

### 7.2 Orchestrator-Level Error Handling

**Code** (orchestrator.ts, lines 126, 215-229, 262-264):
```typescript
let failure: unknown = null;

await Promise.all(
  agentContexts.map((context) =>
    limit(async () => {
      try {
        // Agent execution
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Record failure but don't throw yet
        executionSummaries.push({
          agent: context.name,
          branch: context.branch,
          worktreePath: context.dir,
          changedFiles: 0,
          error: message,
        });

        await logger.log({
          event: 'agent:error',
          agent: context.name,
          error: message
        });

        spinner.fail(`[${context.name}] failed: ${message}`);

        // Track first failure
        if (!failure) {
          failure = error;
        }
      }
    })
  )
);

// After all agents complete, throw if any failed
if (failure) {
  throw failure;
}
```

**Key Points**:
- One agent's failure doesn't stop others
- All agents run to completion (or failure)
- Summary includes both successes and failures
- First error is re-thrown at end for proper exit code

### 7.3 Agent-Level Error Handling

#### 7.3.1 Codex Agent Errors

**Timeout Handling** (codex.ts, lines 22-28, 149):
```typescript
const timeoutMs = 600000; // 10 minutes
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => {
    reject(new Error(`Timeout reached after ${timeoutMs}ms`));
  }, timeoutMs);
});

const result = await Promise.race([runPromise, timeoutPromise]);
```

**Event-Level Errors** (codex.ts, lines 79-84, 131-132):
```typescript
case 'turn.failed':
  await appendScratchpadEntry(
    context.scratchpadPath,
    `Turn ${turnCount} failed: ${event.error.message}`
  );
  throw new Error(`Turn failed: ${event.error.message}`);

case 'error':
  await appendScratchpadEntry(context.scratchpadPath, `Error: ${event.message}`);
  throw new Error(`Thread error: ${event.message}`);
```

#### 7.3.2 Claude Agent Errors

**Abort Controller** (claude.ts, lines 24-28):
```typescript
const abortController = new AbortController();
const timeoutId = setTimeout(() => {
  consola.warn(`[claude] Timeout reached after ${timeoutMs}ms, aborting...`);
  abortController.abort();
}, timeoutMs);
```

**Result Subtype Errors** (claude.ts, lines 100-116):
```typescript
if (finalResult.subtype === 'error_during_execution') {
  const errorMessages = 'errors' in finalResult
    ? finalResult.errors.join(', ')
    : 'Unknown error';
  throw new Error(`Claude encountered an error: ${errorMessages}`);
}

// Handle soft failures (max turns, budget exceeded)
if (finalResult.subtype !== 'success') {
  const errorMessages = 'errors' in finalResult
    ? finalResult.errors.join(', ')
    : 'Task incomplete';
  summary = `Task incomplete: ${errorMessages}`;
  // Log warning but don't throw - agent completed "successfully"
}
```

#### 7.3.3 Cursor Agent Errors

**API Error Enhancement** (cursor.ts, lines 85-108):
```typescript
if (!response.ok) {
  const errorText = await response.text().catch(() => 'Unknown error');
  let errorMessage = `Cursor API error (${response.status}): ${errorText}`;

  // Enhance 403 errors with actionable guidance
  if (response.status === 403) {
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.includes('Storage mode is disabled')) {
        errorMessage += '\n\n💡 How to fix:\n';
        errorMessage += '   1. Open Cursor IDE\n';
        errorMessage += '   2. Go to Settings → Privacy\n';
        errorMessage += '   3. Disable "Privacy Mode" or enable "Storage Mode"\n';
        errorMessage += '   4. Cloud Agents require data retention\n';
      }
    } catch { /* Not JSON, keep original message */ }
  }

  throw new Error(errorMessage);
}
```

**Polling Timeout** (cursor.ts, lines 165-196):
```typescript
private async pollAgentStatus(agentId: string, scratchpadPath: string, timeoutMs: number) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    const agent = await this.apiRequest<CursorAgent>('GET', `/agents/${agentId}`);

    if (agent.status === 'FINISHED') return agent;
    if (agent.status === 'FAILED') {
      throw new Error('Cursor agent failed to complete the task');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Cursor agent timed out after ${timeoutMs}ms`);
}
```

### 7.4 Environment Validation Errors

**Pre-Flight Checks** (env.ts, lines 41-48):
```typescript
export function assertRequiredEnv(keys = REQUIRED_ENV_KEYS) {
  const results = validateEnvKeys(keys);
  const missing = results.filter((result) => !result.present);

  if (missing.length > 0) {
    const missingKeys = missing.map((item) => item.key).join(', ');
    throw new Error(`Missing required environment variables: ${missingKeys}`);
  }
}
```

**Error Output**:
```
Error: Missing required environment variables: CLAUDE_API_KEY, CURSOR_API_KEY
```

### 7.5 Git Operation Errors

**Dirty Repository** (git.ts, lines 22-28):
```typescript
export async function ensureCleanRepo(repoDir: string, allowDirty: boolean) {
  const git = simpleGit(repoDir);
  const status = await git.status();

  if (!allowDirty && !status.isClean()) {
    throw new Error('Repository has uncommitted changes. Use --allow-dirty to override.');
  }
}
```

**No Commit Changes** (orchestrator.ts, lines 160-162):
```typescript
if (status.isClean()) {
  throw new Error('Agent completed without producing any file changes.');
}
```

### 7.6 Error Propagation Flow

```
Agent Error
    │
    ├─► Log to .ob1/scratchpad.md
    ├─► Log to runs/<taskId>/run.jsonl
    ├─► Add to executionSummaries[] with error field
    ├─► Display spinner.fail() with error message
    ├─► Store in `failure` variable
    │
    [Continue to next agent]
    │
    ▼
After all agents complete
    │
    ├─► Write summary.json (includes errors)
    ├─► Display all results (successes + failures)
    ├─► If any failures: throw first error
    │
    ▼
CLI exits with code 1
```

### 7.7 Partial Success Handling

**Example Output**:
```
✓ codex → https://github.com/owner/repo/pull/42
✗ claude → Error: CLAUDE_API_KEY rate limit exceeded
✓ cursor → https://github.com/owner/repo/pull/43

Error: CLAUDE_API_KEY rate limit exceeded (exit code 1)
```

**Benefits**:
- 2 out of 3 agents succeeded and created PRs
- Developer can review successful PRs immediately
- Failed agent can be retried separately
- No wasted work

---

## 8. Design Decisions

### 8.1 Why Git Worktrees Instead of Clones?

**Alternatives Considered**:
1. **Multiple Clones**: Clone repo N times
2. **Branch Switching**: Switch branches in shared directory
3. **Separate Repositories**: Work in different repos entirely

**Decision: Git Worktrees**

**Rationale**:
- **Space Efficiency**: Single `.git` directory shared across all worktrees
- **Performance**: No need to clone entire history multiple times
- **Simplicity**: Standard git commands work without modification
- **Safety**: Automatic cleanup with `git worktree remove`
- **Isolation**: Each agent has completely isolated working directory

**Tradeoffs**:
- Requires Git 2.5+ (widely available, released 2015)
- Slightly more complex than simple clones
- Must remember to clean up worktrees

### 8.2 Why p-limit for Concurrency?

**Alternatives Considered**:
1. **Manual Queue**: Implement custom queuing logic
2. **Worker Threads**: Use Node.js worker_threads
3. **Child Processes**: Spawn separate processes

**Decision: p-limit**

**Rationale**:
- **Simplicity**: Single-line concurrency control
- **Reliability**: Battle-tested library with 200M+ downloads/year
- **Flexibility**: Easy to adjust concurrency at runtime
- **Integration**: Works seamlessly with Promise.all()

**Code Simplicity**:
```typescript
// With p-limit (2 lines)
const limit = pLimit(2);
await Promise.all(tasks.map(t => limit(() => process(t))));

// Without p-limit (50+ lines of queue management)
// ... complex queue implementation ...
```

### 8.3 Why JSONL for Logging?

**Alternatives Considered**:
1. **Single JSON Array**: `[{...}, {...}]`
2. **Text Logs**: Traditional log files
3. **SQLite**: Embedded database

**Decision: JSONL (JSON Lines)**

**Rationale**:
- **Streaming**: Append events without parsing entire file
- **Partial Reads**: Process logs line-by-line
- **Crash Safety**: Previous events preserved even if process crashes
- **Tool Support**: Many tools support JSONL (jq, jql, etc.)

**Example Usage**:
```bash
# Filter to agent errors only
cat runs/20251111134523-a7x9/run.jsonl | jq 'select(.event == "agent:error")'

# Count events by type
cat runs/*/run.jsonl | jq -r .event | sort | uniq -c
```

### 8.4 Why Separate Scratchpad and Todo Files?

**Alternative Considered**: Single combined log file

**Decision: Separate Files**

**Rationale**:
- **Clarity**: Todo list shows actionable items, scratchpad shows narrative
- **Format**: Todo uses checkbox syntax `- [ ]`, scratchpad uses bullets `*`
- **Tool Support**: Can be parsed by task management tools
- **User Experience**: Easier to scan for specific information

**Example Files**:

`.ob1/scratchpad.md`:
```markdown
* Task: Add user authentication system
* Starting Claude Agent SDK...
* Turn 1: Analyzing existing code structure...
* Turn 2: Creating auth service...
* Final result: Implemented JWT-based authentication with refresh tokens
```

`.ob1/todo.md`:
```markdown
- [x] Initialize Claude Agent SDK
- [x] Claude Agent SDK execution completed
- [x] PR opened
- [x] ob1 run completed
```

### 8.5 Why Fallback Files?

**Problem**: Agent completes successfully but produces no code changes.

**Alternatives Considered**:
1. **Allow Empty Commits**: Commit with no file changes
2. **Fail Agent**: Treat as error
3. **Skip Agent**: Don't create PR at all

**Decision: Create Fallback File**

**Rationale**:
- **Audit Trail**: Provides evidence that agent ran
- **No Empty Commits**: Git best practice - commits should have changes
- **Debugging**: Helps identify why agent didn't produce changes
- **Consistency**: Every agent produces artifact (commit + PR)

**Implementation**:
```typescript
// Creates: ob1_result_<agent>.md
const fallbackMessage = `Agent ${context.name} produced no changes.
                         Fallback file generated by orchestrator.`;
await writeFallbackFile(context.dir, context.name, fallbackMessage);
```

### 8.6 Why Fail-Slow (Not Fail-Fast)?

**Alternative**: Stop all agents when one fails (fail-fast)

**Decision: Fail-Slow**

**Rationale**:
- **Partial Success**: Some agents may still produce valuable results
- **Parallelism**: Don't waste work-in-progress from other agents
- **Cost**: API calls already in-flight might as well complete
- **Debugging**: See all failures at once, not just first one

**Implementation**:
```typescript
// Track first failure but don't throw immediately
if (!failure) {
  failure = error;
}

// Continue processing other agents...

// Throw at the end if any failed
if (failure) {
  throw failure;
}
```

### 8.7 Why TypeScript?

**Alternatives Considered**:
1. **JavaScript**: No build step required
2. **Python**: Rich ecosystem for AI/ML
3. **Go**: Fast, compiled, easy distribution

**Decision: TypeScript**

**Rationale**:
- **Type Safety**: Catch errors at compile time
- **IDE Support**: Better autocomplete and refactoring
- **Maintainability**: Self-documenting types
- **Ecosystem**: Rich npm package ecosystem
- **Modern Syntax**: ES modules, async/await, top-level await

**Tradeoff**: Requires build step, but `tsx` enables rapid development.

### 8.8 Why Commander.js for CLI?

**Alternatives Considered**:
1. **Yargs**: More feature-rich
2. **Oclif**: Full framework from Heroku
3. **Meow**: Minimalist
4. **Manual Parsing**: No dependency

**Decision: Commander.js**

**Rationale**:
- **Simplicity**: Easy to learn and use
- **Popular**: 30M+ downloads/week, battle-tested
- **Lightweight**: Small bundle size
- **Features**: Subcommands, options, validation
- **TypeScript**: Excellent type definitions

**Code Example**:
```typescript
program
  .option('-m, --message <message>', 'Task message')
  .option('-k <count>', 'Number of agents')
  .action(async (options) => { /* ... */ });
```

### 8.9 Why Separate Agent Implementations?

**Alternative**: Single generic agent runner

**Decision: Separate classes per agent**

**Rationale**:
- **Isolation**: Each agent has unique SDK and requirements
- **Maintainability**: Easy to update one agent without affecting others
- **Testability**: Can mock individual agents
- **Extensibility**: Easy to add new agents (just implement `AgentRunner` interface)

**Interface Design**:
```typescript
export interface AgentRunner {
  checkEnv(): Promise<void> | void;  // Validate API keys
  run(context: AgentContext): Promise<AgentRunResult>;
}
```

---

## 9. File Structure

```
cli-agent/
├── .git/                        # Git repository
│   └── worktrees/               # Worktree metadata (auto-managed)
│
├── src/                         # Source code (TypeScript)
│   ├── cli.ts                   # CLI entry point, argument parsing
│   ├── orchestrator.ts          # Core orchestration logic
│   ├── git.ts                   # Git operations (worktrees, commits, push)
│   ├── pr.ts                    # GitHub PR creation
│   │
│   ├── agents/                  # Agent implementations
│   │   ├── index.ts             # Agent registry and factory
│   │   ├── types.ts             # Agent interfaces and types
│   │   ├── codex.ts             # OpenAI Codex agent
│   │   ├── claude.ts            # Anthropic Claude agent
│   │   └── cursor.ts            # Cursor Cloud agent
│   │
│   └── util/                    # Utility modules
│       ├── env.ts               # Environment variable loading
│       ├── fs.ts                # File system operations
│       ├── run-logger.ts        # JSONL event logging
│       └── mcp.ts               # MCP server configuration loader
│
├── dist/                        # Compiled JavaScript (generated)
│   ├── cli.js                   # Compiled CLI
│   ├── orchestrator.js
│   ├── agents/
│   └── ...
│
├── runs/                        # Run artifacts (generated)
│   └── <taskId>/                # e.g., 20251111134523-a7x9/
│       ├── run.jsonl            # Event stream log
│       └── summary.json         # Execution summary
│
├── work/                        # Git worktrees (generated)
│   ├── codex/
│   │   └── <taskId>/            # Agent worktree directory
│   │       ├── .git             # Link to main repo
│   │       ├── .ob1/            # Agent tracking
│   │       │   ├── scratchpad.md
│   │       │   └── todo.md
│   │       └── [source files]   # Agent's working files
│   │
│   ├── claude/
│   │   └── <taskId>/
│   │
│   └── cursor/
│       └── <taskId>/
│
├── config/                      # Configuration (optional)
│   └── mcp.config.json          # MCP server definitions
│
├── tests/                       # Test files
│   └── ...
│
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Template for .env
├── .gitignore                   # Git ignore rules
├── package.json                 # npm package definition
├── tsconfig.json                # TypeScript configuration
├── README.md                    # User documentation
└── ARCHITECTURE.md              # This file
```

### 9.1 Generated vs. Source Files

**Source Files** (committed to git):
- `src/**/*.ts` - TypeScript source code
- `tests/**/*` - Test files
- `package.json`, `tsconfig.json` - Configuration
- `README.md`, `ARCHITECTURE.md` - Documentation

**Generated Files** (gitignored):
- `dist/**/*` - Compiled JavaScript
- `runs/**/*` - Execution logs and summaries
- `work/**/*` - Git worktrees
- `node_modules/**/*` - npm dependencies

### 9.2 Directory Naming Conventions

**runs/**: Past tense - contains completed runs
**work/**: Present tense - contains active worktrees
**src/**: Source code (standard convention)
**dist/**: Distribution code (standard convention)

---

## 10. Technology Stack

### 10.1 Core Dependencies

#### **Commander.js** (`commander@^11.1.0`)
- **Purpose**: CLI argument parsing and command routing
- **Why**: Simple, popular, well-typed
- **Usage**: Parse `-m`, `-k`, `--agents`, etc.
- **Docs**: https://github.com/tj/commander.js

#### **consola** (`consola@^3.2.3`)
- **Purpose**: Enhanced console logging with colors and spinners
- **Why**: Better UX than raw `console.log`
- **Usage**: `consola.info()`, `consola.error()`, `consola.success()`
- **Docs**: https://github.com/unjs/consola

#### **ora** (`ora@^8.0.1`)
- **Purpose**: Terminal spinners for long-running operations
- **Why**: Visual feedback for agent execution
- **Usage**: `ora({ text: 'Running...' }).start()`
- **Docs**: https://github.com/sindresorhus/ora

#### **p-limit** (`p-limit@^5.0.0`)
- **Purpose**: Concurrency control for parallel agents
- **Why**: Simple, reliable, battle-tested
- **Usage**: `const limit = pLimit(2); await Promise.all(tasks.map(t => limit(() => ...)))`
- **Docs**: https://github.com/sindresorhus/p-limit

#### **chalk** (`chalk@^5.3.0`)
- **Purpose**: Terminal color formatting
- **Why**: Highlight PR URLs, errors, agent names
- **Usage**: `chalk.cyan(prUrl)`, `chalk.red('Error')`
- **Docs**: https://github.com/chalk/chalk

#### **dotenv** (`dotenv@^16.4.5`)
- **Purpose**: Load environment variables from `.env` file
- **Why**: Keep API keys out of source code
- **Usage**: `dotenv.config({ path: '.env' })`
- **Docs**: https://github.com/motdotla/dotenv

#### **execa** (`execa@^8.0.1`)
- **Purpose**: Execute shell commands (git operations)
- **Why**: Better than `child_process`, promise-based
- **Usage**: `await execa('git', ['worktree', 'add', ...])`
- **Docs**: https://github.com/sindresorhus/execa

#### **simple-git** (`simple-git@^3.21.0`)
- **Purpose**: Git operations (status, commit, push)
- **Why**: Type-safe, promise-based git interface
- **Usage**: `await git.status()`, `await git.commit('message')`
- **Docs**: https://github.com/steveukx/git-js

---

### 10.2 Agent SDKs

#### **@openai/codex-sdk** (`@openai/codex-sdk@^0.57.0`)
- **Purpose**: OpenAI Codex autonomous agent
- **Features**:
  - Thread-based execution
  - Event streaming
  - File operations
  - Command execution
  - Token usage tracking
- **Usage**:
  ```typescript
  const codex = new Codex({ apiKey: '...' });
  const thread = codex.startThread({ workingDirectory: '...' });
  const { events } = await thread.runStreamed(prompt);
  ```
- **Docs**: https://github.com/openai/codex-sdk

#### **@anthropic-ai/claude-agent-sdk** (`@anthropic-ai/claude-agent-sdk@^0.1.30`)
- **Purpose**: Anthropic Claude autonomous agent
- **Features**:
  - Query-based execution
  - MCP server support
  - Tool control (Read, Write, Edit, Bash, etc.)
  - Cost and token tracking
  - Abort controller support
- **Usage**:
  ```typescript
  const result = query({
    prompt: '...',
    options: {
      cwd: '...',
      permissionMode: 'bypassPermissions',
      allowedTools: ['Read', 'Write', 'Edit'],
      model: 'claude-sonnet-4-5-20250929',
    },
  });
  ```
- **Docs**: https://github.com/anthropics/claude-agent-sdk

#### **Cursor Cloud API** (REST API, no SDK)
- **Purpose**: Cursor Cloud Agent via HTTP
- **Features**:
  - Agent creation
  - Status polling
  - GitHub repository integration
  - Branch-based workflow
- **Authentication**: Basic auth with API key
- **Usage**:
  ```typescript
  const response = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, source, target }),
  });
  ```
- **Docs**: https://cursor.com/docs/cloud-agent

---

### 10.3 GitHub Integration

#### **@octokit/rest** (`@octokit/rest@^20.0.2`)
- **Purpose**: GitHub REST API client
- **Why**: Create pull requests programmatically
- **Usage**:
  ```typescript
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const response = await octokit.pulls.create({
    owner: 'username',
    repo: 'repository',
    base: 'main',
    head: 'agent/codex/20251111134523-a7x9',
    title: '[ob1] Agent: codex — Add auth system',
    body: '## Agent\n- Name: codex\n...',
  });
  ```
- **Docs**: https://github.com/octokit/rest.js

---

### 10.4 Development Dependencies

#### **TypeScript** (`typescript@^5.5.4`)
- **Purpose**: Type-safe JavaScript
- **Config**: `tsconfig.json`
- **Compilation**: `tsc` → `dist/`

#### **tsx** (`tsx@^4.7.1`)
- **Purpose**: TypeScript execution without build step
- **Why**: Faster development iteration
- **Usage**: `npm run dev` → `tsx src/cli.ts`

#### **Vitest** (`vitest@^4.0.8`)
- **Purpose**: Unit testing framework
- **Why**: Fast, modern, Vite-based
- **Usage**: `npm test` → `vitest run`

#### **ESLint** (`eslint@^9.8.0`)
- **Purpose**: Code linting and style enforcement
- **Config**: Extends Prettier, import sorting
- **Usage**: `npm run lint`

#### **Prettier** (`prettier@^3.3.2`)
- **Purpose**: Code formatting
- **Why**: Consistent style across contributors
- **Integration**: ESLint integration via `eslint-config-prettier`

#### **Rimraf** (`rimraf@^5.0.7`)
- **Purpose**: Cross-platform `rm -rf`
- **Why**: Clean dist/ directory on all OS
- **Usage**: `npm run clean` → `rimraf dist`

---

### 10.5 Runtime Requirements

**Node.js**: v18.0.0+ (for native fetch, AbortController)
**Git**: v2.5+ (for git worktree support)
**npm**: v8.0.0+ (for package management)

**Operating Systems**:
- macOS (primary)
- Linux (supported)
- Windows (supported with WSL)

---

### 10.6 API Key Requirements

**Required for Full Functionality**:
```bash
# .env file
CLAUDE_API_KEY=sk-ant-api03-...           # Anthropic API key
OPENAI_API_KEY=sk-proj-...                # OpenAI API key
CODEX_CLI_KEY=sk-proj-...                 # Legacy Codex key (same as OPENAI_API_KEY)
CURSOR_API_KEY=cur-...                    # Cursor API key
GITHUB_TOKEN=ghp_...                      # GitHub personal access token
```

**Verification**:
```bash
$ ob1 doctor

Environment configuration check
--------------------------------
✅ CLAUDE_API_KEY
✅ CODEX_CLI_KEY
✅ OPENAI_API_KEY
✅ CURSOR_API_KEY
✅ GITHUB_TOKEN

All required environment variables are set.
```

---

### 10.7 Optional Configuration

#### **MCP Servers** (`config/mcp.config.json`)
- Extends Claude agent capabilities
- Supports custom tools and integrations
- Environment variable interpolation

**Example**:
```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

---

## Conclusion

The ob1 orchestrator is a sophisticated parallel agent execution system that leverages git worktrees for isolation, p-limit for concurrency control, and multiple AI agent SDKs for task execution. Its architecture prioritizes:

1. **Isolation**: Each agent operates in its own worktree
2. **Concurrency**: Configurable parallel execution with p-limit
3. **Resilience**: Graceful error handling with partial success support
4. **Observability**: Comprehensive logging (JSONL events, scratchpad, todos)
5. **Automation**: End-to-end workflow from task to PR
6. **Extensibility**: Easy to add new agents via AgentRunner interface

The system is production-ready for CI/CD integration and supports all major AI coding agents (Codex, Claude, Cursor).
