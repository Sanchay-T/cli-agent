/**
 * Detailed agent execution logger
 * Captures every thought, tool call, and result for forensic analysis
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface AgentLogEvent {
  type: 'start' | 'thought' | 'tool' | 'result' | 'error' | 'complete';
  timestamp: string;
  turn?: number;
  [key: string]: unknown;
}

export interface ToolCallEvent extends AgentLogEvent {
  type: 'tool';
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent extends AgentLogEvent {
  type: 'result';
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface ThoughtEvent extends AgentLogEvent {
  type: 'thought';
  content: string;
}

export class AgentLogger {
  private logFilePath: string;
  private summaryFilePath: string;
  private metadataFilePath: string;
  private logDir: string;
  private events: AgentLogEvent[] = [];

  constructor(
    private agentName: string,
    private taskId: string,
    private runRoot: string,
  ) {
    this.logDir = path.join(runRoot, 'agents', agentName);
    this.logFilePath = path.join(this.logDir, 'execution.jsonl');
    this.summaryFilePath = path.join(this.logDir, 'summary.md');
    this.metadataFilePath = path.join(this.logDir, 'metadata.json');
  }

  /**
   * Initialize the logger - create directories and files
   */
  async init(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });

    // Write initial metadata
    await this.writeMetadata({
      agent: this.agentName,
      taskId: this.taskId,
      startTime: new Date().toISOString(),
      status: 'running',
    });
  }

  /**
   * Log an event to the JSONL file
   */
  async log(event: AgentLogEvent): Promise<void> {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    this.events.push(enrichedEvent);

    // Append to JSONL file
    const line = JSON.stringify(enrichedEvent) + '\n';
    await fs.appendFile(this.logFilePath, line);
  }

  /**
   * Log the start of execution
   */
  async logStart(prompt: string): Promise<void> {
    await this.log({
      type: 'start',
      timestamp: new Date().toISOString(),
      prompt,
    });
  }

  /**
   * Log a thought/reasoning step
   */
  async logThought(turn: number, content: string): Promise<void> {
    await this.log({
      type: 'thought',
      timestamp: new Date().toISOString(),
      turn,
      content,
    });
  }

  /**
   * Log a tool call
   */
  async logToolCall(turn: number, tool: string, args: Record<string, unknown>): Promise<void> {
    await this.log({
      type: 'tool',
      timestamp: new Date().toISOString(),
      turn,
      tool,
      args,
    });
  }

  /**
   * Log a tool result
   */
  async logToolResult(
    turn: number,
    tool: string,
    success: boolean,
    result?: unknown,
    error?: string,
  ): Promise<void> {
    await this.log({
      type: 'result',
      timestamp: new Date().toISOString(),
      turn,
      tool,
      success,
      result: success ? result : undefined,
      error: error || undefined,
    });
  }

  /**
   * Log an error
   */
  async logError(error: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({
      type: 'error',
      timestamp: new Date().toISOString(),
      error,
      ...details,
    });
  }

  /**
   * Log completion
   */
  async logComplete(metadata: {
    turns: number;
    duration_ms: number;
    cost_usd?: number;
    success: boolean;
    summary: string;
  }): Promise<void> {
    await this.log({
      type: 'complete',
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    // Update final metadata
    await this.writeMetadata({
      agent: this.agentName,
      taskId: this.taskId,
      endTime: new Date().toISOString(),
      status: metadata.success ? 'success' : 'error',
      turns: metadata.turns,
      duration_ms: metadata.duration_ms,
      cost_usd: metadata.cost_usd,
    });

    // Generate human-readable summary
    await this.generateSummary(metadata);
  }

  /**
   * Write metadata JSON
   */
  private async writeMetadata(data: Record<string, unknown>): Promise<void> {
    await fs.writeFile(
      this.metadataFilePath,
      JSON.stringify(data, null, 2),
    );
  }

  /**
   * Generate a human-readable summary markdown
   */
  private async generateSummary(metadata: {
    turns: number;
    duration_ms: number;
    cost_usd?: number;
    success: boolean;
    summary: string;
  }): Promise<void> {
    const duration_sec = (metadata.duration_ms / 1000).toFixed(1);
    const cost = metadata.cost_usd ? `$${metadata.cost_usd.toFixed(4)}` : 'N/A';

    // Count events by type
    const thoughtCount = this.events.filter((e) => e.type === 'thought').length;
    const toolCount = this.events.filter((e) => e.type === 'tool').length;
    const errorCount = this.events.filter((e) => e.type === 'error').length;

    let summary = `# ${this.agentName} Execution Summary\n\n`;
    summary += `**Task ID**: ${this.taskId}\n`;
    summary += `**Status**: ${metadata.success ? '✅ Success' : '❌ Failed'}\n`;
    summary += `**Turns**: ${metadata.turns}\n`;
    summary += `**Duration**: ${duration_sec}s\n`;
    summary += `**Cost**: ${cost}\n\n`;
    summary += `## Activity\n\n`;
    summary += `- **Thoughts**: ${thoughtCount}\n`;
    summary += `- **Tool Calls**: ${toolCount}\n`;
    summary += `- **Errors**: ${errorCount}\n\n`;
    summary += `## Result\n\n`;
    summary += `${metadata.summary}\n\n`;
    summary += `## Timeline\n\n`;

    // Generate timeline from events
    for (const event of this.events) {
      const time = new Date(event.timestamp).toLocaleTimeString();

      if (event.type === 'start') {
        summary += `- **${time}** - Started execution\n`;
        summary += `  - Prompt: ${event.prompt}\n`;
      } else if (event.type === 'thought') {
        summary += `- **${time}** - Turn ${event.turn}: ${(event as ThoughtEvent).content}\n`;
      } else if (event.type === 'tool') {
        const toolEvent = event as ToolCallEvent;
        summary += `- **${time}** - Turn ${event.turn}: Called \`${toolEvent.tool}\`\n`;
      } else if (event.type === 'result') {
        const resultEvent = event as ToolResultEvent;
        const status = resultEvent.success ? '✅' : '❌';
        summary += `  - ${status} Result: ${resultEvent.success ? 'Success' : resultEvent.error}\n`;
      } else if (event.type === 'error') {
        summary += `- **${time}** - ❌ Error: ${event.error}\n`;
      } else if (event.type === 'complete') {
        summary += `- **${time}** - Completed\n`;
      }
    }

    summary += `\n---\n\n`;
    summary += `For detailed execution trace, see \`execution.jsonl\`\n`;

    await fs.writeFile(this.summaryFilePath, summary);
  }

  /**
   * Get the log directory path
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Get all logged events
   */
  getEvents(): AgentLogEvent[] {
    return [...this.events];
  }
}
