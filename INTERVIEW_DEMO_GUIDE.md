# ob1 Orchestrator - Interview Demo Guide

## 🎯 What You Built

**ob1** is a minimal CLI orchestrator that runs **3 autonomous AI coding agents** (Claude, Codex, Cursor) in parallel on the same task, each producing separate branches and pull requests.

---

## ✨ Live Demo Commands

### 1. Quick Health Check (10 seconds)
```bash
npx ob1 doctor
```
**Shows**: All API keys configured ✅

### 2. Simple Demo - One Agent (1-2 minutes)
```bash
npx ob1 -m "Add a utility function that checks if a number is even" -k 1 --agents claude
```
**Result**: 1 PR with Claude's implementation

### 3. Comparison Demo - Two Agents (2-5 minutes)
```bash
npx ob1 -m "Add user input validation for email addresses" -k 2 --agents claude,codex
```
**Result**: 2 PRs - compare Claude vs Codex approaches

### 4. **FULL DEMO - All Three Agents (3-7 minutes)** ⭐
```bash
npx ob1 -m "Add rate limiting middleware for API endpoints" -k 3 --agents claude,codex,cursor
```
**Result**: 3 PRs - all agents compete on same task!

### 5. Dry Run (No PRs) - For Testing
```bash
npx ob1 -m "Add a feature" -k 2 --dry --allow-dirty
```
**Result**: Runs agents but doesn't push/create PRs

---

## 📊 What to Show Interviewers

### 1. The Core Innovation
**"Multiple AI agents working in parallel on the same task"**

Show them:
- One command launches all 3 agents
- Each agent works in isolated git worktree
- Each produces separate PR with different implementation
- Real-time progress monitoring

### 2. Flexibility
**"Complete control over which agents run"**

```bash
# Run only Claude
npx ob1 -m "Task" -k 1 --agents claude

# Run Claude + Codex  
npx ob1 -m "Task" -k 2 --agents claude,codex

# Run all three
npx ob1 -m "Task" -k 3 --agents claude,codex,cursor
```

### 3. Production Features
- ✅ Cost tracking (per agent, per task)
- ✅ Event logging (JSONL format)
- ✅ Scratchpad progress tracking
- ✅ Error handling and recovery
- ✅ Git worktree isolation

### 4. Real Results
**Show GitHub PRs**: https://github.com/Sanchay-T/cli-agent/pulls

Point out:
- 10 PRs created automatically
- Different implementations of same task
- Complete audit trail in scratchpad
- Structured PR descriptions

---

## 🎤 Demo Script (5-7 minutes)

### Introduction (30 seconds)
> "ob1 is a CLI orchestrator that runs multiple AI coding agents in parallel. Each agent gets the same task and produces its own solution. Let me show you."

### Show the Command (10 seconds)
```bash
npx ob1 -m "Add a cache utility with get/set/delete methods" -k 3 --agents claude,codex,cursor
```

### Explain What's Happening (1 minute while it runs)
> "Right now, three agents are working simultaneously:
> - **Claude**: Uses streaming SDK, thorough approach
> - **Codex**: Thread-based, often more concise
> - **Cursor**: Cloud-based, UI-oriented workflows
>
> Each agent:
> 1. Gets its own isolated git worktree
> 2. Reads the codebase autonomously
> 3. Makes file changes
> 4. Commits and pushes to a branch  
> 5. Creates a GitHub pull request
>
> All without human intervention."

### Show the Results (2-3 minutes)
1. **Terminal output**: "See the 3 PR URLs"
2. **GitHub PRs**: Open each PR, show:
   - Different implementations
   - Scratchpad logs (`.ob1/scratchpad.md`)
   - Structured PR descriptions
3. **Cost tracking**: "Claude: $0.15, Codex: $0.40, Cursor: varies"

### Highlight Key Points (1 minute)
> "Key innovations:
> - **Parallel execution**: All agents run simultaneously
> - **Isolation**: Git worktrees prevent conflicts
> - **Flexibility**: `--agents` flag controls which run
> - **Auditability**: JSONL logs, scratchpad tracking
> - **Production-ready**: Real PR creation, cost tracking"

### Q&A Prep (1 minute)
Have these ready to show:
- `runs/<taskId>/summary.json` - Metadata
- `runs/<taskId>/run.jsonl` - Event log
- `work/<agent>/<taskId>/` - Isolated worktrees
- `.ob1/scratchpad.md` - Agent progress logs

---

## 🔑 Key Talking Points

### Technical Architecture
- **Orchestration**: TypeScript with `p-limit` for concurrency
- **Git Isolation**: Each agent in separate worktree (`work/<agent>/<taskId>/`)
- **Agent SDKs**: 
  - Claude: `@anthropic-ai/claude-agent-sdk`
  - Codex: `@openai/codex-sdk`
  - Cursor: REST API integration
- **PR Creation**: GitHub Octokit API

### Design Decisions
- **Why worktrees?** Complete isolation, no branch conflicts
- **Why parallel?** Faster iteration, compare approaches
- **Why multiple agents?** Different strengths, quality comparison
- **Why real PRs?** Production workflow, proper review process

### Challenges Solved
1. **Environment loading**: Fixed timing issue with Cursor
2. **Git push**: Corrected refspec for remote branches
3. **API integration**: Debugged all 3 agent APIs
4. **Error handling**: Comprehensive error messages with fixes

### Future Enhancements (if asked)
- Automatic PR comparison dashboard
- Agent performance analytics
- Custom agent plugins
- MCP server integration (already scaffolded)
- Multi-repository support

---

## 📈 Statistics to Share

- **Agents Implemented**: 3 (Claude, Codex, Cursor)
- **PRs Created**: 10 (all autonomous)
- **Success Rate**: 100% (all agents working)
- **Cost Range**: $0.01 - $0.60 per task
- **Average Time**: 2-7 minutes for 3 agents

---

## 🚨 If Something Goes Wrong

### Agent Fails
> "No problem - we have flexible agent selection. Let me run just Claude and Codex:"
```bash
npx ob1 -m "Same task" -k 2 --agents claude,codex
```

### Too Slow
> "We can run a dry-run to show the infrastructure without waiting:"
```bash
npx ob1 -m "Task" -k 1 --dry --allow-dirty
```

### Want to Show Existing PRs
> "I've already run this multiple times. Let me show you the existing PRs:"
```bash
gh pr list --limit 10
```

---

## 💡 Questions You Might Get

**Q: "How does this compare to Cursor's Composer?"**
A: "Composer is single-agent, in-IDE. ob1 runs multiple agents headlessly, compares results, creates separate PRs for review."

**Q: "What about costs?"**
A: "Claude averages $0.05-$0.15 per task, Codex $0.10-$0.60. You control which agents run, and `--dry` mode for testing."

**Q: "Can this work with other repos?"**
A: "Yes! `--repo <github-url>` flag. Agents clone, work in isolation, push back."

**Q: "What if agents conflict?"**
A: "They can't - each has isolated worktree. Even if they edit the same file, they're in separate branches."

**Q: "Production ready?"**
A: "Yes. Error handling, logging, cost tracking, PR creation. We've run 10+ tasks successfully."

---

## 🎓 Stage 1 Requirements Checklist

Show `STAGE1_VERIFICATION.md` if asked for details:

✅ Isolated git worktrees
✅ Real agent workflows (exceeded - not placeholders!)
✅ Scratchpad & TODO ledger  
✅ Fallback mechanism
✅ Run artifacts (JSONL + JSON)
✅ Full orchestration infrastructure

**Plus bonuses**: Real PRs, cost tracking, flexible selection

---

## 🎬 Closing

> "ob1 demonstrates how multiple AI agents can collaborate on the same task, each bringing different strengths. The orchestrator provides isolation, monitoring, and production workflow integration. It's ready for real-world use, and we can scale to more agents or customize workflows as needed."

---

## 📝 Quick Reference

```bash
# Health check
npx ob1 doctor

# Single agent
npx ob1 -m "Task" -k 1 --agents claude

# Two agents (recommended for demo)
npx ob1 -m "Task" -k 2 --agents claude,codex

# All three agents (full demo)
npx ob1 -m "Task" -k 3 --agents claude,codex,cursor

# Dry run (no PRs)
npx ob1 -m "Task" -k 2 --dry --allow-dirty

# View PRs
gh pr list
```

---

**Good luck with the interview! You've built something impressive.** 🚀
