import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel, createLogger, logger } from '../src/util/logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LogLevel filtering', () => {
    it('should log all levels when set to DEBUG', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG });

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug and info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should not log debug when set to INFO', () => {
      const testLogger = new Logger({ level: LogLevel.INFO });

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // only info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should only log warn and error when set to WARN', () => {
      const testLogger = new Logger({ level: LogLevel.WARN });

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should only log error when set to ERROR', () => {
      const testLogger = new Logger({ level: LogLevel.ERROR });

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('setLevel and getLevel', () => {
    it('should allow changing log level dynamically', () => {
      const testLogger = new Logger({ level: LogLevel.ERROR });

      expect(testLogger.getLevel()).toBe(LogLevel.ERROR);

      testLogger.setLevel(LogLevel.DEBUG);
      expect(testLogger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should respect new log level after change', () => {
      const testLogger = new Logger({ level: LogLevel.ERROR });

      testLogger.debug('should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      testLogger.setLevel(LogLevel.DEBUG);
      testLogger.debug('should log');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('prefix option', () => {
    it('should include prefix in log messages', () => {
      const testLogger = new Logger({ prefix: 'TestApp', level: LogLevel.INFO });

      testLogger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('TestApp');
    });

    it('should work without prefix', () => {
      const testLogger = new Logger({ level: LogLevel.INFO });

      testLogger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('timestamps option', () => {
    it('should include timestamps when enabled', () => {
      const testLogger = new Logger({ timestamps: true, level: LogLevel.INFO });

      testLogger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][0] as string;
      // Should contain an ISO timestamp pattern
      expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should not include timestamps when disabled', () => {
      const testLogger = new Logger({ timestamps: false, level: LogLevel.INFO });

      testLogger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][0] as string;
      // Should not contain an ISO timestamp pattern
      expect(loggedMessage).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('additional arguments', () => {
    it('should pass additional arguments to console methods', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG });
      const obj = { key: 'value' };
      const num = 42;

      testLogger.info('test', obj, num);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('test'),
        obj,
        num
      );
    });
  });

  describe('default logger instance', () => {
    it('should export a default logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('createLogger factory', () => {
    it('should create a new logger with prefix', () => {
      const testLogger = createLogger('MyModule');

      testLogger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('MyModule');
    });

    it('should accept additional options', () => {
      const testLogger = createLogger('MyModule', {
        level: LogLevel.DEBUG,
        timestamps: true
      });

      expect(testLogger.getLevel()).toBe(LogLevel.DEBUG);

      testLogger.debug('test message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const loggedMessage = consoleLogSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('MyModule');
      expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('message formatting', () => {
    it('should include level indicator in messages', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG });

      testLogger.debug('debug');
      testLogger.info('info');
      testLogger.warn('warn');
      testLogger.error('error');

      expect(consoleLogSpy.mock.calls[0][0]).toContain('DEBUG');
      expect(consoleLogSpy.mock.calls[1][0]).toContain('INFO');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARN');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
    });
  });
});
