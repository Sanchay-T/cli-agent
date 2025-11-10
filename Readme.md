# ob1 — Minimal Multi-Agent Orchestrator

`ob1` is a CLI orchestrator that coordinates multiple AI coding agents in parallel on a single Git repository. Stage 1 delivers a vertical slice that prepares isolated git worktrees per agent, runs placeholder agent workflows, and produces per-agent branches, commits, and pull requests.

## Features

- `ob1` command that accepts a shared task message and runs up to three agents in parallel (`codex`, `claude`, `cursor`).
- Worktree isolation per agent with branches named `agent/<agent>/<taskId>`.
- Per-agent scratchpad and TODO ledger stored in `.ob1/`.
- Fallback guardrail that writes `ob1_result_<agent>.md` when an agent produces no changes.
- Run artifacts saved under `runs/<taskId>/` with JSONL event log and summary report.
- `ob1 doctor` to verify required environment variables.

## Getting Started

```bash
npm install
npm run build
```

Copy `.env.example` to `.env` and populate the required keys:

```bash
cp .env.example .env
# fill in CLAUDE_API_KEY, CODEX_CLI_KEY, OPENAI_API_KEY, CURSOR_API_KEY, GITHUB_TOKEN
```

## Usage

```bash
# Validate configuration
npx ob1 doctor

# Run three agents on the current repository
npx ob1 -m "Add a login page" -k 3

# Dry run without pushing or creating PRs
npx ob1 -m "Refactor utils" -k 2 --dry
```

Use `--repo` to target a different repository and `--base` to override the base branch. Additional optional flags include `--agents`, `--allow-dirty`, `--timeout-ms`, and `--work-root`.

## Development Notes

- Agents are currently placeholder implementations that populate scratchpads and TODO ledgers. Replace the bodies of `src/agents/*.ts` with real SDK/API integrations in future stages.
- Generated branches are pushed to the `origin` remote unless `--dry` is used.
- Run metadata is stored in `runs/<taskId>/run.jsonl` and `runs/<taskId>/summary.json` for traceability.
