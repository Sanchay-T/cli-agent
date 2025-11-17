import dotenv from 'dotenv';
import path from 'node:path';
import { logger } from './logger.js';

const REQUIRED_ENV_KEYS = [
  'CLAUDE_API_KEY',
  'CODEX_CLI_KEY',
  'OPENAI_API_KEY',
  'CURSOR_API_KEY',
  'GITHUB_TOKEN',
] as const;

// Map agents to their required keys
export const AGENT_ENV_KEYS: Record<string, string[]> = {
  claude: ['CLAUDE_API_KEY'],
  codex: ['CODEX_CLI_KEY', 'OPENAI_API_KEY'],
  cursor: ['CURSOR_API_KEY'],
  qa: ['CLAUDE_API_KEY'], // QA agent only needs Claude API key
};

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

type EnvCheckResult = {
  key: RequiredEnvKey;
  present: boolean;
};

let envLoaded = false;

function loadEnv(): void {
  if (envLoaded) {
    return;
  }

  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
  envLoaded = true;
}

export function ensureEnvLoaded(): void {
  loadEnv();
}

export function validateEnvKeys(keys: readonly RequiredEnvKey[] = REQUIRED_ENV_KEYS): EnvCheckResult[] {
  ensureEnvLoaded();
  return keys.map((key) => ({ key, present: Boolean(process.env[key]) }));
}

export function assertRequiredEnv(keys?: readonly RequiredEnvKey[]): void {
  // If no keys specified, check all (for backwards compatibility)
  const keysToCheck = keys || REQUIRED_ENV_KEYS;
  const results = validateEnvKeys(keysToCheck);
  const missing = results.filter((result) => !result.present);
  if (missing.length > 0) {
    const missingKeys = missing.map((item) => item.key).join(', ');
    throw new Error(`Missing required environment variables: ${missingKeys}`);
  }
}

export function assertAgentEnv(agents: string[]): void {
  // Get unique keys needed for the selected agents
  const requiredKeys = new Set<string>();

  for (const agent of agents) {
    const keys = AGENT_ENV_KEYS[agent];
    if (keys) {
      keys.forEach((key) => requiredKeys.add(key));
    }
  }

  // Always require GITHUB_TOKEN
  requiredKeys.add('GITHUB_TOKEN');

  // Special handling for CLAUDE_API_KEY: accept ANTHROPIC_API_KEY as alternative
  if (requiredKeys.has('CLAUDE_API_KEY')) {
    if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing required environment variables: CLAUDE_API_KEY or ANTHROPIC_API_KEY');
    }
    // Remove CLAUDE_API_KEY from validation since we've already checked
    requiredKeys.delete('CLAUDE_API_KEY');
  }

  // Validate only the remaining keys needed for selected agents
  if (requiredKeys.size > 0) {
    assertRequiredEnv(Array.from(requiredKeys) as RequiredEnvKey[]);
  }
}

export async function runDoctor(): Promise<void> {
  const results = validateEnvKeys();
  logger.info('Environment configuration check');
  logger.info('--------------------------------');
  for (const result of results) {
    logger.info(`${result.present ? '✅' : '❌'} ${result.key}`);
  }

  const missing = results.filter((result) => !result.present);
  if (missing.length > 0) {
    logger.warn('Some environment variables are missing.');
    process.exitCode = 1;
  } else {
    logger.success('All required environment variables are set.');
  }
}

export { REQUIRED_ENV_KEYS };
