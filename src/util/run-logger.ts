import { appendJsonLine } from './fs.js';

type RunEvent = Record<string, unknown> & { event: string };

export class RunLogger {
  constructor(private readonly filePath: string) {}

  async log(event: RunEvent): Promise<void> {
    await appendJsonLine(this.filePath, {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }
}
