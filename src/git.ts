import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { Octokit } from '@octokit/rest';
import { consola } from 'consola';
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

/**
 * Ensures a GitHub repository exists, creating it if necessary
 * @param githubUrl - GitHub repository URL (e.g., "https://github.com/owner/repo")
 * @param token - GitHub personal access token
 * @param localPath - Optional local path to clone to (defaults to current directory)
 * @returns Local path to the repository
 */
export async function ensureGitHubRepo(
  githubUrl: string,
  token: string,
  localPath?: string,
): Promise<string> {
  // Parse the GitHub URL to get owner and repo name
  const { owner, name: repoName } = parseRemoteUrl(githubUrl);

  consola.info(`Checking if GitHub repository exists: ${owner}/${repoName}`);

  // Check if repository exists on GitHub
  const octokit = new Octokit({ auth: token });
  let repoExists = false;

  try {
    await octokit.repos.get({ owner, repo: repoName });
    repoExists = true;
    consola.success(`Repository ${owner}/${repoName} exists on GitHub`);
  } catch (error: any) {
    if (error.status === 404) {
      consola.info(`Repository ${owner}/${repoName} not found on GitHub`);
      repoExists = false;
    } else {
      throw error;
    }
  }

  // If repository doesn't exist, create it
  if (!repoExists) {
    consola.start(`Creating GitHub repository: ${owner}/${repoName}...`);

    try {
      await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        private: false,
        auto_init: true, // Initialize with README
        description: `Created automatically by ob1 orchestrator`,
      });

      consola.success(`Created GitHub repository: ${owner}/${repoName}`);

      // Wait a bit for GitHub to initialize the repository
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      throw new Error(`Failed to create GitHub repository: ${error.message}`);
    }
  }

  // Determine local path
  const targetPath = localPath || path.join(process.cwd(), repoName);

  // Check if local directory exists
  try {
    await fs.access(targetPath);
    // Directory exists - check if it's a git repo
    const git = simpleGit(targetPath);
    try {
      await git.status();
      consola.info(`Using existing local repository at: ${targetPath}`);
      return targetPath;
    } catch {
      // Not a git repo - we'll clone into it if it's empty
      const files = await fs.readdir(targetPath);
      if (files.length > 0) {
        throw new Error(`Directory ${targetPath} exists but is not a git repository and is not empty`);
      }
    }
  } catch {
    // Directory doesn't exist, we'll create it
  }

  // Clone the repository
  consola.start(`Cloning repository to: ${targetPath}...`);
  const cloneUrl = `https://github.com/${owner}/${repoName}.git`;

  await ensureDir(path.dirname(targetPath));
  await execa('git', ['clone', cloneUrl, targetPath]);

  consola.success(`Cloned repository to: ${targetPath}`);

  // Configure git remote to use token for pushes
  const git = simpleGit(targetPath);
  const authenticatedUrl = `https://${token}@github.com/${owner}/${repoName}.git`;
  await git.remote(['set-url', 'origin', authenticatedUrl]);

  return targetPath;
}
