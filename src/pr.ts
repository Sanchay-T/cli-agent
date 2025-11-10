import { Octokit } from '@octokit/rest';

export type PullRequestInput = {
  owner: string;
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
};

export async function createPullRequest(token: string, input: PullRequestInput): Promise<string> {
  const octokit = new Octokit({ auth: token });
  const response = await octokit.pulls.create(input);
  return response.data.html_url;
}

export function buildPrBody(options: {
  agent: string;
  branch: string;
  message: string;
  changedFiles: number;
}): string {
  return `## Agent\n- Name: ${options.agent}\n- Branch: ${options.branch}\n- Task: "${options.message}"\n\n## Summary\n- Changed files: ${options.changedFiles}\n- Notes: See .ob1/scratchpad.md\n\n## Checklist\n- [ ] Smoke-tested build\n- [ ] TODOs triaged (see .ob1/todo.md)\n`;
}
