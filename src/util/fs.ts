import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const formatted = line.endsWith('\n') ? line : `${line}\n`;
  await fs.appendFile(filePath, formatted, 'utf8');
}

export async function appendScratchpadEntry(filePath: string, entry: string): Promise<void> {
  await appendLine(filePath, `* ${entry}`);
}

export async function appendTodo(filePath: string, item: string, done = false): Promise<void> {
  const mark = done ? 'x' : ' ';
  await appendLine(filePath, `- [${mark}] ${item}`);
}

export async function writeFallbackFile(dir: string, agent: string, message: string): Promise<string> {
  const fileName = `ob1_result_${agent}.md`;
  const filePath = path.join(dir, fileName);
  const content = `# ob1 fallback result\n\n${message}\n`;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, json, 'utf8');
}

export async function appendJsonLine(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const line = `${JSON.stringify(data)}\n`;
  await fs.appendFile(filePath, line, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
