import { promises as fs } from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { fileExists } from './fs.js';

type McpConfigFile = {
  servers?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
};

const ENV_PLACEHOLDER = /\$\{env:([A-Z0-9_]+)(\|([^}]*))?\}/gi;

export async function loadMcpServers(
  baseDir: string,
  explicitPath?: string,
): Promise<Record<string, McpServerConfig>> {
  const candidates = buildSearchOrder(baseDir, explicitPath);
  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    try {
      const fileContents = await fs.readFile(candidate, 'utf8');
      const parsed = JSON.parse(fileContents) as McpConfigFile;
      const rawServers = parsed.servers ?? parsed.mcpServers;
      if (!rawServers) {
        consola.warn(`[mcp] ${candidate} does not define any servers.`);
        continue;
      }

      const missingEnv = new Set<string>();
      const hydratedEntries = Object.entries(rawServers).reduce<Record<string, McpServerConfig>>(
        (acc, [name, server]) => {
          acc[name] = resolvePlaceholders(server, missingEnv) as McpServerConfig;
          return acc;
        },
        {},
      );

      if (missingEnv.size > 0) {
        consola.warn(
          `[mcp] Missing environment values for: ${Array.from(missingEnv)
            .sort()
            .join(', ')} (define them in .env before running agents).`,
        );
      }

      consola.info(`[mcp] Loaded ${Object.keys(hydratedEntries).length} MCP server(s) from ${candidate}`);
      return hydratedEntries;
    } catch (error) {
      consola.warn(`[mcp] Failed to read MCP config at ${candidate}: ${error}`);
    }
  }

  consola.info('[mcp] No MCP config found; continuing without custom servers.');
  return {};
}

function buildSearchOrder(baseDir: string, explicitPath?: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];

  const addPath = (value: string | undefined): void => {
    if (!value) {
      return;
    }
    const normalized = path.isAbsolute(value) ? value : path.resolve(baseDir, value);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    order.push(normalized);
  };

  addPath(explicitPath);
  addPath(process.env.MCP_CONFIG_PATH);
  addPath(path.join(baseDir, 'config', 'mcp.config.json'));
  addPath(path.join(baseDir, 'mcp.config.json'));

  return order;
}

function resolvePlaceholders(value: unknown, missingEnv: Set<string>): unknown {
  if (typeof value === 'string') {
    return value.replace(ENV_PLACEHOLDER, (_, varName: string, __: string, defaultValue: string | undefined) => {
      const envValue = process.env[varName];
      if (envValue !== undefined && envValue.length > 0) {
        return envValue;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      missingEnv.add(varName);
      return '';
    });
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolvePlaceholders(entry, missingEnv));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      acc[key] = resolvePlaceholders(entry, missingEnv);
      return acc;
    }, {});
  }

  return value;
}
