#!/usr/bin/env node
import { Command } from 'commander';
import { consola } from 'consola';
import { createRequire } from 'node:module';
import { runOb1, type OrchestratorOptions } from './orchestrator.js';
import { runDoctor } from './util/env.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };

type RunCommandOptions = {
  message?: string;
  k?: string;
  repo?: string;
  base?: string;
  dry?: boolean;
  agents?: string;
  allowDirty?: boolean;
  timeoutMs?: string;
  workRoot?: string;
};

const program = new Command();

program
  .name('ob1')
  .description('Run multiple AI coding agents in parallel on a git repository')
  .version(packageJson.version ?? '0.0.0');

program
  .command('doctor')
  .description('Validate environment configuration and required secrets')
  .action(async () => {
    try {
      await runDoctor();
    } catch (error) {
      consola.error(error);
      process.exitCode = 1;
    }
  });

program
  .option('-m, --message <message>', 'Task message shared with all agents')
  .option('-k <count>', 'Number of agents to run in parallel (max 3)')
  .option('--repo <repo>', 'Target repository (URL or local path). Defaults to current repo.')
  .option('--base <branch>', 'Base branch to start from', 'main')
  .option('--agents <agents>', 'Comma-separated list of agents to run (codex,claude,cursor,qa)')
  .option('--dry', 'Dry run: skip pushing commits and creating PRs')
  .option('--allow-dirty', 'Allow running with a dirty repository state')
  .option('--timeout-ms <timeout>', 'Per-agent timeout in milliseconds')
  .option('--work-root <path>', 'Custom work directory root', 'work')
  .action(async (options: RunCommandOptions) => {
    const { message, k, repo, base, dry, agents, allowDirty, timeoutMs, workRoot } = options;

    if (!message) {
      consola.error('The --message option is required.');
      process.exit(1);
      return;
    }

    const parsedK = k ? Number.parseInt(k, 10) : undefined;
    if (!parsedK || Number.isNaN(parsedK) || parsedK <= 0) {
      consola.error('The -k option must be a positive integer.');
      process.exit(1);
      return;
    }

    const opts: OrchestratorOptions = {
      message,
      k: parsedK,
      repo,
      baseBranch: base ?? 'main',
      dryRun: Boolean(dry),
      agents: agents?.split(',').map((a) => a.trim()).filter(Boolean),
      allowDirty: Boolean(allowDirty),
      timeoutMs: timeoutMs ? Number.parseInt(timeoutMs, 10) : undefined,
      workRoot: workRoot ?? 'work',
    };

    try {
      await runOb1(opts);
    } catch (error) {
      consola.error(error);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
