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

export function assertRequiredEnv(keys: readonly RequiredEnvKey[] = REQUIRED_ENV_KEYS): void {
  const results = validateEnvKeys(keys);
  const missing = results.filter((result) => !result.present);
  if (missing.length > 0) {
    const missingKeys = missing.map((item) => item.key).join(', ');
    throw new Error(`Missing required environment variables: ${missingKeys}`);
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
