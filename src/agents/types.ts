export type AgentName = 'codex' | 'claude' | 'cursor';

export type AgentContext = {
  name: AgentName;
  dir: string;
  branch: string;
  prompt: string;
  scratchpadPath: string;
  todoPath: string;
  taskId: string;
  runRoot: string; // Root directory for run artifacts (for detailed logging)
};

export type AgentRunResult = {
  agent: AgentName;
  summary: string;
  notes?: string[];
  fallbackFile?: string;
};

export interface AgentRunner {
  checkEnv(): Promise<void> | void;
  run(context: AgentContext): Promise<AgentRunResult>;
}
