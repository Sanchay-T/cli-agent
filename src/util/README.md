# Utility Modules

## Logger

The `logger` module provides a flexible logging utility with multiple log levels and formatting options.

### Features

- **Multiple log levels**: DEBUG, INFO, WARN, ERROR, SILENT
- **Colored output**: Different colors for different log levels
- **Timestamps**: ISO 8601 formatted timestamps (optional)
- **Prefixes**: Add context-specific prefixes to log messages
- **Child loggers**: Create loggers with inherited configuration
- **Environment-based configuration**: Control log level via `LOG_LEVEL` environment variable
- **Object formatting**: Automatically formats JavaScript objects as JSON

### Basic Usage

```typescript
import { info, warn, error, debug } from './util/logger.js';

// Simple logging
info('Application started');
warn('High memory usage detected');
error('Database connection failed');
debug('Request details', { method: 'GET', path: '/api/users' });
```

### Custom Logger Instances

```typescript
import { Logger, LogLevel } from './util/logger.js';

// Create a logger with a prefix
const dbLogger = new Logger({ prefix: 'database' });
dbLogger.info('Connection established');
dbLogger.error('Query failed');

// Create a logger with custom log level
const productionLogger = new Logger({ 
  level: LogLevel.WARN,
  prefix: 'production'
});

// Only warnings and errors will be shown
productionLogger.info('This will not be shown');
productionLogger.warn('This will be shown');

// Disable timestamps
const cleanLogger = new Logger({ 
  timestamps: false,
  prefix: 'clean'
});
```

### Child Loggers

Create child loggers that inherit configuration from their parent:

```typescript
const apiLogger = new Logger({ prefix: 'api' });
const authLogger = apiLogger.child('auth');
const userLogger = apiLogger.child('users');

authLogger.info('User authenticated');  // [INFO] [api:auth] User authenticated
userLogger.info('Profile updated');      // [INFO] [api:users] Profile updated
```

### Log Levels

The logger supports five log levels:

- `LogLevel.DEBUG` (0): Detailed debugging information
- `LogLevel.INFO` (1): General informational messages (default)
- `LogLevel.WARN` (2): Warning messages
- `LogLevel.ERROR` (3): Error messages
- `LogLevel.SILENT` (4): No logging output

Set the log level programmatically:

```typescript
logger.setLevel(LogLevel.DEBUG);
```

Or via environment variable:

```bash
LOG_LEVEL=DEBUG node app.js
```

### API Reference

#### Logger Class

```typescript
class Logger {
  constructor(options?: LoggerOptions)
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  setLevel(level: LogLevel): void
  setPrefix(prefix: string): void
  child(prefix: string): Logger
}
```

#### LoggerOptions

```typescript
interface LoggerOptions {
  level?: LogLevel;      // Default: INFO
  prefix?: string;       // Default: ''
  timestamps?: boolean;  // Default: true
}
```

#### Convenience Functions

```typescript
debug(message: string, ...args: unknown[]): void
info(message: string, ...args: unknown[]): void
warn(message: string, ...args: unknown[]): void
error(message: string, ...args: unknown[]): void
```

These functions use a default logger instance and are perfect for quick logging needs.

### Color Scheme

- DEBUG: Magenta
- INFO: Blue
- WARN: Yellow
- ERROR: Red
- Timestamps: Gray
- Prefixes: Cyan

### Output Format

```
[timestamp] [LEVEL] [prefix] message additional_args
```

Example:
```
[2025-11-11T07:14:24.861Z] [INFO] [database] Connection established
```
