import { ClaudeRunner } from './claude.js';
import { CodexRunner } from './codex.js';
import { CursorRunner } from './cursor.js';
import { QaRunner } from './qa.js';
import type { AgentName, AgentRunner } from './types.js';

const runnerMap: Record<AgentName, AgentRunner> = {
  codex: new CodexRunner(),
  claude: new ClaudeRunner(),
  cursor: new CursorRunner(),
  qa: new QaRunner(),
};

export function getAgentRunner(agent: AgentName): AgentRunner {
  return runnerMap[agent];
}

export const ALL_AGENTS: AgentName[] = ['codex', 'claude', 'cursor', 'qa'];
