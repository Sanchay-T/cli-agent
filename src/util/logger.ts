import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.timestamps = options.timestamps ?? false;
  }

  /**
   * Sets the minimum log level. Messages below this level will not be logged.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Gets the current log level.
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Formats a log message with optional timestamp and prefix.
   */
  private format(message: string, levelName: string, color: (text: string) => string): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(chalk.gray(`[${new Date().toISOString()}]`));
    }

    parts.push(color(`[${levelName}]`));

    if (this.prefix) {
      parts.push(chalk.cyan(`[${this.prefix}]`));
    }

    parts.push(message);

    return parts.join(' ');
  }

  /**
   * Logs a debug message. Only shown when log level is DEBUG.
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.format(message, 'DEBUG', chalk.gray);
      console.log(formatted, ...args);
    }
  }

  /**
   * Logs an info message. Shown when log level is INFO or lower.
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.format(message, 'INFO', chalk.blue);
      console.log(formatted, ...args);
    }
  }

  /**
   * Logs a warning message. Shown when log level is WARN or lower.
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.format(message, 'WARN', chalk.yellow);
      console.warn(formatted, ...args);
    }
  }

  /**
   * Logs an error message. Always shown (unless level is set higher than ERROR).
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.format(message, 'ERROR', chalk.red);
      console.error(formatted, ...args);
    }
  }
}

/**
 * Default logger instance with INFO level.
 */
export const logger = new Logger({
  level: LogLevel.INFO,
  timestamps: false,
});

/**
 * Creates a new logger instance with a custom prefix.
 */
export function createLogger(prefix: string, options?: Omit<LoggerOptions, 'prefix'>): Logger {
  return new Logger({ ...options, prefix });
}
