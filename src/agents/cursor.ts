import { consola } from 'consola';
import { appendScratchpadEntry, appendTodo } from '../util/fs.js';
import { AgentRunner, type AgentContext, type AgentRunResult } from './types.js';

export class CursorRunner implements AgentRunner {
  checkEnv(): void {
    if (!process.env.CURSOR_API_KEY) {
      throw new Error('CURSOR_API_KEY must be set to run the Cursor agent.');
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    consola.info(`[cursor] Executing placeholder HTTP workflow for ${context.prompt}`);
    await appendScratchpadEntry(context.scratchpadPath, 'Cursor placeholder workflow executed.');
    await appendTodo(context.todoPath, 'Connect to Cursor Cloud API', false);
    return {
      agent: context.name,
      summary: 'Cursor placeholder runner executed.',
      notes: ['Implement Cursor HTTP workflow.'],
    };
  }
}

export default CursorRunner;
