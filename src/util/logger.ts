import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
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
    this.level = options.level ?? this.parseLogLevel(process.env.LOG_LEVEL);
    this.prefix = options.prefix ?? '';
    this.timestamps = options.timestamps ?? true;
  }

  private parseLogLevel(level?: string): LogLevel {
    if (!level) return LogLevel.INFO;
    
    const normalized = level.toUpperCase();
    switch (normalized) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
      case 'WARNING':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      case 'SILENT':
        return LogLevel.SILENT;
      default:
        return LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const parts: string[] = [];
    
    if (this.timestamps) {
      const timestamp = new Date().toISOString();
      parts.push(chalk.gray(`[${timestamp}]`));
    }
    
    parts.push(`[${level}]`);
    
    if (this.prefix) {
      parts.push(chalk.cyan(`[${this.prefix}]`));
    }
    
    parts.push(message);
    
    const formattedMessage = parts.join(' ');
    
    if (args.length > 0) {
      return `${formattedMessage} ${args.map((arg) => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')}`;
    }
    
    return formattedMessage;
  }

  private log(level: LogLevel, levelName: string, color: (text: string) => string, message: string, ...args: unknown[]): void {
    if (this.level > level) {
      return;
    }
    
    const formattedLevel = color(levelName);
    const formattedMessage = this.formatMessage(formattedLevel, message, ...args);
    
    if (level >= LogLevel.ERROR) {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', chalk.magenta, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, 'INFO', chalk.blue, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, 'WARN', chalk.yellow, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, 'ERROR', chalk.red, message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamps: this.timestamps,
    });
  }
}

// Default logger instance
export const logger = new Logger();

// Convenience functions using the default logger
export const debug = (message: string, ...args: unknown[]): void => logger.debug(message, ...args);
export const info = (message: string, ...args: unknown[]): void => logger.info(message, ...args);
export const warn = (message: string, ...args: unknown[]): void => logger.warn(message, ...args);
export const error = (message: string, ...args: unknown[]): void => logger.error(message, ...args);
