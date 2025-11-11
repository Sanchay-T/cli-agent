/**
 * Example usage of the Logger utility
 *
 * This file demonstrates how to use the logging utility with different
 * log levels, prefixes, and configurations.
 */

import { Logger, LogLevel, createLogger, logger } from './logger.js';

// Example 1: Using the default logger
console.log('\n=== Example 1: Default Logger ===');
logger.debug('This debug message will NOT be shown (default level is INFO)');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');

// Example 2: Creating a logger with DEBUG level
console.log('\n=== Example 2: Logger with DEBUG level ===');
const debugLogger = new Logger({ level: LogLevel.DEBUG });
debugLogger.debug('This debug message WILL be shown');
debugLogger.info('Info message');
debugLogger.warn('Warning message');
debugLogger.error('Error message');

// Example 3: Creating a logger with a prefix
console.log('\n=== Example 3: Logger with prefix ===');
const moduleLogger = createLogger('MyModule');
moduleLogger.info('Starting module initialization');
moduleLogger.warn('Configuration file not found, using defaults');
moduleLogger.info('Module initialized successfully');

// Example 4: Logger with timestamps
console.log('\n=== Example 4: Logger with timestamps ===');
const timestampLogger = new Logger({
  level: LogLevel.INFO,
  timestamps: true,
  prefix: 'TimestampExample'
});
timestampLogger.info('Message with timestamp');

// Example 5: Changing log level dynamically
console.log('\n=== Example 5: Dynamic log level ===');
const dynamicLogger = new Logger({ level: LogLevel.ERROR });
dynamicLogger.info('This will NOT be shown (level is ERROR)');
dynamicLogger.error('This will be shown');

console.log('Changing level to DEBUG...');
dynamicLogger.setLevel(LogLevel.DEBUG);
dynamicLogger.debug('Now debug messages are shown!');
dynamicLogger.info('Info messages too!');

// Example 6: Logging with additional arguments
console.log('\n=== Example 6: Additional arguments ===');
const dataLogger = new Logger({ level: LogLevel.INFO });
const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
dataLogger.info('User data:', userData);
dataLogger.warn('Multiple args:', 'value1', 123, { key: 'value' });

// Example 7: Module-specific loggers
console.log('\n=== Example 7: Module-specific loggers ===');
const dbLogger = createLogger('Database', { level: LogLevel.DEBUG });
const apiLogger = createLogger('API', { level: LogLevel.INFO });

dbLogger.debug('Connecting to database...');
dbLogger.info('Database connection established');

apiLogger.debug('This debug message will NOT be shown (API logger level is INFO)');
apiLogger.info('API server started on port 3000');

// Example 8: Production vs Development
console.log('\n=== Example 8: Production vs Development ===');
const env = process.env['NODE_ENV'] || 'development';
const appLogger = new Logger({
  level: env === 'production' ? LogLevel.WARN : LogLevel.DEBUG,
  prefix: 'App',
  timestamps: env === 'production'
});

appLogger.debug('Detailed debugging info (dev only)');
appLogger.info('Application started');
appLogger.warn('This warning shows in both dev and prod');
