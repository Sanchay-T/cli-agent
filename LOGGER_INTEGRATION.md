# Logger Integration Guide

This document describes how to integrate the new logging utility into the existing ob1 codebase.

## Files Added

1. **`src/util/logger.ts`** - Main logger implementation
2. **`src/util/logger.example.ts`** - Usage examples
3. **`src/util/logger.README.md`** - Comprehensive documentation
4. **`tests/logger.spec.ts`** - Test suite (15 tests, all passing)

## Quick Start

### Replace console.log/console.error calls

Instead of:
```typescript
console.log('Processing...');
console.error('Failed:', error);
```

Use:
```typescript
import { logger } from './util/logger.js';

logger.info('Processing...');
logger.error('Failed:', error);
```

### Module-Specific Loggers

Create loggers with prefixes for different parts of the application:

```typescript
import { createLogger } from './util/logger.js';

// In src/agents/claude.ts
const logger = createLogger('Claude');
logger.info('Starting Claude agent');

// In src/agents/codex.ts
const logger = createLogger('Codex');
logger.info('Starting Codex agent');

// In src/orchestrator.ts
const logger = createLogger('Orchestrator');
logger.info('Orchestrating agents');
```

## Integration Examples

### Example 1: In CLI (src/cli.ts)

Replace `consola` calls with the logger:

```typescript
import { createLogger, LogLevel } from './util/logger.js';

const logger = createLogger('CLI', {
  level: process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO
});

// Instead of: consola.error('The --message option is required.');
logger.error('The --message option is required.');

// Instead of: consola.error(error);
logger.error('Operation failed:', error);
```

### Example 2: In Agent Files (src/agents/*.ts)

```typescript
import { createLogger, LogLevel } from '../util/logger.js';

const logger = createLogger('ClaudeAgent', { level: LogLevel.DEBUG });

export async function runClaudeAgent(config: AgentConfig) {
  logger.debug('Agent configuration:', config);
  logger.info('Starting agent execution');

  try {
    // Agent logic here
    logger.info('Agent completed successfully');
  } catch (error) {
    logger.error('Agent failed:', error);
    throw error;
  }
}
```

### Example 3: In Orchestrator (src/orchestrator.ts)

```typescript
import { createLogger, LogLevel } from './util/logger.js';

const logger = createLogger('Orchestrator');

export async function runOb1(options: OrchestratorOptions) {
  logger.info('Starting orchestration', { k: options.k, agents: options.agents });
  logger.debug('Full options:', options);

  if (options.dryRun) {
    logger.warn('Running in dry-run mode - no changes will be pushed');
  }

  try {
    // Orchestration logic
    logger.info('Orchestration completed successfully');
  } catch (error) {
    logger.error('Orchestration failed:', error);
    throw error;
  }
}
```

## Environment-Based Configuration

Configure logging based on environment:

```typescript
import { Logger, LogLevel } from './util/logger.js';

const isDev = process.env.NODE_ENV !== 'production';
const isVerbose = process.env.DEBUG === 'true';

const logger = new Logger({
  level: isVerbose ? LogLevel.DEBUG : (isDev ? LogLevel.INFO : LogLevel.WARN),
  timestamps: !isDev,
  prefix: 'ob1'
});
```

## Benefits Over Consola

1. **Type Safety**: Full TypeScript support with typed log levels
2. **Flexibility**: Create multiple loggers with different configurations
3. **Lightweight**: No external dependencies beyond chalk (already in package.json)
4. **Customizable**: Easy to extend with custom formatters
5. **Testable**: Comprehensive test suite included

## Coexistence

The logger can coexist with `consola`. You can:
- Keep `consola` for interactive CLI prompts and spinners
- Use the new `Logger` for structured application logging

## Running Tests

```bash
# Run only logger tests
npm test tests/logger.spec.ts

# Run all tests
npm test
```

## Running Examples

```bash
# See the logger in action
npx tsx src/util/logger.example.ts
```

## Migration Strategy

### Phase 1: Gradual Adoption (Recommended)
- Start using the logger in new code
- Keep existing consola usage intact
- Gradually migrate critical sections

### Phase 2: Full Migration (Optional)
- Replace all console.log/console.error with logger
- Replace consola with logger where appropriate
- Keep consola for interactive features (spinners, prompts)

## Further Customization

The logger can be easily extended. For example, to add a custom log level or formatter:

```typescript
// Custom formatter
class CustomLogger extends Logger {
  success(message: string, ...args: unknown[]): void {
    const formatted = chalk.green(`[SUCCESS] ${message}`);
    console.log(formatted, ...args);
  }
}
```

## Support

For questions or issues:
1. Review `src/util/logger.README.md` for comprehensive documentation
2. Check `src/util/logger.example.ts` for usage examples
3. Review `tests/logger.spec.ts` for test examples
