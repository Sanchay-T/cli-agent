import { execa } from 'execa';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { ensureDir } from './util/fs.js';

export type RepoInfo = {
  owner: string;
  name: string;
  remote: string;
};

export async function getRepoRoot(repo?: string): Promise<string> {
  if (repo) {
    return path.resolve(repo);
  }

  const git = simpleGit();
  const root = await git.revparse(['--show-toplevel']);
  return root.trim();
}

export async function ensureCleanRepo(repoDir: string, allowDirty: boolean): Promise<void> {
  const git = simpleGit(repoDir);
  const status = await git.status();
  if (!allowDirty && !status.isClean()) {
    throw new Error('Repository has uncommitted changes. Use --allow-dirty to override.');
  }
}

export async function createWorktree(
  repoDir: string,
  worktreeDir: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  await ensureDir(path.dirname(worktreeDir));
  await execa('git', ['worktree', 'remove', worktreeDir, '--force'], {
    cwd: repoDir,
    reject: false,
  });
  await ensureDir(worktreeDir);
  await execa('git', ['worktree', 'add', '-B', branch, worktreeDir, baseBranch], {
    cwd: repoDir,
  });
}

export async function removeWorktree(repoDir: string, worktreeDir: string): Promise<void> {
  await execa('git', ['worktree', 'remove', worktreeDir, '--force'], {
    cwd: repoDir,
    reject: false,
  });
}

export async function commitAll(worktreeDir: string, message: string): Promise<string | undefined> {
  const git = simpleGit(worktreeDir);
  await git.add('.');
  const status = await git.status();
  if (status.isClean()) {
    return undefined;
  }
  const commit = await git.commit(message);
  return commit.commit;
}

export async function pushBranch(worktreeDir: string, branch: string): Promise<void> {
  const git = simpleGit(worktreeDir);
  await git.push('origin', branch, { '--set-upstream': null } as unknown as string[]);
}

export async function getRepoInfo(repoDir: string): Promise<RepoInfo> {
  const git = simpleGit(repoDir);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((remote) => remote.name === 'origin') ?? remotes[0];
  if (!origin) {
    throw new Error('No git remote configured.');
  }

  const remoteUrl = origin.refs.fetch;
  const repoInfo = parseRemoteUrl(remoteUrl);
  return { ...repoInfo, remote: remoteUrl };
}

function parseRemoteUrl(remoteUrl: string): { owner: string; name: string } {
  if (remoteUrl.startsWith('git@')) {
    const pathPart = remoteUrl.split(':')[1]?.replace(/\.git$/, '') ?? '';
    const [owner, name] = pathPart.split('/');
    if (!owner || !name) {
      throw new Error(`Unable to parse remote URL: ${remoteUrl}`);
    }
    return { owner, name };
  }

  const isWindowsPath = /^[a-zA-Z]:\\/.test(remoteUrl);
  const isFilePath = remoteUrl.startsWith('/') || remoteUrl.startsWith('./') || remoteUrl.startsWith('../');

  if (isWindowsPath || isFilePath) {
    const normalized = remoteUrl.replace(/\\/g, '/').replace(/\.git$/, '');
    const segments = normalized.split('/').filter(Boolean);
    const name = segments.pop();
    if (!name) {
      throw new Error(`Unable to parse remote URL: ${remoteUrl}`);
    }
    const owner = segments.pop() ?? 'local';
    return { owner, name };
  }

  try {
    const url = new URL(remoteUrl);
    const segments = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error(`Unable to parse remote URL: ${remoteUrl}`);
    }
    const owner = segments[segments.length - 2];
    const name = segments[segments.length - 1];
    return { owner, name };
  } catch (error) {
    throw new Error(`Unable to parse remote URL: ${remoteUrl}`);
  }
}

export function makeTaskId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const random = Math.random().toString(36).slice(2, 6);
  return `${timestamp}-${random}`;
}
