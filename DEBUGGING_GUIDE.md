# ob1 Debugging Guide

This guide helps you troubleshoot issues with the ob1 multi-agent orchestrator.

## Table of Contents

1. [Debug Mode](#1-debug-mode)
2. [Reading Run Artifacts](#2-reading-run-artifacts)
3. [Scratchpad Files](#3-scratchpad-files)
4. [TODO Ledgers](#4-todo-ledgers)
5. [Common Errors](#5-common-errors)
6. [Claude Issues](#6-claude-issues)
7. [Codex Issues](#7-codex-issues)
8. [Cursor Issues](#8-cursor-issues)
9. [Git Problems](#9-git-problems)
10. [PR Failures](#10-pr-failures)
11. [API Key Issues](#11-api-key-issues)
12. [Network/Timeout](#12-networktimeout)
13. [Manual Recovery](#13-manual-recovery)

---

## 1. Debug Mode

### Enabling Verbose Logging

ob1 uses `consola` for logging. To enable verbose output:

```bash
# Set NODE_ENV for more detailed logs
NODE_ENV=development npx ob1 -m "your task" -k 3

# For Cursor-specific debugging
DEBUG=cursor npx ob1 -m "your task" -k 1 --agents cursor

# For general verbose mode
VERBOSE=true npx ob1 -m "your task" -k 3
```

### Log Levels

- **info**: Standard operation messages
- **warn**: Non-fatal issues (e.g., fewer agents available than requested)
- **error**: Fatal errors that stop execution
- **success**: Agent completion messages
- **debug**: Detailed debugging information (requires DEBUG or VERBOSE env vars)

### What Gets Logged

- Agent start/stop events
- Git operations (worktree creation, commits, pushes)
- API requests and responses (in debug mode)
- File changes and status updates
- Cost and usage statistics

---

## 2. Reading Run Artifacts

Each ob1 run creates artifacts in `runs/<taskId>/`.

### run.jsonl

Event log in JSON Lines format. Each line is a timestamped event:

```bash
# View the entire log
cat runs/20251111070455-6cwx/run.jsonl

# Pretty-print JSON lines
cat runs/20251111070455-6cwx/run.jsonl | jq '.'

# Filter by event type
cat runs/20251111070455-6cwx/run.jsonl | jq 'select(.event == "agent:error")'

# View timestamps
cat runs/20251111070455-6cwx/run.jsonl | jq '{timestamp, event, agent}'
```

**Event Types:**
- `start`: Run initialization
- `agent:start`: Agent begins execution
- `agent:success`: Agent completed successfully
- `agent:error`: Agent encountered an error
- `finish`: All agents completed successfully
- `finish:with-error`: Run completed but at least one agent failed

**Example Event:**
```json
{
  "event": "agent:error",
  "agent": "claude",
  "branch": "agent/claude/20251111070455-6cwx",
  "error": "CLAUDE_API_KEY must be set to run the Claude agent.",
  "timestamp": "2025-11-11T07:04:55.123Z"
}
```

### summary.json

High-level summary of the entire run:

```bash
cat runs/20251111070455-6cwx/summary.json | jq '.'
```

**Structure:**
```json
{
  "taskId": "20251111070455-6cwx",
  "message": "Add a login page",
  "baseBranch": "main",
  "repoDir": "/path/to/repo",
  "dryRun": false,
  "runRoot": "runs/20251111070455-6cwx",
  "agents": [
    {
      "agent": "claude",
      "branch": "agent/claude/20251111070455-6cwx",
      "worktreePath": "work/claude/20251111070455-6cwx",
      "commitSha": "abc123...",
      "prUrl": "https://github.com/owner/repo/pull/42",
      "fallbackFile": "ob1_result_claude.md",
      "changedFiles": 5,
      "error": null
    }
  ]
}
```

**Interpreting Fields:**
- `commitSha`: Git commit hash (null if failed before commit)
- `prUrl`: GitHub PR URL (null in dry-run or if failed)
- `fallbackFile`: Present if agent produced no meaningful changes
- `changedFiles`: Number of files modified (0 if failed early)
- `error`: Error message (null if successful)

---

## 3. Scratchpad Files

Scratchpads track agent progress and decisions. Located at:
- Per-agent: `work/<agent>/<taskId>/.ob1/scratchpad.md`
- Repo-level: `.ob1/scratchpad.md` (summary entries)

### Reading Scratchpads

```bash
# View a specific agent's scratchpad
cat work/claude/20251111070455-6cwx/.ob1/scratchpad.md

# Watch in real-time (while agent is running)
tail -f work/claude/20251111070455-6cwx/.ob1/scratchpad.md

# Search for errors
grep -i "error" work/claude/20251111070455-6cwx/.ob1/scratchpad.md
```

### Scratchpad Contents

**Claude Agent:**
```markdown
[2025-11-11T07:04:55.123Z]
Task: Add a login page

[2025-11-11T07:04:56.234Z]
Starting Claude Agent SDK query...

[2025-11-11T07:04:58.345Z]
Turn 1: I'll start by creating a new login component...

[2025-11-11T07:05:15.678Z]
Final result: Successfully created login page with authentication

[2025-11-11T07:05:16.789Z]
Duration: 20456ms (20.5s)

[2025-11-11T07:05:16.790Z]
Cost: $0.0234 USD
```

**Codex Agent:**
```markdown
[2025-11-11T07:04:55.123Z]
Task: Add a login page

[2025-11-11T07:04:56.234Z]
Starting Codex Agent SDK...

[2025-11-11T07:04:57.345Z]
Thread started: thread_abc123

[2025-11-11T07:04:58.456Z]
Turn 1 started

[2025-11-11T07:05:02.567Z]
Executing: npm install @auth/core

[2025-11-11T07:05:10.678Z]
Files changed: create src/components/Login.tsx

[2025-11-11T07:05:15.789Z]
Turn 1 completed - Tokens: 1234 input, 567 output
```

**Cursor Agent:**
```markdown
[2025-11-11T07:04:55.123Z]
Task: Add a login page

[2025-11-11T07:04:56.234Z]
Detecting GitHub repository...

[2025-11-11T07:04:56.345Z]
Repository: https://github.com/owner/repo

[2025-11-11T07:04:58.456Z]
Agent created: agent_xyz789

[2025-11-11T07:04:59.567Z]
Status: CREATING

[2025-11-11T07:05:05.678Z]
Status: RUNNING

[2025-11-11T07:08:30.789Z]
Status: FINISHED

[2025-11-11T07:08:31.890Z]
Summary: Created login page with form validation
```

---

## 4. TODO Ledgers

TODO ledgers track agent execution milestones. Located at `work/<agent>/<taskId>/.ob1/todo.md`.

### Reading TODOs

```bash
cat work/claude/20251111070455-6cwx/.ob1/todo.md
```

### TODO Format

```markdown
- [x] Initialise ob1 run
- [x] Initialize Claude Agent SDK
- [x] Claude Agent SDK execution completed
- [x] ob1 run completed
```

**States:**
- `[ ]`: Pending (not started)
- `[x]`: Completed

### Troubleshooting with TODOs

If an agent fails, check which TODO was last completed:

```bash
# Find last completed TODO
grep -n "\[x\]" work/claude/20251111070455-6cwx/.ob1/todo.md | tail -1
```

This tells you where the agent stopped:
- Stopped at "Initialize Claude Agent SDK" → API key or SDK initialization issue
- Stopped at "Cursor agent created" → Problem during polling or completion
- No completed TODOs → Very early failure (env check, git issue)

---

## 5. Common Errors

### "Missing required environment variables"

**Error:**
```
Missing required environment variables: CLAUDE_API_KEY, OPENAI_API_KEY
```

**Solution:**
1. Check your `.env` file exists:
   ```bash
   ls -la .env
   ```

2. Verify it contains the required keys:
   ```bash
   grep -E "CLAUDE_API_KEY|OPENAI_API_KEY|CURSOR_API_KEY|GITHUB_TOKEN|CODEX_CLI_KEY" .env
   ```

3. Run the doctor command:
   ```bash
   npx ob1 doctor
   ```

4. Ensure values are not empty:
   ```bash
   # ❌ Wrong
   CLAUDE_API_KEY=

   # ✅ Correct
   CLAUDE_API_KEY=sk-ant-abc123...
   ```

### "Repository has uncommitted changes"

**Error:**
```
Repository has uncommitted changes. Use --allow-dirty to override.
```

**Solution:**
```bash
# Option 1: Commit your changes
git add .
git commit -m "WIP"

# Option 2: Stash changes
git stash

# Option 3: Override the check (not recommended)
npx ob1 -m "your task" -k 3 --allow-dirty
```

### "No valid agents selected"

**Error:**
```
No valid agents selected.
```

**Solution:**
Check agent names are correct (lowercase):
```bash
# ❌ Wrong
npx ob1 -m "task" -k 1 --agents Claude

# ✅ Correct
npx ob1 -m "task" -k 1 --agents claude

# Valid agent names
npx ob1 -m "task" -k 3 --agents claude,codex,cursor
```

### "Agent completed without producing any file changes"

**Error:**
```
Agent completed without producing any file changes.
```

**Cause:** The agent ran but didn't modify any files (even the fallback mechanism failed).

**Solution:**
1. Check the scratchpad for agent reasoning:
   ```bash
   cat work/<agent>/<taskId>/.ob1/scratchpad.md
   ```

2. Verify the task was clear and actionable

3. Check if the agent encountered errors but didn't throw (check SDK output)

### "Failed to create commit"

**Error:**
```
Failed to create commit.
```

**Solution:**
1. Check git configuration:
   ```bash
   git config user.name
   git config user.email
   ```

2. If empty, configure git:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

3. Check worktree permissions:
   ```bash
   ls -la work/<agent>/<taskId>/
   ```

---

## 6. Claude Issues

### "CLAUDE_API_KEY must be set to run the Claude agent"

**Error:**
```
CLAUDE_API_KEY must be set to run the Claude agent.
```

**Solution:**
1. Get API key from https://console.anthropic.com/
2. Add to `.env`:
   ```bash
   CLAUDE_API_KEY=sk-ant-api03-xxx
   ```
3. Verify:
   ```bash
   npx ob1 doctor
   ```

### "No final result received from Claude Agent SDK"

**Error:**
```
No final result received from Claude Agent SDK
```

**Cause:** SDK streaming ended without a result message.

**Solution:**
1. Check scratchpad for SDK errors:
   ```bash
   cat work/claude/<taskId>/.ob1/scratchpad.md
   ```

2. Verify Claude SDK version:
   ```bash
   npm list @anthropic-ai/claude-agent-sdk
   ```

3. Check for timeout issues (default 10 minutes)

### "Claude encountered an error during execution"

**Error:**
```
Claude encountered an error during execution: [error details]
```

**Solution:**
1. Check the specific error in the scratchpad
2. Common sub-errors:
   - "Permission denied": File/directory permission issues
   - "Command failed": Bash command failed during execution
   - "Rate limit": API rate limiting (wait and retry)

### "Warning: Reached maximum turns limit"

**Warning in scratchpad:**
```
⚠️ Warning: Reached maximum turns limit
```

**Cause:** Claude used all 50 turns (default max).

**Impact:** Task may be incomplete.

**Solution:**
1. Simplify the task
2. Break into smaller subtasks
3. Check if partial progress is usable

### "Warning: Reached maximum budget"

**Warning in scratchpad:**
```
⚠️ Warning: Reached maximum budget
```

**Cause:** Cost limit exceeded (if configured).

**Solution:**
1. Increase budget in SDK configuration
2. Optimize prompts to reduce token usage
3. Break task into smaller pieces

---

## 7. Codex Issues

### "OPENAI_API_KEY must be set to run the Codex agent"

**Error:**
```
OPENAI_API_KEY must be set to run the Codex agent.
```

**Solution:**
1. Get API key from https://platform.openai.com/api-keys
2. Add to `.env`:
   ```bash
   OPENAI_API_KEY=sk-proj-xxx
   CODEX_CLI_KEY=sk-proj-xxx  # Same key
   ```
3. Verify:
   ```bash
   npx ob1 doctor
   ```

### "Timeout reached after 600000ms"

**Error:**
```
Timeout reached after 600000ms
```

**Cause:** Codex agent exceeded 10-minute timeout.

**Solution:**
1. Check scratchpad for where it got stuck:
   ```bash
   cat work/codex/<taskId>/.ob1/scratchpad.md
   ```

2. Look for repeating patterns (infinite loops)

3. Increase timeout:
   ```bash
   npx ob1 -m "task" -k 1 --agents codex --timeout-ms 1200000  # 20 minutes
   ```

4. Simplify the task

### "Turn failed: [error message]"

**Error:**
```
Turn failed: Command execution failed with exit code 1
```

**Cause:** A command executed by Codex failed.

**Solution:**
1. Check scratchpad for the failed command:
   ```bash
   grep "Executing:" work/codex/<taskId>/.ob1/scratchpad.md
   grep "exit code" work/codex/<taskId>/.ob1/scratchpad.md
   ```

2. Verify dependencies are available (e.g., npm, python)

3. Check command output in scratchpad

### "Thread error: [error message]"

**Error:**
```
Thread error: Connection refused
```

**Cause:** Network or API communication issue.

**Solution:**
1. Verify network connectivity:
   ```bash
   curl -I https://api.openai.com
   ```

2. Check API status: https://status.openai.com/

3. Verify API key is valid:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

---

## 8. Cursor Issues

### "CURSOR_API_KEY must be set to run the Cursor agent"

**Error:**
```
CURSOR_API_KEY must be set to run the Cursor agent.
```

**Solution:**
1. Get API key from Cursor IDE → Settings → Privacy → API Keys
2. Add to `.env`:
   ```bash
   CURSOR_API_KEY=your-cursor-key
   ```
3. Verify:
   ```bash
   npx ob1 doctor
   ```

### "Storage mode is disabled" (403 Error)

**Error:**
```
Cursor API error (403): {"error":"Storage mode is disabled for this account"}

💡 How to fix:
   1. Open Cursor IDE
   2. Go to Settings → Privacy
   3. Disable "Privacy Mode" or enable "Storage Mode"
   4. Cloud Agents require data retention for operation

   Learn more: https://cursor.com/docs/cloud-agent
```

**Cause:** Cursor Privacy Mode blocks cloud agent features.

**Solution:**
1. Open Cursor IDE
2. Go to Settings (Cmd+, or Ctrl+,)
3. Navigate to Privacy section
4. Disable "Privacy Mode" or enable "Storage Mode"
5. Restart ob1

### "No git remote found. Cursor requires a GitHub repository."

**Error:**
```
No git remote found. Cursor requires a GitHub repository.
```

**Solution:**
1. Add a GitHub remote:
   ```bash
   git remote add origin https://github.com/owner/repo.git
   ```

2. Verify remote:
   ```bash
   git remote -v
   ```

### "Cursor only works with GitHub repositories"

**Error:**
```
Cursor only works with GitHub repositories. Got: https://gitlab.com/owner/repo
```

**Cause:** Cursor Cloud Agents only support GitHub.

**Solution:**
1. Use a GitHub repository, or
2. Use only `claude` and `codex` agents:
   ```bash
   npx ob1 -m "task" -k 2 --agents claude,codex
   ```

### "Cursor agent failed to complete the task"

**Error:**
```
Cursor agent failed to complete the task
```

**Cause:** Cursor's API returned status FAILED.

**Solution:**
1. Check scratchpad for status transitions:
   ```bash
   grep "Status:" work/cursor/<taskId>/.ob1/scratchpad.md
   ```

2. Look at Cursor dashboard for more details

3. Verify GitHub permissions (Cursor needs push access)

### "Cursor agent timed out after 600000ms"

**Error:**
```
Cursor agent timed out after 600000ms
```

**Cause:** Cursor agent didn't finish within 10 minutes.

**Solution:**
1. Check if agent is still running in Cursor dashboard

2. Increase timeout:
   ```bash
   npx ob1 -m "task" -k 1 --agents cursor --timeout-ms 1800000  # 30 minutes
   ```

3. Break task into smaller pieces

### Verbose Cursor Debugging

Enable detailed API logging:

```bash
DEBUG=cursor npx ob1 -m "task" -k 1 --agents cursor
```

This logs:
- Full API request/response bodies
- Headers (with API key redacted)
- HTTP status codes
- Response timing

---

## 9. Git Problems

### Worktree Creation Failed

**Error:**
```
Command failed: git worktree add -B agent/claude/20251111070455-6cwx work/claude/20251111070455-6cwx main
```

**Solution:**
1. Check if worktree already exists:
   ```bash
   git worktree list
   ```

2. Remove stale worktree:
   ```bash
   git worktree remove work/claude/20251111070455-6cwx --force
   ```

3. Clean worktree directory:
   ```bash
   rm -rf work/claude/20251111070455-6cwx
   ```

4. Prune worktrees:
   ```bash
   git worktree prune
   ```

### Branch Already Exists

**Error:**
```
fatal: A branch named 'agent/claude/20251111070455-6cwx' already exists.
```

**Solution:**
1. Delete the branch:
   ```bash
   git branch -D agent/claude/20251111070455-6cwx
   ```

2. If pushed to remote:
   ```bash
   git push origin --delete agent/claude/20251111070455-6cwx
   ```

### Push Failed

**Error:**
```
fatal: unable to access 'https://github.com/owner/repo.git/': Could not resolve host
```

**Solution:**
1. Check network connectivity:
   ```bash
   ping github.com
   ```

2. Verify remote URL:
   ```bash
   git remote get-url origin
   ```

3. Check GitHub credentials:
   ```bash
   git config credential.helper
   ```

4. Test push manually:
   ```bash
   cd work/claude/<taskId>
   git push origin agent/claude/<taskId>
   ```

### "Unable to parse remote URL"

**Error:**
```
Unable to parse remote URL: /local/path/to/repo
```

**Cause:** Using a local path as remote (not a GitHub URL).

**Solution:**
1. Add a proper GitHub remote:
   ```bash
   git remote set-url origin https://github.com/owner/repo.git
   ```

2. Or use dry-run mode (no push/PR):
   ```bash
   npx ob1 -m "task" -k 3 --dry
   ```

---

## 10. PR Failures

### "No git remote configured"

**Error:**
```
No git remote configured.
```

**Solution:**
```bash
git remote add origin https://github.com/owner/repo.git
```

### GitHub API Errors

**Error:**
```
HttpError: Bad credentials
```

**Solution:**
1. Verify GITHUB_TOKEN in `.env`
2. Check token has required scopes:
   - `repo` (full control of private repositories)
   - `workflow` (if creating PRs in repos with workflows)

3. Create new token: https://github.com/settings/tokens/new
   - Select scopes: `repo`, `workflow`
   - Add to `.env`:
     ```bash
     GITHUB_TOKEN=ghp_xxx
     ```

**Error:**
```
HttpError: Resource not accessible by integration
```

**Cause:** Token lacks permissions.

**Solution:**
1. For personal repos: Use personal access token (not fine-grained)
2. For org repos: Ensure token has org access
3. Regenerate token with correct scopes

**Error:**
```
HttpError: Validation Failed (422)
{"message":"Validation Failed","errors":[{"message":"A pull request already exists"}]}
```

**Cause:** PR already exists for this branch.

**Solution:**
1. Close existing PR:
   ```bash
   gh pr close agent/claude/20251111070455-6cwx
   ```

2. Or delete the branch and re-run:
   ```bash
   git push origin --delete agent/claude/20251111070455-6cwx
   ```

---

## 11. API Key Issues

### Validation

Run the doctor command to check all keys:

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
```

### Key Format Validation

**Claude API Key:**
```bash
# Should start with sk-ant-api03-
echo $CLAUDE_API_KEY | grep -E "^sk-ant-api03-"
```

**OpenAI API Key:**
```bash
# Should start with sk-proj- or sk-
echo $OPENAI_API_KEY | grep -E "^sk-"
```

**GitHub Token:**
```bash
# Classic: starts with ghp_
# Fine-grained: starts with github_pat_
echo $GITHUB_TOKEN | grep -E "^(ghp_|github_pat_)"
```

### Testing API Keys

**Test Claude:**
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

**Test OpenAI:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Test GitHub:**
```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user
```

### Key Not Loaded

If keys are in `.env` but not detected:

1. Check file location:
   ```bash
   pwd
   ls -la .env
   ```

2. The `.env` file must be in the directory where you run `npx ob1`

3. Check for BOM or encoding issues:
   ```bash
   file .env
   # Should show: ASCII text
   ```

4. No spaces around `=`:
   ```bash
   # ❌ Wrong
   CLAUDE_API_KEY = sk-ant-xxx

   # ✅ Correct
   CLAUDE_API_KEY=sk-ant-xxx
   ```

---

## 12. Network/Timeout

### Connection Timeouts

**Symptoms:**
- Agent hangs without progress
- No scratchpad updates
- Process doesn't complete or fail

**Diagnosis:**
```bash
# Check if agent is still making progress
tail -f work/<agent>/<taskId>/.ob1/scratchpad.md

# Check process status
ps aux | grep ob1

# Check network connectivity
ping api.anthropic.com
ping api.openai.com
ping api.cursor.com
```

**Solution:**
1. Increase timeout:
   ```bash
   npx ob1 -m "task" -k 1 --timeout-ms 1200000  # 20 minutes
   ```

2. Check firewall/proxy settings

3. Verify API endpoints are accessible

### Rate Limiting

**Symptoms:**
- 429 errors in logs
- Repeated retry attempts
- Slow progress

**Solution:**
1. Wait before retrying (rate limits reset over time)

2. Reduce concurrent agents:
   ```bash
   npx ob1 -m "task" -k 1  # Run one at a time
   ```

3. Check API quota/limits in respective dashboards:
   - Claude: https://console.anthropic.com/settings/limits
   - OpenAI: https://platform.openai.com/account/limits
   - Cursor: Check in Cursor IDE settings

### Proxy Configuration

If behind a corporate proxy:

```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1

# Run ob1
npx ob1 -m "task" -k 3
```

---

## 13. Manual Recovery

### Cleaning Up After Failures

**Remove failed worktrees:**
```bash
# List all worktrees
git worktree list

# Remove specific worktree
git worktree remove work/claude/20251111070455-6cwx --force

# Remove all ob1 worktrees
for dir in work/*/20*; do
  git worktree remove "$dir" --force 2>/dev/null || true
done

# Prune stale references
git worktree prune
```

**Delete failed branches:**
```bash
# List agent branches
git branch | grep "agent/"

# Delete specific branch
git branch -D agent/claude/20251111070455-6cwx

# Delete all local agent branches
git branch | grep "agent/" | xargs git branch -D

# Delete remote branches (careful!)
git push origin --delete agent/claude/20251111070455-6cwx
```

**Clean work directory:**
```bash
# Remove all worktrees
rm -rf work/

# Or remove specific agent
rm -rf work/claude/

# Or remove specific task
rm -rf work/claude/20251111070455-6cwx/
```

**Clean run artifacts:**
```bash
# Remove all runs
rm -rf runs/

# Or remove specific run
rm -rf runs/20251111070455-6cwx/
```

### Recovering Partial Work

If an agent made progress before failing:

1. **Find the worktree:**
   ```bash
   cd work/<agent>/<taskId>
   ```

2. **Review changes:**
   ```bash
   git status
   git diff
   ```

3. **Manually commit:**
   ```bash
   git add .
   git commit -m "Manual recovery: partial work from failed run"
   ```

4. **Create PR manually:**
   ```bash
   git push origin agent/<agent>/<taskId>
   gh pr create --title "Manual: partial work from <agent>" \
                --body "Recovered partial work from failed ob1 run"
   ```

### Force Reset

Complete reset to clean state:

```bash
#!/bin/bash
# Save as reset-ob1.sh

# Remove all worktrees
git worktree list | grep "work/" | awk '{print $1}' | xargs -I {} git worktree remove {} --force

# Prune worktrees
git worktree prune

# Delete agent branches (local)
git branch | grep "agent/" | xargs git branch -D

# Clean directories
rm -rf work/
rm -rf runs/

# Clean repo-level ob1 files
rm -rf .ob1/

echo "✅ ob1 state reset complete"
```

### Resuming After Manual Fixes

ob1 does not support resuming failed runs. To retry:

1. Clean up failed run (see above)
2. Re-run ob1 with same task:
   ```bash
   npx ob1 -m "same task message" -k 3
   ```

This creates a new taskId and fresh worktrees.

---

## Quick Reference

### Common Commands

```bash
# Check environment setup
npx ob1 doctor

# View run summary
cat runs/<taskId>/summary.json | jq '.'

# Watch agent progress
tail -f work/<agent>/<taskId>/.ob1/scratchpad.md

# Check agent status
cat work/<agent>/<taskId>/.ob1/todo.md

# View run events
cat runs/<taskId>/run.jsonl | jq '.'

# Clean up
git worktree prune
rm -rf work/ runs/
```

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| Run log | `runs/<taskId>/run.jsonl` | Event stream with timestamps |
| Summary | `runs/<taskId>/summary.json` | High-level run results |
| Scratchpad | `work/<agent>/<taskId>/.ob1/scratchpad.md` | Agent's work notes |
| TODO ledger | `work/<agent>/<taskId>/.ob1/todo.md` | Execution milestones |
| Worktree | `work/<agent>/<taskId>/` | Agent's isolated workspace |
| Fallback | `work/<agent>/<taskId>/ob1_result_<agent>.md` | Created when no changes made |

### Environment Variables

| Variable | Required For | Format |
|----------|--------------|--------|
| `CLAUDE_API_KEY` | Claude agent | `sk-ant-api03-xxx` |
| `OPENAI_API_KEY` | Codex agent | `sk-proj-xxx` or `sk-xxx` |
| `CODEX_CLI_KEY` | Codex agent | Same as `OPENAI_API_KEY` |
| `CURSOR_API_KEY` | Cursor agent | From Cursor IDE |
| `GITHUB_TOKEN` | PR creation | `ghp_xxx` or `github_pat_xxx` |

### Support Resources

- **Claude API Docs**: https://docs.anthropic.com/
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Cursor Docs**: https://cursor.com/docs
- **GitHub API Docs**: https://docs.github.com/en/rest

---

**Last Updated**: 2025-11-11
