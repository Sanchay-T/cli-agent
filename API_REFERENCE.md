# ob1 API Reference

Complete API reference for the ob1 CLI orchestrator.

## Table of Contents

1. [CLI Commands](#cli-commands)
2. [Environment Variables](#environment-variables)
3. [Core Interfaces](#core-interfaces)
4. [Git Operations](#git-operations)
5. [Filesystem Utilities](#filesystem-utilities)
6. [Logging API](#logging-api)
7. [Pull Request Operations](#pull-request-operations)
8. [MCP Configuration](#mcp-configuration)
9. [Type Definitions](#type-definitions)
10. [Configuration Files](#configuration-files)

---

## CLI Commands

### `ob1 [options]`

Run multiple AI coding agents in parallel on a git repository.

#### Options

| Option | Type | Description | Default | Required |
|--------|------|-------------|---------|----------|
| `-m, --message <message>` | string | Task message shared with all agents | - | Yes |
| `-k <count>` | number | Number of agents to run in parallel (max 3) | - | Yes |
| `--repo <repo>` | string | Target repository (URL or local path) | Current repo | No |
| `--base <branch>` | string | Base branch to start from | `main` | No |
| `--agents <agents>` | string | Comma-separated list of agents to run (codex,claude,cursor) | All agents | No |
| `--dry` | boolean | Dry run: skip pushing commits and creating PRs | `false` | No |
| `--allow-dirty` | boolean | Allow running with a dirty repository state | `false` | No |
| `--timeout-ms <timeout>` | number | Per-agent timeout in milliseconds | - | No |
| `--work-root <path>` | string | Custom work directory root | `work` | No |

#### Usage Examples

```bash
# Run 2 agents with a task message
ob1 -k 2 -m "Implement user authentication"

# Run specific agents
ob1 -k 2 -m "Add login page" --agents claude,codex

# Dry run (no push/PR)
ob1 -k 1 -m "Test changes" --dry

# Custom base branch
ob1 -k 2 -m "Fix bug" --base develop

# Allow dirty repo
ob1 -k 1 -m "Quick fix" --allow-dirty

# Custom timeout
ob1 -k 3 -m "Complex task" --timeout-ms 300000
```

### `ob1 doctor`

Validate environment configuration and required secrets.

#### Description

Checks all required environment variables and reports which ones are missing or present. Exits with code 1 if any required variables are missing.

#### Usage

```bash
ob1 doctor
```

#### Output Example

```
Environment configuration check
--------------------------------
✅ CLAUDE_API_KEY
✅ CODEX_CLI_KEY
✅ OPENAI_API_KEY
✅ CURSOR_API_KEY
❌ GITHUB_TOKEN
```

---

## Environment Variables

### Required Variables

All required environment variables are defined in `src/util/env.ts`:

| Variable | Purpose | Used By |
|----------|---------|---------|
| `CLAUDE_API_KEY` | Authentication for Anthropic Claude API | Claude agent |
| `CODEX_CLI_KEY` | Authentication for OpenAI Codex CLI | Codex agent |
| `OPENAI_API_KEY` | Authentication for OpenAI API | Codex agent |
| `CURSOR_API_KEY` | Authentication for Cursor Cloud API | Cursor agent |
| `GITHUB_TOKEN` | GitHub personal access token for creating PRs | PR creation |

### Optional MCP Variables

Variables for Model Context Protocol (MCP) server configuration:

#### Shadcn Studio

| Variable | Default | Description |
|----------|---------|-------------|
| `SHADCN_REGISTRY_URL` | `https://www.shadcn.io/api/mcp` | Shadcn registry URL |
| `SHADCN_REGISTRY_TOKEN` | - | Shadcn registry token |

#### Supabase

| Variable | Default | Description |
|----------|---------|-------------|
| `QUERY_API_KEY` | - | Supabase query API key |
| `SUPABASE_PROJECT_REF` | - | Supabase project reference |
| `SUPABASE_DB_PASSWORD` | - | Supabase database password |
| `SUPABASE_REGION` | `us-east-1` | Supabase region |
| `SUPABASE_ACCESS_TOKEN` | - | Supabase access token |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase service role key |

#### Codex Bridge

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_APPROVAL_POLICY` | `never` | Codex approval policy |

### Environment Loading

```typescript
import { ensureEnvLoaded, assertRequiredEnv, validateEnvKeys } from './util/env.js';

// Load .env file
ensureEnvLoaded();

// Check all required variables are present (throws if missing)
assertRequiredEnv();

// Check specific variables
assertRequiredEnv(['CLAUDE_API_KEY', 'GITHUB_TOKEN']);

// Get validation results
const results = validateEnvKeys();
// Returns: Array<{ key: string, present: boolean }>
```

---

## Core Interfaces

### OrchestratorOptions

Configuration options for the orchestrator.

```typescript
type OrchestratorOptions = {
  message: string;        // Task message for all agents
  k: number;              // Number of agents to run in parallel
  repo?: string;          // Target repository path or URL
  baseBranch: string;     // Base branch name
  dryRun: boolean;        // Skip push/PR if true
  agents?: string[];      // Optional list of agent names
  allowDirty: boolean;    // Allow uncommitted changes
  timeoutMs?: number;     // Per-agent timeout
  workRoot: string;       // Work directory root path
};
```

### AgentContext

Context provided to each agent during execution.

```typescript
type AgentContext = {
  name: AgentName;           // Agent identifier (codex|claude|cursor)
  dir: string;               // Worktree directory path
  branch: string;            // Git branch name
  prompt: string;            // Task prompt/message
  scratchpadPath: string;    // Path to scratchpad.md
  todoPath: string;          // Path to todo.md
  taskId: string;            // Unique task identifier
};
```

#### Usage in Agent

```typescript
async function run(context: AgentContext): Promise<AgentRunResult> {
  // Access worktree directory
  const workDir = context.dir;

  // Read/write to scratchpad
  await appendScratchpadEntry(context.scratchpadPath, 'Started processing');

  // Update todo list
  await appendTodo(context.todoPath, 'Complete implementation', false);

  return {
    agent: context.name,
    summary: 'Task completed',
    notes: ['Changed files: 3', 'Added tests']
  };
}
```

### AgentRunner

Interface that all agent implementations must implement.

```typescript
interface AgentRunner {
  // Validate required environment variables
  checkEnv(): Promise<void> | void;

  // Execute agent task
  run(context: AgentContext): Promise<AgentRunResult>;
}
```

#### Implementation Example

```typescript
class MyAgentRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.MY_AGENT_KEY) {
      throw new Error('MY_AGENT_KEY is required');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    // Implement agent logic
    await appendScratchpadEntry(context.scratchpadPath, 'Started');

    // Do work in context.dir

    return {
      agent: context.name,
      summary: 'Completed successfully',
      notes: ['Made changes', 'Updated files']
    };
  }
}
```

### AgentRunResult

Result returned by agent execution.

```typescript
type AgentRunResult = {
  agent: AgentName;         // Agent that produced the result
  summary: string;          // Human-readable summary
  notes?: string[];         // Optional array of notes/logs
  fallbackFile?: string;    // Path to fallback file if no changes
};
```

### AgentExecutionSummary

Summary of agent execution after completion.

```typescript
type AgentExecutionSummary = {
  agent: AgentName;         // Agent name
  branch: string;           // Git branch
  worktreePath: string;     // Worktree directory path
  commitSha?: string;       // Commit SHA if successful
  prUrl?: string;           // Pull request URL if created
  fallbackFile?: string;    // Fallback file path if no changes
  changedFiles: number;     // Number of changed files
  error?: string;           // Error message if failed
};
```

### OrchestratorSummary

Complete orchestrator run summary.

```typescript
type OrchestratorSummary = {
  taskId: string;                      // Unique task identifier
  message: string;                     // Task message
  baseBranch: string;                  // Base branch used
  repoDir: string;                     // Repository directory
  dryRun: boolean;                     // Whether it was a dry run
  runRoot: string;                     // Run output directory
  agents: AgentExecutionSummary[];     // Per-agent summaries
};
```

#### Usage

```typescript
import { runOb1 } from './orchestrator.js';

const summary = await runOb1({
  message: 'Implement feature X',
  k: 2,
  baseBranch: 'main',
  dryRun: false,
  allowDirty: false,
  workRoot: 'work'
});

console.log(`Task ID: ${summary.taskId}`);
console.log(`Agents: ${summary.agents.map(a => a.agent).join(', ')}`);
for (const agent of summary.agents) {
  console.log(`${agent.agent}: ${agent.prUrl || agent.error || 'completed'}`);
}
```

---

## Git Operations

All git operations are in `src/git.ts`.

### getRepoRoot()

Get the root directory of a git repository.

```typescript
async function getRepoRoot(repo?: string): Promise<string>
```

**Parameters:**
- `repo` (optional): Path to repository. If not provided, uses current directory.

**Returns:** Absolute path to repository root

**Example:**
```typescript
const repoPath = await getRepoRoot();
// Returns: '/Users/user/projects/my-repo'

const customRepo = await getRepoRoot('/path/to/repo');
// Returns: '/path/to/repo'
```

### ensureCleanRepo()

Verify repository has no uncommitted changes.

```typescript
async function ensureCleanRepo(repoDir: string, allowDirty: boolean): Promise<void>
```

**Parameters:**
- `repoDir`: Path to repository
- `allowDirty`: If `true`, skip check and allow dirty state

**Throws:** Error if repository has uncommitted changes and `allowDirty` is `false`

**Example:**
```typescript
try {
  await ensureCleanRepo('/path/to/repo', false);
  console.log('Repository is clean');
} catch (error) {
  console.error('Repository has uncommitted changes');
}
```

### createWorktree()

Create a git worktree with a new branch.

```typescript
async function createWorktree(
  repoDir: string,
  worktreeDir: string,
  branch: string,
  baseBranch: string
): Promise<void>
```

**Parameters:**
- `repoDir`: Main repository directory
- `worktreeDir`: Target worktree directory path
- `branch`: New branch name to create
- `baseBranch`: Base branch to branch from

**Example:**
```typescript
await createWorktree(
  '/path/to/repo',
  '/path/to/repo/work/claude/task-123',
  'agent/claude/task-123',
  'main'
);
```

**Notes:**
- Removes existing worktree at `worktreeDir` if present
- Creates necessary parent directories
- Uses `git worktree add -B` to create/reset branch

### removeWorktree()

Remove a git worktree.

```typescript
async function removeWorktree(repoDir: string, worktreeDir: string): Promise<void>
```

**Parameters:**
- `repoDir`: Main repository directory
- `worktreeDir`: Worktree directory to remove

**Example:**
```typescript
await removeWorktree('/path/to/repo', '/path/to/repo/work/claude/task-123');
```

### commitAll()

Stage and commit all changes in a worktree.

```typescript
async function commitAll(worktreeDir: string, message: string): Promise<string | undefined>
```

**Parameters:**
- `worktreeDir`: Worktree directory path
- `message`: Commit message

**Returns:** Commit SHA if successful, `undefined` if no changes to commit

**Example:**
```typescript
const sha = await commitAll(
  '/path/to/worktree',
  'ob1(claude): Implement authentication'
);
if (sha) {
  console.log(`Created commit: ${sha}`);
} else {
  console.log('No changes to commit');
}
```

### pushBranch()

Push a branch to remote origin.

```typescript
async function pushBranch(worktreeDir: string, branch: string): Promise<void>
```

**Parameters:**
- `worktreeDir`: Worktree directory path
- `branch`: Branch name to push

**Example:**
```typescript
await pushBranch('/path/to/worktree', 'agent/claude/task-123');
```

**Notes:**
- Sets upstream tracking with `--set-upstream`
- Pushes to `origin` remote

### getRepoInfo()

Extract repository owner and name from git remote.

```typescript
async function getRepoInfo(repoDir: string): Promise<RepoInfo>
```

**Parameters:**
- `repoDir`: Repository directory path

**Returns:** RepoInfo object

```typescript
type RepoInfo = {
  owner: string;    // Repository owner/organization
  name: string;     // Repository name
  remote: string;   // Full remote URL
};
```

**Example:**
```typescript
const info = await getRepoInfo('/path/to/repo');
// {
//   owner: 'myorg',
//   name: 'myrepo',
//   remote: 'git@github.com:myorg/myrepo.git'
// }
```

**Supported Remote Formats:**
- SSH: `git@github.com:owner/repo.git`
- HTTPS: `https://github.com/owner/repo.git`
- Local paths: `/path/to/repo` or `C:\path\to\repo`

### makeTaskId()

Generate a unique task identifier.

```typescript
function makeTaskId(): string
```

**Returns:** Unique task ID string in format `YYYYMMDDHHmmss-xxxx`

**Example:**
```typescript
const taskId = makeTaskId();
// Returns: '20251111123045-a3f9'
```

**Format:**
- Timestamp: `YYYYMMDDHHmmss` (15 characters)
- Random suffix: 4 alphanumeric characters
- Separator: `-`

---

## Filesystem Utilities

All filesystem utilities are in `src/util/fs.ts`.

### ensureDir()

Create a directory and all parent directories if they don't exist.

```typescript
async function ensureDir(dirPath: string): Promise<void>
```

**Parameters:**
- `dirPath`: Directory path to create

**Example:**
```typescript
await ensureDir('/path/to/nested/directory');
// Creates all directories in the path if they don't exist
```

**Notes:**
- Uses `mkdir` with `recursive: true`
- No-op if directory already exists

### appendLine()

Append a line to a file with automatic newline handling.

```typescript
async function appendLine(filePath: string, line: string): Promise<void>
```

**Parameters:**
- `filePath`: Path to file
- `line`: Line content to append (newline added if missing)

**Example:**
```typescript
await appendLine('/path/to/file.txt', 'New line content');
// Appends: "New line content\n"
```

**Notes:**
- Creates parent directories if needed
- Automatically adds newline if not present

### appendScratchpadEntry()

Append a markdown bullet point to scratchpad file.

```typescript
async function appendScratchpadEntry(filePath: string, entry: string): Promise<void>
```

**Parameters:**
- `filePath`: Path to scratchpad file
- `entry`: Entry content (bullet marker added automatically)

**Example:**
```typescript
await appendScratchpadEntry(
  '/path/to/.ob1/scratchpad.md',
  'Started processing task'
);
// Appends: "* Started processing task\n"
```

### appendTodo()

Append a todo item to todo file.

```typescript
async function appendTodo(filePath: string, item: string, done = false): Promise<void>
```

**Parameters:**
- `filePath`: Path to todo file
- `item`: Todo item description
- `done`: Whether item is completed (default: `false`)

**Example:**
```typescript
await appendTodo('/path/to/.ob1/todo.md', 'Implement feature', false);
// Appends: "- [ ] Implement feature\n"

await appendTodo('/path/to/.ob1/todo.md', 'Run tests', true);
// Appends: "- [x] Run tests\n"
```

### writeFallbackFile()

Create a fallback markdown file when agent produces no changes.

```typescript
async function writeFallbackFile(dir: string, agent: string, message: string): Promise<string>
```

**Parameters:**
- `dir`: Directory to write file in
- `agent`: Agent name
- `message`: Fallback message content

**Returns:** Absolute path to created file

**Example:**
```typescript
const filePath = await writeFallbackFile(
  '/path/to/worktree',
  'claude',
  'Agent produced no changes'
);
// Returns: '/path/to/worktree/ob1_result_claude.md'
```

**File Format:**
```markdown
# ob1 fallback result

{message}
```

### writeJsonFile()

Write data to a JSON file with pretty formatting.

```typescript
async function writeJsonFile(filePath: string, data: unknown): Promise<void>
```

**Parameters:**
- `filePath`: Path to JSON file
- `data`: Data to serialize

**Example:**
```typescript
await writeJsonFile('/path/to/summary.json', {
  taskId: 'task-123',
  agents: ['claude', 'codex']
});
```

**Notes:**
- Creates parent directories if needed
- Uses 2-space indentation
- Adds trailing newline

### appendJsonLine()

Append a JSON line to a file (JSONL format).

```typescript
async function appendJsonLine(filePath: string, data: unknown): Promise<void>
```

**Parameters:**
- `filePath`: Path to JSONL file
- `data`: Data to serialize (compact, no indentation)

**Example:**
```typescript
await appendJsonLine('/path/to/log.jsonl', {
  event: 'start',
  timestamp: '2025-11-11T12:30:45.123Z'
});
// Appends: {"event":"start","timestamp":"2025-11-11T12:30:45.123Z"}\n
```

**Use Case:** Event logging, streaming JSON data

### fileExists()

Check if a file exists.

```typescript
async function fileExists(filePath: string): Promise<boolean>
```

**Parameters:**
- `filePath`: Path to check

**Returns:** `true` if file exists, `false` otherwise

**Example:**
```typescript
if (await fileExists('/path/to/file.txt')) {
  console.log('File exists');
} else {
  console.log('File not found');
}
```

---

## Logging API

Event logging system in `src/util/run-logger.ts`.

### RunLogger

Logger class for recording orchestrator events.

```typescript
class RunLogger {
  constructor(filePath: string);
  async log(event: RunEvent): Promise<void>;
}
```

#### Constructor

```typescript
new RunLogger(filePath: string)
```

**Parameters:**
- `filePath`: Path to JSONL log file

#### log()

Log an event with automatic timestamp.

```typescript
async log(event: RunEvent): Promise<void>
```

**Parameters:**
- `event`: Event object with `event` property and additional data

```typescript
type RunEvent = Record<string, unknown> & { event: string };
```

#### Usage Example

```typescript
import { RunLogger } from './util/run-logger.js';

const logger = new RunLogger('/path/to/run.jsonl');

// Log start event
await logger.log({
  event: 'start',
  taskId: 'task-123',
  agents: ['claude', 'codex'],
  message: 'Implement feature'
});

// Log agent event
await logger.log({
  event: 'agent:start',
  agent: 'claude',
  branch: 'agent/claude/task-123'
});

// Log completion
await logger.log({
  event: 'finish',
  taskId: 'task-123',
  agents: ['claude', 'codex']
});
```

#### Event Types

Standard event types used by orchestrator:

| Event | Description | Additional Fields |
|-------|-------------|-------------------|
| `start` | Orchestrator started | `taskId`, `agents`, `message` |
| `agent:start` | Agent started | `agent`, `branch` |
| `agent:success` | Agent succeeded | `agent`, `branch`, `commitSha`, `prUrl` |
| `agent:error` | Agent failed | `agent`, `branch`, `error` |
| `finish` | All agents completed successfully | `taskId`, `agents` |
| `finish:with-error` | Completed with errors | `taskId`, `agents` |

#### Log File Format

Each line is a JSON object with timestamp:

```json
{"event":"start","taskId":"task-123","agents":["claude"],"message":"Fix bug","timestamp":"2025-11-11T12:30:45.123Z"}
{"event":"agent:start","agent":"claude","branch":"agent/claude/task-123","timestamp":"2025-11-11T12:30:46.456Z"}
{"event":"agent:success","agent":"claude","branch":"agent/claude/task-123","commitSha":"abc123","prUrl":"https://github.com/org/repo/pull/1","timestamp":"2025-11-11T12:35:12.789Z"}
{"event":"finish","taskId":"task-123","agents":["claude"],"timestamp":"2025-11-11T12:35:13.012Z"}
```

---

## Pull Request Operations

Pull request creation utilities in `src/pr.ts`.

### createPullRequest()

Create a GitHub pull request.

```typescript
async function createPullRequest(token: string, input: PullRequestInput): Promise<string>
```

**Parameters:**
- `token`: GitHub personal access token
- `input`: Pull request configuration

```typescript
type PullRequestInput = {
  owner: string;    // Repository owner/organization
  repo: string;     // Repository name
  base: string;     // Base branch (target)
  head: string;     // Head branch (source)
  title: string;    // PR title
  body: string;     // PR description (markdown)
};
```

**Returns:** Pull request HTML URL

**Example:**
```typescript
const prUrl = await createPullRequest(process.env.GITHUB_TOKEN, {
  owner: 'myorg',
  repo: 'myrepo',
  base: 'main',
  head: 'agent/claude/task-123',
  title: '[ob1] Agent: claude — Implement feature',
  body: '## Summary\n\nImplemented feature X...'
});

console.log(`PR created: ${prUrl}`);
// PR created: https://github.com/myorg/myrepo/pull/42
```

### buildPrBody()

Build a standardized PR description for ob1 agent runs.

```typescript
function buildPrBody(options: {
  agent: string;
  branch: string;
  message: string;
  changedFiles: number;
}): string
```

**Parameters:**
- `agent`: Agent name
- `branch`: Branch name
- `message`: Task message
- `changedFiles`: Number of changed files

**Returns:** Markdown-formatted PR body

**Example:**
```typescript
const body = buildPrBody({
  agent: 'claude',
  branch: 'agent/claude/task-123',
  message: 'Add user authentication',
  changedFiles: 5
});

console.log(body);
```

**Output:**
```markdown
## Agent
- Name: claude
- Branch: agent/claude/task-123
- Task: "Add user authentication"

## Summary
- Changed files: 5
- Notes: See .ob1/scratchpad.md

## Checklist
- [ ] Smoke-tested build
- [ ] TODOs triaged (see .ob1/todo.md)
```

---

## MCP Configuration

Model Context Protocol configuration in `config/mcp.config.json`.

### Configuration Format

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Shared MCP servers configuration",
  "servers": {
    "server-name": {
      "type": "stdio" | "http",
      "command": "command-to-run",
      "args": ["array", "of", "args"],
      "env": {
        "ENV_VAR": "${env:ENV_VAR_NAME|default-value}"
      }
    }
  }
}
```

### Environment Variable Substitution

Format: `${env:VAR_NAME|default_value}`

- `VAR_NAME`: Environment variable to read
- `default_value`: Optional default if not set
- Empty default: `${env:VAR_NAME|}` (empty string)

**Examples:**
```json
{
  "servers": {
    "example": {
      "env": {
        "API_KEY": "${env:MY_API_KEY}",
        "REGION": "${env:AWS_REGION|us-east-1}",
        "TOKEN": "${env:OPTIONAL_TOKEN|}"
      }
    }
  }
}
```

### Server Types

#### stdio

Execute a local command with stdin/stdout communication.

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["shadcn@latest", "mcp"],
  "env": {
    "API_KEY": "${env:SHADCN_API_KEY}"
  }
}
```

#### http

Connect to a remote HTTP endpoint.

```json
{
  "type": "http",
  "url": "${env:SERVICE_URL|https://api.example.com}"
}
```

### Example Configurations

#### Shadcn CLI

```json
{
  "shadcn-cli": {
    "type": "stdio",
    "command": "npx",
    "args": ["shadcn@latest", "mcp"],
    "env": {
      "SHADCN_REGISTRY_URL": "${env:SHADCN_REGISTRY_URL|https://www.shadcn.io/api/mcp}",
      "SHADCN_REGISTRY_TOKEN": "${env:SHADCN_REGISTRY_TOKEN|}"
    }
  }
}
```

#### Supabase

```json
{
  "supabase": {
    "type": "stdio",
    "command": "supabase-mcp-server",
    "env": {
      "QUERY_API_KEY": "${env:QUERY_API_KEY}",
      "SUPABASE_PROJECT_REF": "${env:SUPABASE_PROJECT_REF}",
      "SUPABASE_DB_PASSWORD": "${env:SUPABASE_DB_PASSWORD}",
      "SUPABASE_REGION": "${env:SUPABASE_REGION|us-east-1}"
    }
  }
}
```

#### Codex Bridge

```json
{
  "codex-bridge": {
    "type": "stdio",
    "command": "codex",
    "args": ["mcp-server"],
    "env": {
      "CODEX_APPROVAL_POLICY": "${env:CODEX_APPROVAL_POLICY|never}"
    }
  }
}
```

---

## Type Definitions

### Agent Types

```typescript
// Agent identifier
type AgentName = 'codex' | 'claude' | 'cursor';

// Agent context passed to runner
type AgentContext = {
  name: AgentName;
  dir: string;
  branch: string;
  prompt: string;
  scratchpadPath: string;
  todoPath: string;
  taskId: string;
};

// Result returned by agent
type AgentRunResult = {
  agent: AgentName;
  summary: string;
  notes?: string[];
  fallbackFile?: string;
};

// Agent runner interface
interface AgentRunner {
  checkEnv(): Promise<void> | void;
  run(context: AgentContext): Promise<AgentRunResult>;
}
```

### Orchestrator Types

```typescript
// Orchestrator configuration
type OrchestratorOptions = {
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

// Agent execution summary
type AgentExecutionSummary = {
  agent: AgentName;
  branch: string;
  worktreePath: string;
  commitSha?: string;
  prUrl?: string;
  fallbackFile?: string;
  changedFiles: number;
  error?: string;
};

// Complete orchestrator summary
type OrchestratorSummary = {
  taskId: string;
  message: string;
  baseBranch: string;
  repoDir: string;
  dryRun: boolean;
  runRoot: string;
  agents: AgentExecutionSummary[];
};
```

### Git Types

```typescript
// Repository information
type RepoInfo = {
  owner: string;    // GitHub owner/org
  name: string;     // Repository name
  remote: string;   // Remote URL
};
```

### Pull Request Types

```typescript
// PR creation input
type PullRequestInput = {
  owner: string;
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
};
```

### Environment Types

```typescript
// Required environment variable keys
const REQUIRED_ENV_KEYS = [
  'CLAUDE_API_KEY',
  'CODEX_CLI_KEY',
  'OPENAI_API_KEY',
  'CURSOR_API_KEY',
  'GITHUB_TOKEN',
] as const;

type RequiredEnvKey = typeof REQUIRED_ENV_KEYS[number];

// Environment check result
type EnvCheckResult = {
  key: RequiredEnvKey;
  present: boolean;
};
```

### Logging Types

```typescript
// Log event with arbitrary fields
type RunEvent = Record<string, unknown> & { event: string };
```

---

## Configuration Files

### .env

Environment variables configuration. Copy from `.env.example`:

```bash
# Anthropic Claude
CLAUDE_API_KEY=your-claude-key

# OpenAI Codex (CLI/SDK)
CODEX_CLI_KEY=your-openai-key
OPENAI_API_KEY=your-openai-key

# Cursor Cloud
CURSOR_API_KEY=your-cursor-key

# GitHub (for PRs)
GITHUB_TOKEN=your-github-token

# MCP — Shadcn Studio
SHADCN_REGISTRY_URL=https://www.shadcn.io/api/mcp
SHADCN_REGISTRY_TOKEN=

# MCP — Supabase
QUERY_API_KEY=
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=
SUPABASE_REGION=us-east-1
SUPABASE_ACCESS_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=

# MCP — Codex Bridge
CODEX_APPROVAL_POLICY=never
```

### package.json

Project configuration and dependencies.

```json
{
  "name": "ob1",
  "version": "0.1.0",
  "description": "Minimal CLI orchestrator for running multiple AI coding agents in parallel",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "ob1": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rimraf dist",
    "dev": "tsx src/cli.ts",
    "lint": "eslint .",
    "prepare": "npm run build",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.30",
    "@octokit/rest": "^20.0.2",
    "@openai/codex-sdk": "^0.57.0",
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "consola": "^3.2.3",
    "dotenv": "^16.4.5",
    "execa": "^8.0.1",
    "ora": "^8.0.1",
    "p-limit": "^5.0.0",
    "simple-git": "^3.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "eslint": "^9.8.0",
    "prettier": "^3.3.2",
    "typescript": "^5.5.4",
    "vitest": "^4.0.8"
  }
}
```

**Key Dependencies:**
- `@anthropic-ai/claude-agent-sdk`: Claude agent integration
- `@openai/codex-sdk`: Codex agent integration
- `@octokit/rest`: GitHub API client
- `commander`: CLI framework
- `consola`: Console logging
- `simple-git`: Git operations
- `p-limit`: Concurrency control
- `ora`: Terminal spinners

### tsconfig.json

TypeScript compiler configuration.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2020",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Key Settings:**
- **target**: ES2022 JavaScript output
- **module**: ES2020 module system
- **strict**: Full TypeScript strict mode
- **declaration**: Generate .d.ts files
- **resolveJsonModule**: Import JSON files

---

## Additional Notes

### Directory Structure

```
.
├── config/
│   └── mcp.config.json       # MCP server configuration
├── src/
│   ├── agents/
│   │   ├── types.ts          # Agent type definitions
│   │   ├── index.ts          # Agent registry
│   │   ├── claude.ts         # Claude agent
│   │   ├── codex.ts          # Codex agent
│   │   └── cursor.ts         # Cursor agent
│   ├── util/
│   │   ├── env.ts            # Environment utilities
│   │   ├── fs.ts             # Filesystem utilities
│   │   └── run-logger.ts     # Logging utilities
│   ├── cli.ts                # CLI entry point
│   ├── orchestrator.ts       # Main orchestrator
│   ├── git.ts                # Git operations
│   └── pr.ts                 # PR operations
├── runs/                     # Run output directory
│   └── {taskId}/
│       ├── run.jsonl         # Event log
│       └── summary.json      # Run summary
├── work/                     # Worktree directory
│   └── {agent}/{taskId}/     # Per-agent worktree
├── .env                      # Environment variables
├── package.json              # Package configuration
└── tsconfig.json             # TypeScript configuration
```

### Worktree Organization

Each agent runs in an isolated git worktree:

```
work/
├── claude/
│   └── 20251111123045-a3f9/
│       ├── .ob1/
│       │   ├── scratchpad.md
│       │   └── todo.md
│       └── {repository files}
├── codex/
│   └── 20251111123045-a3f9/
│       └── ...
└── cursor/
    └── 20251111123045-a3f9/
        └── ...
```

### Run Output Organization

Each run generates output in `runs/{taskId}/`:

```
runs/
└── 20251111123045-a3f9/
    ├── run.jsonl         # Event log (JSONL format)
    └── summary.json      # Run summary (JSON)
```

### Error Handling

The orchestrator uses the following error handling strategy:

1. **Environment validation**: Checks all required environment variables before starting
2. **Repository validation**: Ensures clean repository state (unless `--allow-dirty`)
3. **Parallel execution**: Agents run in parallel with independent error handling
4. **Graceful degradation**: If one agent fails, others continue
5. **Comprehensive logging**: All events logged to `run.jsonl`
6. **Summary generation**: Complete summary written even if errors occur

### Best Practices

1. **Always run `ob1 doctor`** before first use to validate environment
2. **Use `--dry` flag** for testing without pushing/creating PRs
3. **Check `.ob1/scratchpad.md`** in agent worktrees for execution details
4. **Review `.ob1/todo.md`** in agent worktrees for task tracking
5. **Use `--allow-dirty`** only when necessary (e.g., testing)
6. **Set `--timeout-ms`** for long-running tasks
7. **Review `runs/{taskId}/run.jsonl`** for detailed execution logs
8. **Check `runs/{taskId}/summary.json`** for structured output

---

**Version:** 0.1.0
**Last Updated:** 2025-11-11
