# ob1 Developer Guide

A comprehensive guide for developers working on the ob1 multi-agent orchestrator.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [How It Works](#how-it-works)
4. [Architecture Overview](#architecture-overview)
5. [Configuration](#configuration)
6. [CLI Commands](#cli-commands)
7. [Run Artifacts](#run-artifacts)
8. [Development Workflow](#development-workflow)
9. [Testing](#testing)
10. [Debugging](#debugging)
11. [Common Issues](#common-issues)

---

## Project Overview

### What is ob1?

`ob1` is a minimal CLI orchestrator that coordinates multiple AI coding agents in parallel on a single Git repository. It enables you to run up to three different AI agents (`codex`, `claude`, `cursor`) simultaneously on the same task, allowing you to compare results and leverage the strengths of different AI models.

### What Does It Do?

ob1 automates the following workflow:

1. **Isolation**: Creates separate git worktrees for each agent to work independently
2. **Execution**: Runs AI coding agents in parallel with autonomous execution
3. **Tracking**: Maintains scratchpads and TODO ledgers for each agent's progress
4. **Integration**: Commits changes, pushes branches, and creates pull requests automatically
5. **Reporting**: Generates comprehensive run artifacts with execution logs and summaries

### Why Does It Exist?

Traditional AI coding assistants run one at a time, requiring manual coordination. ob1 solves this by:

- **Parallel Execution**: Run multiple agents simultaneously to save time
- **Safe Isolation**: Each agent works in its own worktree, preventing conflicts
- **Reproducibility**: All runs are logged with artifacts for analysis
- **Comparison**: Compare different AI approaches to the same problem
- **Automation**: End-to-end automation from task description to pull request

### Key Features

- **Multi-Agent Support**: Integrates Claude (Anthropic), Codex (OpenAI), and Cursor Cloud
- **Git Worktree Isolation**: Each agent works in a separate worktree with its own branch
- **Autonomous Operation**: Agents run without manual approval (configurable per agent)
- **Comprehensive Logging**: JSONL event logs and JSON summaries for each run
- **Fallback Guardrails**: Automatically handles agents that produce no changes
- **GitHub Integration**: Automatic branch pushing and PR creation
- **Environment Validation**: `doctor` command to verify configuration before running

---

## Quick Start

### Prerequisites

- Node.js 18+ (for ESM support)
- Git repository with a clean working directory
- API keys for the agents you want to use
- GitHub personal access token (for PR creation)

### Installation

1. **Clone and install dependencies:**

```bash
git clone <your-repo-url>
cd cli-agent
npm install
```

2. **Build the project:**

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Environment Setup

1. **Copy the example environment file:**

```bash
cp .env.example .env
```

2. **Edit `.env` and add your API keys:**

```bash
# Anthropic Claude
CLAUDE_API_KEY=sk-ant-...

# OpenAI Codex (CLI/SDK)
CODEX_CLI_KEY=sk-proj-...
OPENAI_API_KEY=sk-proj-...

# Cursor Cloud
CURSOR_API_KEY=your-cursor-key

# GitHub (for PRs)
GITHUB_TOKEN=ghp_...

# Optional: MCP Server configurations
SHADCN_REGISTRY_URL=https://www.shadcn.io/api/mcp
SHADCN_REGISTRY_TOKEN=...
# ... other MCP variables
```

**Where to get API keys:**

- **Claude**: https://console.anthropic.com/settings/keys
- **OpenAI**: https://platform.openai.com/api-keys
- **Cursor**: https://cursor.com/settings (requires Cursor Pro subscription)
- **GitHub**: https://github.com/settings/tokens (need `repo` scope)

3. **Validate your configuration:**

```bash
npx ob1 doctor
```

Expected output:
```
Environment configuration check
--------------------------------
✅ CLAUDE_API_KEY
✅ CODEX_CLI_KEY
✅ OPENAI_API_KEY
✅ CURSOR_API_KEY
✅ GITHUB_TOKEN
All required environment variables are set.
```

### First Run

Run a simple task with 2 agents in dry-run mode (no PRs created):

```bash
npx ob1 -m "Add a hello world function to README.md" -k 2 --dry --agents codex,claude
```

This will:
- Create worktrees for Codex and Claude agents
- Run both agents in parallel
- Show real-time progress with spinners
- Generate run artifacts in `runs/<taskId>/`
- Skip pushing branches and creating PRs (dry run)

### Your First Real Run

Once dry-run works, try a real run:

```bash
npx ob1 -m "Add error handling to the main CLI entry point" -k 2
```

This will create actual PRs on GitHub that you can review and merge.

---

## How It Works

### Step-by-Step Execution Flow

Here's what happens when you run `npx ob1 -m "Your task" -k 2`:

#### 1. **Initialization** (src/cli.ts:52-86)

- Parses command-line arguments
- Validates required options (`-m` message, `-k` count)
- Builds `OrchestratorOptions` object
- Calls `runOb1()` from orchestrator

#### 2. **Environment Validation** (src/orchestrator.ts:66-67)

```typescript
ensureEnvLoaded();      // Load .env file
assertRequiredEnv();    // Verify all API keys present
```

#### 3. **Repository Setup** (src/orchestrator.ts:69-74)

- Gets repository root: `getRepoRoot(options.repo)`
- Ensures clean working directory (or `--allow-dirty`)
- Creates unique task ID: `20241111123045-a8f3`
- Creates run directory: `runs/<taskId>/`

#### 4. **Agent Selection** (src/orchestrator.ts:79-91)

- Filters requested agents (default: all available)
- Limits to `k` agents maximum
- Validates at least one agent is selected

#### 5. **Worktree Creation** (src/orchestrator.ts:99-121)

For each agent:

```typescript
// Branch name: agent/codex/20241111123045-a8f3
const branch = `agent/${agent}/${taskId}`;

// Worktree path: work/codex/20241111123045-a8f3
const worktreeDir = path.join(workRoot, agent, taskId);

// Create worktree from base branch
await createWorktree(repoDir, worktreeDir, branch, baseBranch);

// Initialize tracking files in .ob1/
await ensureDir(path.join(worktreeDir, '.ob1'));
await appendScratchpadEntry(scratchpadPath, `Task: ${message}`);
await appendTodo(todoPath, 'Initialise ob1 run', true);
```

**File structure per worktree:**
```
work/codex/20241111123045-a8f3/
├── .ob1/
│   ├── scratchpad.md    # Agent's execution log
│   └── todo.md          # Agent's task checklist
├── src/                 # Your project files
├── package.json
└── ...
```

#### 6. **Parallel Agent Execution** (src/orchestrator.ts:123-232)

Uses `p-limit` to run agents with controlled concurrency:

```typescript
const limit = pLimit(options.k);  // Max k agents at once

await Promise.all(
  agentContexts.map((context) =>
    limit(async () => {
      const runner = getAgentRunner(context.name);
      runner.checkEnv();                    // Verify agent-specific env vars
      const result = await runner.run(context);  // Run the agent
      // ... handle results, commit, push, create PR
    })
  )
);
```

**What each agent does:**

- **Claude** (src/agents/claude.ts):
  - Uses Claude Agent SDK
  - Autonomous execution with `permissionMode: 'bypassPermissions'`
  - Max 50 turns to prevent infinite loops
  - 10-minute timeout
  - Logs every turn to scratchpad

- **Codex** (src/agents/codex.ts):
  - Uses OpenAI Codex SDK
  - Streams events (turn started/completed, file changes, commands)
  - `approvalPolicy: 'never'` for full autonomy
  - Tracks token usage and estimated costs
  - 10-minute timeout

- **Cursor** (src/agents/cursor.ts):
  - Uses Cursor Cloud API
  - Creates agent via REST API
  - Polls for completion (5-second intervals)
  - Requires GitHub repository
  - Pulls changes from remote branch

#### 7. **Change Detection & Fallback** (src/orchestrator.ts:143-158)

After agent completes:

```typescript
const status = await git.status();
const hasMeaningfulChanges = status.files.some(
  (file) => !file.path.startsWith('.ob1/')
);

if (!hasMeaningfulChanges) {
  // Agent produced no real changes - create fallback file
  const fallbackMessage = `Agent ${name} produced no changes...`;
  const fallbackFilePath = await writeFallbackFile(dir, name, fallbackMessage);
  // This ensures we always have something to commit
}
```

#### 8. **Commit Creation** (src/orchestrator.ts:164-169)

```typescript
const commitMessage = `ob1(${agent}): ${message}`;
const commitSha = await commitAll(worktreeDir, commitMessage);
```

Example commit message: `ob1(codex): Add error handling to the main CLI entry point`

#### 9. **Branch Push & PR Creation** (src/orchestrator.ts:175-199)

If not in dry-run mode:

```typescript
// Push branch to origin
await pushBranch(context.dir, context.branch);

// Create GitHub pull request
const prTitle = `[ob1] Agent: ${agent} — ${message}`;
const prBody = buildPrBody({
  agent, branch, message, changedFiles
});
const prUrl = await createPullRequest(githubToken, {
  owner, repo, base, head: branch, title: prTitle, body: prBody
});
```

**PR Body Format:**
```markdown
## Agent: codex

**Task:** Add error handling to the main CLI entry point

**Branch:** `agent/codex/20241111123045-a8f3`
**Base:** `main`
**Files Changed:** 3

---

*Generated by ob1 orchestrator*
```

#### 10. **Artifact Generation** (src/orchestrator.ts:249-254)

Creates final artifacts:

```typescript
// Summary JSON with all results
await writeJsonFile(
  path.join(runRoot, 'summary.json'),
  summary
);

// Event log (JSONL format)
await logger.log({
  event: 'finish',
  taskId,
  agents: executionSummaries.map(a => a.agent)
});
```

### Execution Timeline Example

```
00:00 - Task initiated: "Add error handling"
00:01 - Worktrees created: codex, claude
00:02 - [codex] Agent started
00:02 - [claude] Agent started
00:15 - [codex] Reading files...
00:18 - [claude] Analyzing codebase...
00:45 - [codex] Editing src/cli.ts
01:02 - [claude] Creating error handler
01:30 - [codex] Running tests
01:45 - [codex] Completed (103s)
02:00 - [claude] Writing documentation
02:15 - [claude] Completed (133s)
02:16 - Commits created
02:18 - Branches pushed
02:20 - PRs created
02:20 - Run complete
```

---

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  (src/cli.ts - Command parsing, option validation)          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Core                         │
│  (src/orchestrator.ts - Workflow coordination)              │
│                                                              │
│  • Environment validation    • Worktree management          │
│  • Agent selection          • Parallel execution            │
│  • Git operations           • PR creation                   │
│  • Artifact generation      • Error handling                │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────┐      ┌──────────────────────────────┐
│   Agent Runners       │      │    Utility Modules           │
│  (src/agents/)        │      │   (src/util/, src/*.ts)      │
│                       │      │                              │
│  • claude.ts          │      │  • env.ts (validation)       │
│  • codex.ts           │      │  • fs.ts (file ops)          │
│  • cursor.ts          │      │  • git.ts (git ops)          │
│  • types.ts           │      │  • pr.ts (GitHub API)        │
│  • index.ts           │      │  • run-logger.ts (JSONL)     │
└───────────────────────┘      └──────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│                                                              │
│  • Anthropic API (Claude)                                   │
│  • OpenAI API (Codex)                                       │
│  • Cursor Cloud API                                         │
│  • GitHub API (PRs)                                         │
│  • MCP Servers (Optional)                                   │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
cli-agent/
├── src/
│   ├── agents/              # Agent implementations
│   │   ├── claude.ts        # Claude Agent SDK integration
│   │   ├── codex.ts         # OpenAI Codex SDK integration
│   │   ├── cursor.ts        # Cursor Cloud API integration
│   │   ├── types.ts         # Shared agent types
│   │   └── index.ts         # Agent registry
│   ├── util/                # Utility modules
│   │   ├── env.ts           # Environment validation
│   │   ├── fs.ts            # File system operations
│   │   ├── mcp.ts           # MCP server loading
│   │   └── run-logger.ts    # JSONL event logging
│   ├── cli.ts               # CLI entry point
│   ├── orchestrator.ts      # Main orchestration logic
│   ├── git.ts               # Git operations
│   └── pr.ts                # GitHub PR creation
├── config/
│   └── mcp.config.json      # MCP server manifest
├── runs/                    # Execution artifacts (gitignored)
│   └── <taskId>/
│       ├── run.jsonl        # Event log
│       └── summary.json     # Execution summary
├── work/                    # Agent worktrees (gitignored)
│   └── <agent>/<taskId>/
│       ├── .ob1/
│       │   ├── scratchpad.md
│       │   └── todo.md
│       └── <project files>
├── tests/
│   └── orchestrator.spec.ts
├── dist/                    # Compiled JavaScript (gitignored)
├── package.json
├── tsconfig.json
├── .env                     # Your secrets (gitignored)
├── .env.example             # Template
└── README.md
```

### Key Design Patterns

#### 1. **Agent Runner Interface** (src/agents/types.ts:20-23)

All agents implement a common interface:

```typescript
export interface AgentRunner {
  checkEnv(): Promise<void> | void;    // Validate agent-specific env
  run(context: AgentContext): Promise<AgentRunResult>;  // Execute task
}
```

This allows the orchestrator to treat all agents uniformly.

#### 2. **Context Passing** (src/agents/types.ts:3-11)

Each agent receives an `AgentContext`:

```typescript
export type AgentContext = {
  name: AgentName;           // 'codex' | 'claude' | 'cursor'
  dir: string;               // Worktree directory path
  branch: string;            // Git branch name
  prompt: string;            // Task description
  scratchpadPath: string;    // Path to scratchpad.md
  todoPath: string;          // Path to todo.md
  taskId: string;            // Unique run identifier
};
```

#### 3. **Concurrency Control** (src/orchestrator.ts:123)

Uses `p-limit` for controlled parallel execution:

```typescript
const limit = pLimit(options.k);  // Max k concurrent agents

await Promise.all(
  agentContexts.map(ctx => limit(async () => {
    // Each agent runs within the limit
  }))
);
```

#### 4. **Event Logging** (src/util/run-logger.ts)

JSONL format for streaming event logs:

```typescript
export class RunLogger {
  async log(event: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    });
    await fs.appendFile(this.logPath, line + '\n');
  }
}
```

#### 5. **Git Worktree Isolation** (src/git.ts:30-45)

Each agent gets its own worktree:

```typescript
export async function createWorktree(
  repoDir: string,
  worktreeDir: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  // Remove existing worktree if present
  await execa('git', ['worktree', 'remove', worktreeDir, '--force'], {
    cwd: repoDir,
    reject: false,
  });

  // Create new worktree with new branch from base
  await execa('git', ['worktree', 'add', '-B', branch, worktreeDir, baseBranch], {
    cwd: repoDir,
  });
}
```

---

## Configuration

### Environment Variables

#### Required Variables

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `CLAUDE_API_KEY` | Anthropic Claude API access | https://console.anthropic.com/settings/keys |
| `CODEX_CLI_KEY` | OpenAI Codex SDK (same as OPENAI_API_KEY) | https://platform.openai.com/api-keys |
| `OPENAI_API_KEY` | OpenAI API access | https://platform.openai.com/api-keys |
| `CURSOR_API_KEY` | Cursor Cloud API access | https://cursor.com/settings (Pro required) |
| `GITHUB_TOKEN` | GitHub API access for PRs | https://github.com/settings/tokens (needs `repo` scope) |

#### Optional MCP Variables

Model Context Protocol (MCP) servers provide additional tools to agents.

**Shadcn UI Integration:**
```bash
SHADCN_REGISTRY_URL=https://www.shadcn.io/api/mcp
SHADCN_REGISTRY_TOKEN=<from-shadcn-dashboard>
```

**Supabase Integration:**
```bash
QUERY_API_KEY=<your-key>
SUPABASE_PROJECT_REF=<project-id>
SUPABASE_DB_PASSWORD=<db-password>
SUPABASE_REGION=us-east-1
SUPABASE_ACCESS_TOKEN=<access-token>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Codex Bridge:**
```bash
CODEX_APPROVAL_POLICY=never  # Full autonomy
```

See `docs/MCP_GUIDE.md` for detailed MCP setup instructions.

### .env File Setup

1. **Copy template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`:**
   ```bash
   # Use your preferred editor
   nano .env
   # or
   code .env
   ```

3. **Add required keys:**
   - Paste API keys from respective platforms
   - Ensure no extra whitespace
   - No quotes needed around values

4. **Validate:**
   ```bash
   npx ob1 doctor
   ```

### MCP Configuration

MCP servers are configured in `config/mcp.config.json`:

```json
{
  "mcpServers": {
    "shadcn-ui": {
      "command": "npx",
      "args": ["-y", "@shadcn/mcp-server"],
      "env": {
        "SHADCN_REGISTRY_URL": "${env:SHADCN_REGISTRY_URL}",
        "SHADCN_REGISTRY_TOKEN": "${env:SHADCN_REGISTRY_TOKEN}"
      }
    }
  }
}
```

The `${env:VAR}` placeholders are automatically replaced with values from `.env`.

### Environment Validation

**Check all variables:**
```bash
npx ob1 doctor
```

**Programmatic validation** (src/util/env.ts:50-65):
```typescript
export async function runDoctor(): Promise<void> {
  const results = validateEnvKeys();
  for (const result of results) {
    consola.info(`${result.present ? '✅' : '❌'} ${result.key}`);
  }
  // ...
}
```

---

## CLI Commands

### Main Command

```bash
npx ob1 [options]
```

#### Required Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--message <text>` | `-m` | Task description for agents | `-m "Add login page"` |
| `-k <count>` | `-k` | Number of agents (1-3) | `-k 2` |

#### Optional Options

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <path>` | Current repo | Target repository (URL or path) |
| `--base <branch>` | `main` | Base branch to branch from |
| `--agents <list>` | All agents | Comma-separated agent names |
| `--dry` | `false` | Skip pushing and PR creation |
| `--allow-dirty` | `false` | Allow uncommitted changes |
| `--timeout-ms <ms>` | Agent default | Per-agent timeout |
| `--work-root <path>` | `work` | Custom worktree directory |

### Examples

#### Basic Usage

**Run 2 agents on current repo:**
```bash
npx ob1 -m "Add error handling to API routes" -k 2
```

**Dry run (no PRs):**
```bash
npx ob1 -m "Refactor database layer" -k 2 --dry
```

**Specific agents:**
```bash
npx ob1 -m "Implement caching" -k 2 --agents codex,claude
```

#### Advanced Usage

**Different base branch:**
```bash
npx ob1 -m "Fix bug #123" -k 1 --base develop --agents claude
```

**External repository:**
```bash
npx ob1 -m "Add tests" -k 3 --repo /path/to/other/repo
```

**Allow dirty working directory:**
```bash
npx ob1 -m "Quick experiment" -k 1 --allow-dirty --dry
```

**Custom timeout (5 minutes):**
```bash
npx ob1 -m "Long task" -k 1 --timeout-ms 300000
```

**Custom work directory:**
```bash
npx ob1 -m "Task" -k 2 --work-root /tmp/ob1-work
```

### Doctor Command

Validates environment configuration:

```bash
npx ob1 doctor
```

**Output:**
```
Environment configuration check
--------------------------------
✅ CLAUDE_API_KEY
✅ CODEX_CLI_KEY
✅ OPENAI_API_KEY
❌ CURSOR_API_KEY
✅ GITHUB_TOKEN
⚠ Some environment variables are missing.
```

### Development Commands

**Run from source (no build):**
```bash
npm run dev -- -m "Task" -k 1 --dry
```

**Build TypeScript:**
```bash
npm run build
```

**Clean build artifacts:**
```bash
npm run clean
```

**Run tests:**
```bash
npm test
```

**Lint code:**
```bash
npm run lint
```

---

## Run Artifacts

Every ob1 run generates artifacts for traceability and debugging.

### Directory Structure

```
runs/<taskId>/
├── run.jsonl          # Streaming event log
└── summary.json       # Final execution summary
```

**Example taskId:** `20241111123045-a8f3`
- Format: `YYYYMMDDHHmmSS-<random>`
- Generated in `src/git.ts:121-125`

### Event Log (run.jsonl)

JSONL format (one JSON object per line) with timestamped events.

**Example entries:**

```jsonl
{"timestamp":"2024-11-11T12:30:45.123Z","event":"start","taskId":"20241111123045-a8f3","agents":["codex","claude"],"message":"Add error handling"}
{"timestamp":"2024-11-11T12:30:46.456Z","event":"agent:start","agent":"codex","branch":"agent/codex/20241111123045-a8f3"}
{"timestamp":"2024-11-11T12:30:46.789Z","event":"agent:start","agent":"claude","branch":"agent/claude/20241111123045-a8f3"}
{"timestamp":"2024-11-11T12:32:15.234Z","event":"agent:success","agent":"codex","branch":"agent/codex/20241111123045-a8f3","commitSha":"abc123","prUrl":"https://github.com/user/repo/pull/42"}
{"timestamp":"2024-11-11T12:32:30.567Z","event":"agent:success","agent":"claude","branch":"agent/claude/20241111123045-a8f3","commitSha":"def456","prUrl":"https://github.com/user/repo/pull/43"}
{"timestamp":"2024-11-11T12:32:31.890Z","event":"finish","taskId":"20241111123045-a8f3","agents":["codex","claude"]}
```

**Event types:**

| Event | Description | Fields |
|-------|-------------|--------|
| `start` | Run initiated | `taskId`, `agents`, `message` |
| `agent:start` | Agent execution started | `agent`, `branch` |
| `agent:success` | Agent completed successfully | `agent`, `branch`, `commitSha`, `prUrl` |
| `agent:error` | Agent failed | `agent`, `branch`, `error` |
| `finish` | All agents completed | `taskId`, `agents` |
| `finish:with-error` | Some agents failed | `taskId`, `agents` |

**Parsing JSONL:**

```bash
# View all events
cat runs/<taskId>/run.jsonl | jq '.'

# Filter by event type
cat runs/<taskId>/run.jsonl | jq 'select(.event == "agent:success")'

# Extract PR URLs
cat runs/<taskId>/run.jsonl | jq -r 'select(.prUrl) | .prUrl'
```

### Summary JSON (summary.json)

Final structured summary of the entire run.

**Example:**

```json
{
  "taskId": "20241111123045-a8f3",
  "message": "Add error handling to API routes",
  "baseBranch": "main",
  "repoDir": "/Users/dev/project",
  "dryRun": false,
  "runRoot": "/Users/dev/project/runs/20241111123045-a8f3",
  "agents": [
    {
      "agent": "codex",
      "branch": "agent/codex/20241111123045-a8f3",
      "worktreePath": "/Users/dev/project/work/codex/20241111123045-a8f3",
      "commitSha": "abc123def456",
      "prUrl": "https://github.com/user/repo/pull/42",
      "changedFiles": 5
    },
    {
      "agent": "claude",
      "branch": "agent/claude/20241111123045-a8f3",
      "worktreePath": "/Users/dev/project/work/claude/20241111123045-a8f3",
      "commitSha": "def456abc789",
      "prUrl": "https://github.com/user/repo/pull/43",
      "changedFiles": 7
    }
  ]
}
```

**Fields:**

- `taskId`: Unique run identifier
- `message`: Original task description
- `baseBranch`: Base branch used
- `repoDir`: Repository root path
- `dryRun`: Whether this was a dry run
- `runRoot`: Path to run artifacts
- `agents[]`: Array of agent execution summaries
  - `agent`: Agent name
  - `branch`: Git branch created
  - `worktreePath`: Worktree location
  - `commitSha`: Git commit SHA (if successful)
  - `prUrl`: Pull request URL (if created)
  - `fallbackFile`: Fallback file path (if agent produced no changes)
  - `changedFiles`: Number of files modified
  - `error`: Error message (if agent failed)

### Worktree Artifacts

Each agent's worktree contains tracking files:

```
work/<agent>/<taskId>/.ob1/
├── scratchpad.md    # Agent's execution log
└── todo.md          # Agent's task checklist
```

#### Scratchpad Format (scratchpad.md)

Chronological log of agent actions:

```markdown
## 2024-11-11 12:30:46

Task: Add error handling to API routes

---

## 2024-11-11 12:30:47

Starting Claude Agent SDK query...

---

## 2024-11-11 12:30:50

Turn 1: I'll analyze the codebase to identify API routes that need error handling...

---

## 2024-11-11 12:31:15

Turn 2: I found 3 API routes without proper error handling. Adding try-catch blocks...

---

## 2024-11-11 12:32:00

Final result: Added error handling to all API routes with proper logging and user-friendly error messages.

---

## 2024-11-11 12:32:10

Duration: 85000ms (85.0s)
Cost: $0.1234 USD
Tokens: 15000 input, 3000 output
Turns: 8

---

## 2024-11-11 12:32:15

PR created: https://github.com/user/repo/pull/43
```

#### TODO Format (todo.md)

Task checklist:

```markdown
- [x] Initialise ob1 run
- [x] Initialize Claude Agent SDK
- [x] Claude Agent SDK execution completed
- [x] PR opened
- [x] ob1 run completed
```

### Accessing Artifacts

**List all runs:**
```bash
ls -lt runs/
```

**View latest run summary:**
```bash
cat runs/$(ls -t runs/ | head -1)/summary.json | jq '.'
```

**View agent scratchpad:**
```bash
cat work/claude/$(ls -t work/claude/ | head -1)/.ob1/scratchpad.md
```

**Find all PRs from runs:**
```bash
find runs -name "summary.json" -exec jq -r '.agents[].prUrl | select(. != null)' {} \;
```

---

## Development Workflow

### Setting Up Development Environment

1. **Fork and clone:**
   ```bash
   git clone https://github.com/your-username/ob1.git
   cd ob1
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Verify setup:**
   ```bash
   npm run build
   npx ob1 doctor
   ```

### Development Cycle

#### 1. Run from Source (No Build)

Use `tsx` for rapid iteration:

```bash
npm run dev -- -m "Test task" -k 1 --dry
```

This runs TypeScript directly without compiling.

#### 2. Make Changes

Edit files in `src/`:

```bash
# Example: Modify Claude agent
code src/agents/claude.ts
```

#### 3. Test Changes

**Quick test (dry run):**
```bash
npm run dev -- -m "Test new feature" -k 1 --dry --agents claude
```

**Full test:**
```bash
npm run build
npx ob1 -m "Test new feature" -k 1 --agents claude
```

#### 4. Run Tests

```bash
npm test
```

#### 5. Lint and Format

```bash
npm run lint
```

### Adding a New Agent

Want to add support for a new AI agent? Here's how:

1. **Create agent file:**

```typescript
// src/agents/newagent.ts
import { consola } from 'consola';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class NewAgentRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.NEWAGENT_API_KEY) {
      throw new Error('NEWAGENT_API_KEY must be set');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[newagent] Starting for task: ${context.prompt}`);

    // Your agent implementation here
    // 1. Initialize SDK/API client
    // 2. Execute task in context.dir
    // 3. Log to context.scratchpadPath
    // 4. Return result

    return {
      agent: context.name,
      summary: 'Task completed',
      notes: ['Duration: 60s', 'Files changed: 3'],
    };
  }
}

export default NewAgentRunner;
```

2. **Update agent types:**

```typescript
// src/agents/types.ts
export type AgentName = 'codex' | 'claude' | 'cursor' | 'newagent';
```

3. **Register agent:**

```typescript
// src/agents/index.ts
import { NewAgentRunner } from './newagent.js';

export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor', 'newagent'];

export function getAgentRunner(name: AgentName): AgentRunner {
  switch (name) {
    case 'codex':
      return new CodexRunner();
    case 'claude':
      return new ClaudeRunner();
    case 'cursor':
      return new CursorRunner();
    case 'newagent':
      return new NewAgentRunner();
    default:
      throw new Error(`Unknown agent: ${name}`);
  }
}
```

4. **Add environment variable:**

```typescript
// src/util/env.ts
const REQUIRED_ENV_KEYS = [
  'CLAUDE_API_KEY',
  'CODEX_CLI_KEY',
  'OPENAI_API_KEY',
  'CURSOR_API_KEY',
  'NEWAGENT_API_KEY',  // Add here
  'GITHUB_TOKEN',
] as const;
```

5. **Update .env.example:**

```bash
# New Agent
NEWAGENT_API_KEY=your-key-here
```

6. **Test:**

```bash
npm run dev -- -m "Test" -k 1 --agents newagent --dry
```

### Modifying Orchestrator Logic

Key orchestrator functions in `src/orchestrator.ts`:

| Lines | Function | Purpose |
|-------|----------|---------|
| 65-267 | `runOb1()` | Main orchestration logic |
| 99-121 | Worktree setup | Create agent worktrees |
| 128-232 | Agent execution | Parallel agent runs |
| 143-158 | Fallback handling | Detect empty changes |
| 164-169 | Commit creation | Git commit operations |
| 175-199 | PR creation | GitHub integration |

**Example modification:** Add custom logging

```typescript
// src/orchestrator.ts:136
spinner.text = `[${context.name}] running agent`;

// Add custom log
consola.info(`Agent ${context.name} starting with ${context.prompt.length} char prompt`);

const result = await runner.run(context);
```

### Git Workflow for Contributors

1. **Create feature branch:**
   ```bash
   git checkout -b feature/add-new-agent
   ```

2. **Make commits:**
   ```bash
   git add .
   git commit -m "feat: add support for new agent"
   ```

3. **Push and create PR:**
   ```bash
   git push origin feature/add-new-agent
   # Create PR on GitHub
   ```

4. **PR guidelines:**
   - Clear description of changes
   - Reference any related issues
   - Include test results
   - Update documentation if needed

---

## Testing

### Running Tests

**All tests:**
```bash
npm test
```

**Watch mode:**
```bash
npm test -- --watch
```

**Specific test file:**
```bash
npm test -- orchestrator.spec.ts
```

### Test Structure

Tests are in `tests/` directory using Vitest framework.

**Example test file** (tests/orchestrator.spec.ts):

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { runOb1, type OrchestratorOptions } from '../src/orchestrator.js';

describe('Orchestrator', () => {
  beforeAll(() => {
    // Setup test environment
  });

  it('should validate required options', async () => {
    const options: OrchestratorOptions = {
      message: '',  // Invalid: empty message
      k: 1,
      baseBranch: 'main',
      dryRun: true,
      allowDirty: false,
      workRoot: 'work',
    };

    await expect(runOb1(options)).rejects.toThrow();
  });

  it('should create worktrees for agents', async () => {
    // Test implementation
  });
});
```

### Manual Testing

#### Test with Dry Run

Always test with `--dry` first:

```bash
npm run dev -- -m "Test feature" -k 1 --dry --agents claude
```

This will:
- Create worktrees
- Run agents
- Create commits
- Skip pushing and PR creation

Check results in:
- `work/<agent>/<taskId>/` - Worktree changes
- `runs/<taskId>/` - Run artifacts

#### Test Individual Agents

Test each agent separately:

```bash
# Test Claude
npm run dev -- -m "Simple task" -k 1 --agents claude --dry

# Test Codex
npm run dev -- -m "Simple task" -k 1 --agents codex --dry

# Test Cursor (requires GitHub push)
npm run dev -- -m "Simple task" -k 1 --agents cursor --dry
```

#### Test Error Handling

**Dirty repository:**
```bash
echo "test" >> test.txt
npm run dev -- -m "Task" -k 1 --dry
# Should error: "Repository has uncommitted changes"

# Clean up
git checkout test.txt
```

**Missing environment variable:**
```bash
unset CLAUDE_API_KEY
npx ob1 doctor
# Should show: ❌ CLAUDE_API_KEY

# Restore
source .env
```

**Invalid options:**
```bash
npm run dev -- -k 1  # Missing -m
# Should error: "The --message option is required"

npm run dev -- -m "Task" -k 0  # Invalid k
# Should error: "must be a positive integer"
```

### Integration Testing

Test the full workflow end-to-end:

1. **Create test repository:**
   ```bash
   mkdir /tmp/ob1-test-repo
   cd /tmp/ob1-test-repo
   git init
   echo "# Test" > README.md
   git add . && git commit -m "Initial"
   ```

2. **Run ob1 on test repo:**
   ```bash
   cd /path/to/ob1
   npm run dev -- --repo /tmp/ob1-test-repo -m "Add hello function" -k 1 --dry
   ```

3. **Verify artifacts:**
   ```bash
   ls -la /tmp/ob1-test-repo/work/
   ls -la /tmp/ob1-test-repo/runs/
   ```

4. **Check worktree changes:**
   ```bash
   cd /tmp/ob1-test-repo/work/claude/*/
   git diff HEAD^
   cat .ob1/scratchpad.md
   ```

### Performance Testing

**Test with timeout:**
```bash
npm run dev -- -m "Complex task" -k 1 --timeout-ms 30000 --dry
# Should timeout after 30 seconds
```

**Test parallel execution:**
```bash
time npm run dev -- -m "Task" -k 3 --dry
# All 3 agents should run in parallel
```

---

## Debugging

### Enable Verbose Logging

**For Cursor API debugging:**
```bash
export DEBUG=cursor
npx ob1 -m "Task" -k 1 --agents cursor --dry
```

**For all debugging:**
```bash
export VERBOSE=1
npx ob1 -m "Task" -k 2 --dry
```

### Common Debugging Techniques

#### 1. Check Agent Scratchpad

The scratchpad contains detailed agent execution logs:

```bash
# View latest Claude run
cat work/claude/$(ls -t work/claude/ | head -1)/.ob1/scratchpad.md
```

Look for:
- Error messages
- API responses
- File changes
- Turn-by-turn progress

#### 2. Inspect Run Logs

```bash
# View event log
cat runs/<taskId>/run.jsonl | jq '.'

# Filter for errors
cat runs/<taskId>/run.jsonl | jq 'select(.event == "agent:error")'
```

#### 3. Check Git Status

```bash
# In agent worktree
cd work/claude/<taskId>
git status
git log
git diff HEAD^
```

#### 4. Verify Environment

```bash
npx ob1 doctor
```

#### 5. Check API Connectivity

**Test Claude API:**
```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

**Test OpenAI API:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Test GitHub API:**
```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user
```

### Debugging Specific Issues

#### Issue: Agent produces no changes

**Check scratchpad for errors:**
```bash
cat work/<agent>/<taskId>/.ob1/scratchpad.md
```

**Look for:**
- SDK initialization errors
- Permission issues
- Timeout errors
- Empty responses

**Check if fallback was triggered:**
```bash
cat runs/<taskId>/summary.json | jq '.agents[] | select(.fallbackFile)'
```

#### Issue: PR creation fails

**Check GitHub token:**
```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user/repos
```

**Verify token has `repo` scope:**
- Go to https://github.com/settings/tokens
- Check token permissions

**Check remote repository:**
```bash
cd work/<agent>/<taskId>
git remote -v
# Should point to GitHub repository
```

#### Issue: Worktree creation fails

**List existing worktrees:**
```bash
git worktree list
```

**Manually remove stale worktree:**
```bash
git worktree remove work/<agent>/<taskId> --force
```

**Check disk space:**
```bash
df -h .
```

#### Issue: Agent timeout

**Increase timeout:**
```bash
npx ob1 -m "Complex task" -k 1 --timeout-ms 600000  # 10 minutes
```

**Check agent logs for infinite loops:**
```bash
cat work/<agent>/<taskId>/.ob1/scratchpad.md
# Look for repeated identical turns
```

#### Issue: "Storage mode is disabled" (Cursor)

**Cursor requires Privacy Mode to be disabled.**

Fix:
1. Open Cursor IDE
2. Go to Settings → Privacy
3. Disable "Privacy Mode" or enable "Storage Mode"
4. Cursor Cloud Agents require data retention

See: https://cursor.com/docs/cloud-agent

### Using Node.js Debugger

**Debug with VS Code:**

1. Add launch configuration (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug ob1",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--"],
      "args": ["-m", "Test task", "-k", "1", "--dry", "--agents", "claude"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

2. Set breakpoints in `src/`
3. Press F5 to start debugging

**Debug with Node inspector:**

```bash
node --inspect-brk node_modules/.bin/tsx src/cli.ts -m "Test" -k 1 --dry
```

Then open `chrome://inspect` in Chrome.

---

## Common Issues

### Installation & Setup Issues

#### Issue: `command not found: npx ob1`

**Cause:** Package not built or not in PATH.

**Solution:**
```bash
npm run build
# Verify dist/ directory exists
ls dist/cli.js

# Run directly
node dist/cli.js -m "Test" -k 1 --dry
```

#### Issue: `Cannot find module './orchestrator.js'`

**Cause:** Missing `.js` extensions in imports or build failed.

**Solution:**
```bash
npm run clean
npm run build
```

Verify all imports use `.js` extension:
```typescript
// Correct
import { foo } from './bar.js';

// Wrong
import { foo } from './bar';
```

#### Issue: Environment variables not loading

**Cause:** `.env` file not in correct location or not loaded.

**Solution:**
```bash
# Verify .env exists in project root
ls -la .env

# Check file contents
cat .env

# Verify no syntax errors (no spaces around =)
# Correct: KEY=value
# Wrong: KEY = value
```

### Runtime Issues

#### Issue: "Repository has uncommitted changes"

**Cause:** Git working directory is dirty.

**Solution:**
```bash
# Option 1: Commit changes
git add .
git commit -m "WIP"

# Option 2: Stash changes
git stash

# Option 3: Use --allow-dirty flag
npx ob1 -m "Task" -k 1 --allow-dirty
```

#### Issue: "Missing required environment variables"

**Cause:** API keys not set.

**Solution:**
```bash
# Run doctor to identify missing keys
npx ob1 doctor

# Add missing keys to .env
echo "CLAUDE_API_KEY=sk-ant-..." >> .env

# Verify
npx ob1 doctor
```

#### Issue: Agent runs but produces no output

**Possible causes:**
1. Agent hit timeout
2. Agent encountered error
3. API rate limit exceeded
4. Invalid prompt/task

**Debug steps:**

1. Check scratchpad:
```bash
cat work/<agent>/<taskId>/.ob1/scratchpad.md
```

2. Check event log:
```bash
cat runs/<taskId>/run.jsonl | jq 'select(.event == "agent:error")'
```

3. Verify API access:
```bash
# Test Claude
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
```

4. Try simpler task:
```bash
npx ob1 -m "Add a comment to README.md" -k 1 --agents <agent> --dry
```

### Git & Worktree Issues

#### Issue: "fatal: 'work/agent/taskId' already exists"

**Cause:** Stale worktree from previous run.

**Solution:**
```bash
# List worktrees
git worktree list

# Remove stale worktree
git worktree remove work/<agent>/<taskId> --force

# Remove worktree directory if it persists
rm -rf work/<agent>/<taskId>
```

#### Issue: "No git remote configured"

**Cause:** Repository has no remote (local repo).

**Solution:**
```bash
# Add GitHub remote
git remote add origin https://github.com/user/repo.git

# Or use dry run if you don't need PRs
npx ob1 -m "Task" -k 1 --dry
```

#### Issue: Push fails with "permission denied"

**Cause:** GitHub token lacks permissions or SSH key not configured.

**Solution:**

For HTTPS:
```bash
# Verify token has repo scope
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user/repos

# Update remote to use token
git remote set-url origin https://$GITHUB_TOKEN@github.com/user/repo.git
```

For SSH:
```bash
# Verify SSH key
ssh -T git@github.com

# Add SSH key if needed
ssh-keygen -t ed25519
# Add public key to https://github.com/settings/keys
```

### Agent-Specific Issues

#### Claude: "Invalid API key"

**Solution:**
```bash
# Verify key format (starts with sk-ant-)
echo $CLAUDE_API_KEY

# Get new key from https://console.anthropic.com/settings/keys
```

#### Codex: "Model not found"

**Solution:**
- Verify OpenAI API key is valid
- Check account has access to GPT-4
- Try updating `@openai/codex-sdk`

#### Cursor: "Storage mode is disabled"

**Solution:**
1. Open Cursor IDE
2. Settings → Privacy
3. Disable "Privacy Mode"
4. See: https://cursor.com/docs/cloud-agent

#### Cursor: "Repository must be on GitHub"

**Cause:** Cursor Cloud only works with GitHub repos.

**Solution:**
- Push your repo to GitHub
- Or exclude Cursor: `--agents codex,claude`

### Performance Issues

#### Issue: Agents taking too long

**Solutions:**

1. **Increase timeout:**
```bash
npx ob1 -m "Task" -k 1 --timeout-ms 900000  # 15 minutes
```

2. **Simplify task:**
- Break complex tasks into smaller subtasks
- Be more specific in prompt
- Limit scope with additional context

3. **Check agent logs:**
```bash
cat work/<agent>/<taskId>/.ob1/scratchpad.md
# Look for repeated attempts or stuck operations
```

#### Issue: High API costs

**Monitor costs:**
```bash
# Check summary for cost data
cat runs/<taskId>/summary.json | jq '.agents[].notes[] | select(contains("Cost"))'
```

**Reduce costs:**
- Use dry runs for testing
- Use fewer agents
- Be more specific in prompts to reduce turns
- Set tighter timeouts

### Troubleshooting Checklist

When something goes wrong:

- [ ] Run `npx ob1 doctor` to check environment
- [ ] Check scratchpad: `work/<agent>/<taskId>/.ob1/scratchpad.md`
- [ ] Check event log: `runs/<taskId>/run.jsonl`
- [ ] Verify git status: `git status` (should be clean)
- [ ] Check disk space: `df -h .`
- [ ] Test with dry run first
- [ ] Try single agent: `-k 1`
- [ ] Check API connectivity (see [Debugging](#debugging))
- [ ] Review recent runs: `ls -lt runs/`
- [ ] Clean stale worktrees: `git worktree prune`

### Getting Help

If you're still stuck:

1. **Check documentation:**
   - `README.md` - Quick start
   - `docs/MCP_GUIDE.md` - MCP integration
   - This guide - Comprehensive reference

2. **Review example runs:**
   ```bash
   # Find successful runs
   find runs -name summary.json -exec jq -r 'select(.agents[].prUrl) | .taskId' {} \;
   ```

3. **Create minimal reproduction:**
   ```bash
   # Simplest possible command
   npx ob1 -m "Add a comment" -k 1 --agents claude --dry
   ```

4. **Gather debug info:**
   - Output of `npx ob1 doctor`
   - Contents of `runs/<taskId>/run.jsonl`
   - Contents of `work/<agent>/<taskId>/.ob1/scratchpad.md`
   - Full error message

5. **Open GitHub issue:**
   - Include debug info above
   - Include steps to reproduce
   - Include environment details (OS, Node version)

---

## Appendix

### File Reference Quick Links

**Core Files:**
- CLI Entry Point: `src/cli.ts`
- Main Orchestrator: `src/orchestrator.ts`
- Git Operations: `src/git.ts`
- PR Creation: `src/pr.ts`

**Agent Implementations:**
- Claude: `src/agents/claude.ts`
- Codex: `src/agents/codex.ts`
- Cursor: `src/agents/cursor.ts`
- Types: `src/agents/types.ts`
- Registry: `src/agents/index.ts`

**Utilities:**
- Environment: `src/util/env.ts`
- File System: `src/util/fs.ts`
- MCP: `src/util/mcp.ts`
- Logging: `src/util/run-logger.ts`

**Configuration:**
- Environment: `.env` (your secrets)
- MCP Servers: `config/mcp.config.json`

**Tests:**
- Orchestrator: `tests/orchestrator.spec.ts`

### Related Documentation

- `README.md` - Project overview and quick start
- `docs/MCP_GUIDE.md` - MCP server setup and configuration
- `.env.example` - Environment variable template

### External Resources

**Agent SDKs:**
- Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk
- OpenAI Codex SDK: https://github.com/openai/codex-sdk
- Cursor Cloud API: https://cursor.com/docs/cloud-agent

**API Documentation:**
- Anthropic API: https://docs.anthropic.com/
- OpenAI API: https://platform.openai.com/docs
- GitHub API: https://docs.github.com/rest

**Tools:**
- Model Context Protocol: https://modelcontextprotocol.io/
- Git Worktrees: https://git-scm.com/docs/git-worktree

### Glossary

- **Agent**: An AI coding assistant (Claude, Codex, or Cursor)
- **Worktree**: A separate checkout of the git repository
- **Task ID**: Unique identifier for an ob1 run (e.g., `20241111123045-a8f3`)
- **Scratchpad**: Agent execution log in `.ob1/scratchpad.md`
- **TODO Ledger**: Task checklist in `.ob1/todo.md`
- **Fallback File**: Auto-generated file when agent produces no changes
- **Dry Run**: Execution mode that skips pushing and PR creation
- **MCP**: Model Context Protocol for extending agent capabilities
- **JSONL**: JSON Lines format (one JSON object per line)

---

**Last Updated:** 2024-11-11

**Version:** 0.1.0

**Maintainers:** ob1 contributors

For issues and contributions, visit the GitHub repository.
