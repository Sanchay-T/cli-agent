import { consola } from 'consola';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class ClaudeRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY must be set to run the Claude agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[claude] Running placeholder workflow for ${context.prompt}`);
    await appendScratchpadEntry(context.scratchpadPath, 'Claude placeholder workflow executed.');
    await appendTodo(context.todoPath, 'Integrate Claude SDK call', false);
    return {
      agent: context.name,
      summary: 'Claude placeholder runner executed.',
      notes: ['Replace with real Claude agent integration.'],
    };
  }
}

export default ClaudeRunner;
