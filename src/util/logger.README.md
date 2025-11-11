# Logger Utility

A flexible and colorful logging utility for Node.js applications with support for different log levels, prefixes, and timestamps.

## Features

- **Multiple Log Levels**: DEBUG, INFO, WARN, and ERROR
- **Colored Output**: Different colors for each log level using chalk
- **Configurable**: Set log level, prefix, and timestamp options
- **Dynamic Level Changes**: Change log level at runtime
- **Multiple Instances**: Create multiple loggers with different configurations
- **TypeScript Support**: Fully typed with TypeScript

## Installation

The logger is already included in this project. Simply import it:

```typescript
import { Logger, LogLevel, createLogger, logger } from './util/logger.js';
```

## Basic Usage

### Using the Default Logger

```typescript
import { logger } from './util/logger.js';

logger.debug('Detailed debugging information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error message');
```

### Creating a Custom Logger

```typescript
import { Logger, LogLevel } from './util/logger.js';

const customLogger = new Logger({
  level: LogLevel.DEBUG,
  prefix: 'MyApp',
  timestamps: true
});

customLogger.debug('Debug message with timestamp and prefix');
```

### Creating a Logger with Prefix (Shorthand)

```typescript
import { createLogger } from './util/logger.js';

const moduleLogger = createLogger('Database');
moduleLogger.info('Connection established');
```

## Log Levels

The logger supports four log levels, in order of severity:

1. **DEBUG** (0) - Detailed debugging information
2. **INFO** (1) - General informational messages
3. **WARN** (2) - Warning messages
4. **ERROR** (3) - Error messages

Setting a log level will show messages at that level and above. For example:
- `LogLevel.DEBUG` shows all messages
- `LogLevel.INFO` shows INFO, WARN, and ERROR (but not DEBUG)
- `LogLevel.WARN` shows only WARN and ERROR
- `LogLevel.ERROR` shows only ERROR messages

## Configuration Options

### LoggerOptions

```typescript
interface LoggerOptions {
  level?: LogLevel;      // Minimum log level (default: INFO)
  prefix?: string;       // Prefix for all log messages (default: '')
  timestamps?: boolean;  // Include ISO timestamps (default: false)
}
```

## API Reference

### Logger Class

#### Constructor

```typescript
new Logger(options?: LoggerOptions)
```

Creates a new logger instance with the specified options.

#### Methods

##### `setLevel(level: LogLevel): void`

Sets the minimum log level. Messages below this level will not be logged.

```typescript
logger.setLevel(LogLevel.DEBUG);
```

##### `getLevel(): LogLevel`

Gets the current log level.

```typescript
const currentLevel = logger.getLevel();
```

##### `debug(message: string, ...args: unknown[]): void`

Logs a debug message. Only shown when log level is DEBUG.

```typescript
logger.debug('Debugging info', { data: 'value' });
```

##### `info(message: string, ...args: unknown[]): void`

Logs an info message. Shown when log level is INFO or lower.

```typescript
logger.info('Application started');
```

##### `warn(message: string, ...args: unknown[]): void`

Logs a warning message. Shown when log level is WARN or lower.

```typescript
logger.warn('Deprecated API used');
```

##### `error(message: string, ...args: unknown[]): void`

Logs an error message. Always shown (unless level is set higher than ERROR).

```typescript
logger.error('Failed to connect', error);
```

### Factory Functions

#### `createLogger(prefix: string, options?: Omit<LoggerOptions, 'prefix'>): Logger`

Creates a new logger instance with a custom prefix.

```typescript
const apiLogger = createLogger('API', { level: LogLevel.DEBUG });
```

### Default Export

#### `logger: Logger`

A default logger instance with INFO level and no prefix.

```typescript
import { logger } from './util/logger.js';
logger.info('Using default logger');
```

## Usage Examples

### Example 1: Module-Specific Loggers

```typescript
import { createLogger, LogLevel } from './util/logger.js';

const dbLogger = createLogger('Database', { level: LogLevel.DEBUG });
const apiLogger = createLogger('API', { level: LogLevel.INFO });

dbLogger.debug('SQL query executed');
dbLogger.info('Database connected');

apiLogger.info('API server started on port 3000');
```

### Example 2: Environment-Based Configuration

```typescript
import { Logger, LogLevel } from './util/logger.js';

const isDev = process.env.NODE_ENV !== 'production';

const logger = new Logger({
  level: isDev ? LogLevel.DEBUG : LogLevel.WARN,
  timestamps: !isDev,
  prefix: 'App'
});

logger.debug('This only shows in development');
logger.info('Application started');
logger.error('This shows in all environments');
```

### Example 3: Dynamic Log Level

```typescript
import { Logger, LogLevel } from './util/logger.js';

const logger = new Logger({ level: LogLevel.INFO });

// Enable verbose logging for debugging
if (process.env.VERBOSE) {
  logger.setLevel(LogLevel.DEBUG);
}

logger.debug('This only shows if VERBOSE is set');
```

### Example 4: Logging Complex Objects

```typescript
import { logger } from './util/logger.js';

const user = { id: 1, name: 'John', email: 'john@example.com' };
const stats = { requests: 100, errors: 5 };

logger.info('User logged in:', user);
logger.warn('High error rate detected:', stats);
```

## Color Scheme

- **DEBUG**: Gray
- **INFO**: Blue
- **WARN**: Yellow
- **ERROR**: Red
- **Timestamps**: Gray
- **Prefix**: Cyan

## Best Practices

1. **Use Appropriate Log Levels**:
   - Use DEBUG for detailed troubleshooting information
   - Use INFO for general application flow
   - Use WARN for recoverable issues
   - Use ERROR for serious problems

2. **Create Module-Specific Loggers**: Use prefixes to identify which part of your application is logging:
   ```typescript
   const dbLogger = createLogger('Database');
   const authLogger = createLogger('Auth');
   ```

3. **Adjust Levels by Environment**: Use DEBUG in development and WARN/ERROR in production:
   ```typescript
   const level = process.env.NODE_ENV === 'production'
     ? LogLevel.WARN
     : LogLevel.DEBUG;
   ```

4. **Include Context**: Pass additional objects/data to provide context:
   ```typescript
   logger.error('Failed to process user', { userId, error });
   ```

5. **Don't Log Sensitive Data**: Be careful not to log passwords, tokens, or other sensitive information.

## Testing

Run the test suite:

```bash
npm test tests/logger.spec.ts
```

## Running Examples

To see the logger in action:

```bash
npx tsx src/util/logger.example.ts
```

## License

Part of the ob1 project.
