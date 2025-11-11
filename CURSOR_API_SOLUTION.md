# Cursor API - Quick Solution Guide

## TL;DR - The Fix

Your API key works perfectly! The only issue is:

**You need to enable Storage Mode in Cursor settings.**

---

## Why It's Not Working

The API returns this error:
```
Storage mode is disabled. Please enable storage in your Cursor settings to use agents via API.
```

This is a **privacy/data retention setting** in Cursor, not a code bug.

---

## How to Fix It (5 minutes)

### Method 1: Cursor IDE Settings

1. **Open Cursor IDE** (the desktop application)

2. **Open Settings**:
   - Mac: Press `Cmd + ,`
   - Windows/Linux: Press `Ctrl + ,`

3. **Find Privacy Settings**:
   - Look for "Privacy" section
   - Or "Features" → "Privacy Mode"
   - Or "Cloud Agents"

4. **Disable Privacy Mode OR Enable Storage Mode**:
   - Option A: Uncheck "Privacy Mode"
   - Option B: Check "Storage Mode for Agents" (if separate)

5. **Restart Cursor** to ensure settings save

### Method 2: Cursor Dashboard

1. Go to https://cursor.com/settings
2. Look for "Privacy" or "Cloud Agents" section
3. Enable storage/data retention for agents
4. Save changes

---

## What Storage Mode Does

Storage Mode allows Cursor to:
- Store your code temporarily (a few days)
- Maintain agent conversation history
- Keep work-in-progress state for agents
- Enable cloud-based agent execution

**Privacy Note**: According to Cursor, they don't train on your code even with storage enabled.

---

## Verify It's Fixed

After enabling Storage Mode:

```bash
# Test creating an agent
curl -X POST "https://api.cursor.com/v0/agents" \
  -u YOUR_API_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": {"text": "Add a comment to README"},
    "source": {
      "repository": "https://github.com/Sanchay-T/cli-agent",
      "ref": "main"
    },
    "target": {
      "branchName": "test-api",
      "autoCreatePr": false
    }
  }'
```

Should return HTTP 200 with agent details (not 403).

Or test with the CLI:

```bash
npx ob1 -m "Add a utility function" -k 1 --agents cursor --allow-dirty
```

Should create an agent instead of erroring.

---

## What's Already Working

Good news! Everything else works perfectly:

✅ API key authentication
✅ GET /v0/me (your info)
✅ GET /v0/agents (list agents)
✅ GET /v0/models (available models)
✅ Code implementation
✅ Git operations

The **only** thing blocked is creating agents.

---

## Current Test Results

| Test | Result |
|------|--------|
| API Key Valid | ✅ Yes |
| Authentication | ✅ Working |
| User Info | ✅ dj@openblocklabs.com |
| List Agents | ✅ Works (empty list) |
| List Models | ✅ 7 models available |
| **Create Agent** | ❌ Storage mode disabled |

---

## Enhanced Error Messages

I've updated the code to show helpful messages when this happens:

```
Cursor API error (403): Storage mode is disabled...

💡 How to fix:
   1. Open Cursor IDE
   2. Go to Settings → Privacy
   3. Disable "Privacy Mode" or enable "Storage Mode"
   4. Cloud Agents require data retention for operation

   Learn more: https://cursor.com/docs/cloud-agent
```

---

## If It Still Doesn't Work

After enabling Storage Mode, if you still get errors:

1. **Try creating a new API key**:
   - Go to https://cursor.com/settings
   - Delete old key "pong"
   - Create new key AFTER enabling storage
   - Update .env file

2. **Test in Cursor UI first**:
   - Open Cursor IDE
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
   - Type "Start Cloud Agent"
   - Try a simple task
   - If this works, API should work too

3. **Check GitHub integration**:
   - Visit https://cursor.com/settings
   - Verify GitHub is connected
   - Check repository access permissions

---

## Debug Mode

To see detailed API requests/responses:

```bash
DEBUG=cursor npx ob1 -m "Your task" --agents cursor
```

This shows:
- Exact API requests sent
- Full response headers and body
- Helps diagnose any remaining issues

---

## Support Resources

- **Cursor Docs**: https://cursor.com/docs/cloud-agent
- **API Docs**: https://cursor.com/docs/cloud-agent/api/overview
- **Settings**: https://cursor.com/settings
- **Full Diagnostic Report**: See `CURSOR_API_DIAGNOSTIC_REPORT.md`

---

## Summary

1. ✅ Your API key works
2. ✅ The code is correct
3. ⚙️ Enable Storage Mode in Cursor settings
4. ✅ Then everything will work

**Expected time to fix**: 2-5 minutes
**Difficulty**: Easy (just a settings toggle)

---

That's it! Once Storage Mode is enabled, you'll be able to create agents via API and use the full CLI orchestrator functionality.
