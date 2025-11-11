import { consola } from 'consola';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function resolveLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && LEVELS.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

const activeLevel = resolveLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(activeLevel);
}

type LoggerMethod = (message?: unknown, ...optionalParams: unknown[]) => void;

function makeLogMethod(level: LogLevel): LoggerMethod {
  return (message?: unknown, ...optionalParams: unknown[]) => {
    if (!shouldLog(level)) {
      return;
    }
    (consola as unknown as Record<LogLevel, LoggerMethod>)[level](
      message,
      ...optionalParams,
    );
  };
}

function makePassthroughMethod(
  method: 'success' | 'start',
  level: LogLevel,
): LoggerMethod {
  return (message?: unknown, ...optionalParams: unknown[]) => {
    if (!shouldLog(level)) {
      return;
    }
    (consola as unknown as Record<'success' | 'start', LoggerMethod>)[method](
      message,
      ...optionalParams,
    );
  };
}

export const logger = {
  level: activeLevel,
  debug: makeLogMethod('debug'),
  info: makeLogMethod('info'),
  warn: makeLogMethod('warn'),
  error: makeLogMethod('error'),
  success: makePassthroughMethod('success', 'info'),
  start: makePassthroughMethod('start', 'info'),
};

export type Logger = typeof logger;
