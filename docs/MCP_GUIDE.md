# MCP Integration Guide

This document explains how `ob1` agents (Claude, Codex, Cursor) share a single Model Context Protocol (MCP) surface area. Populate the variables below in `.env`, then edit `config/mcp.config.json` whenever you add or remove servers.

## File Layout

| File | Purpose |
| --- | --- |
| `config/mcp.config.json` | Source-of-truth server manifest consumed by `src/util/mcp.ts`. |
| `.env` | Secrets used to hydrate `${env:VAR}` placeholders when the manifest loads. |
| `docs/MCP_GUIDE.md` | Human-readable instructions (this file). |

## Supported Servers

### 1. `shadcn-cli` — UI building blocks

- Command: `npx shadcn@latest mcp`
- Env: `SHADCN_REGISTRY_URL` (defaults to `https://www.shadcn.io/api/mcp`), optional `SHADCN_REGISTRY_TOKEN`
- Exposes `/cui`, `/iui`, and `/rui` slash commands to create, inspire, and refine interface blocks so agents can assemble shadcn/ui components without manual scaffolding.
- Works offline against your repo so new components land inside the active git worktree automatically.

### 2. `shadcn-cloud` — HTTP fallback

- Type: `http`
- URL: same as `SHADCN_REGISTRY_URL`
- Use when you want a stateless connection (e.g., Codex running remotely) without spawning the CLI process.

### 3. `supabase` — Database + auth

- Command: `supabase-mcp-server`
- Env:
  - `QUERY_API_KEY`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_DB_PASSWORD`
  - `SUPABASE_REGION` (default `us-east-1`)
  - Optional: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`
- Provides typed CRUD helpers plus schema introspection so agents can migrate, seed, or query Supabase projects from the same interface as UI tools.

### 4. `codex-bridge` — Codex-as-a-tool

- Command: `codex mcp-server`
- Env: `CODEX_APPROVAL_POLICY` (stick with `never` for fully autonomous subagents)
- Allows Claude (or future QA agents) to invoke Codex as a subordinate worker when you pit models against the same feature prompt.

## Wiring Claude & Codex

- Claude: `src/util/mcp.ts` loads the manifest at runtime and injects it into `@anthropic-ai/claude-agent-sdk` via the `mcpServers` option. Update this file if you need custom search paths.
- Codex: add matching `[[mcp]]` entries to `~/.codex/config.toml` pointing at the same commands/URLs so both agents speak the same protocol surface.

## Prompts & Subagents

- Encourage Claude subagents (`Analyst`, `Builder`, `Verifier`) to reference named MCP servers explicitly (e.g., “use `mcp:shadcn-cli` to generate UI”).
- Include a succinct MCP catalog in your system prompt so the agent knows which actions are available without exploratory tool calls.

## Adding New Servers

1. Install or expose the MCP provider (stdio/HTTP/SSE/sdk).
2. Add an entry in `config/mcp.config.json` using `${env:VAR|default}` tokens for secrets.
3. Export those secrets in `.env` (tracked via `.env.example` for reference).
4. Re-run `ob1 …` — each worktree automatically picks up updates because the manifest lives in source control.
