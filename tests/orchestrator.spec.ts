import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { runOb1 } from '../src/orchestrator.js';
import type { OrchestratorSummary } from '../src/orchestrator.js';

const REQUIRED_ENV = {
  CLAUDE_API_KEY: 'test-claude',
  CODEX_CLI_KEY: 'test-codex',
  OPENAI_API_KEY: 'test-openai',
  CURSOR_API_KEY: 'test-cursor',
  GITHUB_TOKEN: 'test-github-token',
} as const;

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initGitRepo(withRemote: boolean): Promise<string> {
  const repoDir = await makeTempDir('ob1-repo-');
  await execa('git', ['init', '--initial-branch=main'], { cwd: repoDir });
  await execa('git', ['config', 'user.name', 'ob1 tester'], { cwd: repoDir });
  await execa('git', ['config', 'user.email', 'tester@example.com'], { cwd: repoDir });
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Test repo\n');
  await execa('git', ['add', 'README.md'], { cwd: repoDir });
  await execa('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });

  if (withRemote) {
    const remoteDir = await makeTempDir('ob1-remote-');
    await execa('git', ['init', '--bare'], { cwd: remoteDir });
    await execa('git', ['remote', 'add', 'origin', remoteDir], { cwd: repoDir });
  }

  return repoDir;
}

async function runOrchestrator(repoDir: string): Promise<OrchestratorSummary> {
  const workRoot = path.join(repoDir, 'work');
  const summary = await runOb1({
    message: 'Implement feature',
    k: 1,
    repo: repoDir,
    baseBranch: 'main',
    dryRun: true,
    agents: ['codex'],
    allowDirty: false,
    timeoutMs: undefined,
    workRoot,
  });
  tempDirs.push(path.join('runs', summary.taskId));
  return summary;
}

beforeEach(() => {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    process.env[key] = value;
  }
});

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('runOb1', () => {
  it('allows dry-run execution without a configured git remote', async () => {
    const repoDir = await initGitRepo(false);
    const summary = await runOrchestrator(repoDir);

    expect(summary.agents).toHaveLength(1);
    const agent = summary.agents[0];
    expect(agent.error).toBeUndefined();
    expect(agent.commitSha).toBeDefined();
    expect(agent.prUrl).toBeUndefined();
  });

  it('creates a fallback file when the agent makes no changes', async () => {
    const repoDir = await initGitRepo(true);
    const summary = await runOrchestrator(repoDir);
    const agent = summary.agents[0];

    expect(agent.fallbackFile).toBeDefined();
    expect(agent.changedFiles).toBeGreaterThan(0);

    const fallbackPath = path.join(agent.worktreePath, agent.fallbackFile!);
    const fallbackContent = await fs.readFile(fallbackPath, 'utf8');
    expect(fallbackContent).toContain('Agent codex produced no changes');

    const summaryPath = path.join('runs', summary.taskId, 'summary.json');
    const summaryFile = await fs.readFile(summaryPath, 'utf8');
    expect(summaryFile).toContain(agent.branch);
  });
});
