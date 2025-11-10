import { consola } from 'consola';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class CodexRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.CODEX_CLI_KEY || !process.env.OPENAI_API_KEY) {
      throw new Error('CODEX_CLI_KEY and OPENAI_API_KEY must be set to run the Codex agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[codex] Starting task for ${context.prompt}`);
    await appendScratchpadEntry(context.scratchpadPath, `Initialized Codex agent for task "${context.prompt}".`);
    await appendTodo(context.todoPath, 'Review Codex integration (placeholder implementation)', false);
    return {
      agent: context.name,
      summary: 'Codex placeholder runner executed.',
      notes: ['No remote API call performed (Stage 1 placeholder).'],
    };
  }
}

export default CodexRunner;
