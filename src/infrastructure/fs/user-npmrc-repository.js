import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function parseNpmrc(content) {
  const config = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    config[key] = value;
  }
  return config;
}

export function getUserNpmrcPath({ env = process.env } = {}) {
  return join(env.HOME || homedir(), '.npmrc');
}

export function readUserNpmrc({ env = process.env } = {}) {
  const npmrcPath = getUserNpmrcPath({ env });
  if (!existsSync(npmrcPath)) return {};
  return parseNpmrc(readFileSync(npmrcPath, 'utf-8'));
}

function upsertLine(lines, key, value) {
  const prefix = `${key}=`;
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.trim().startsWith(prefix));
  if (index === -1) {
    lines.push(nextLine);
    return;
  }
  lines[index] = nextLine;
}

function removeLine(lines, key) {
  const prefix = `${key}=`;
  return lines.filter((line) => !line.trim().startsWith(prefix));
}

export function writeManagedNpmrcEntries({
  entries,
  env = process.env,
} = {}) {
  const npmrcPath = getUserNpmrcPath({ env });
  const lines = existsSync(npmrcPath)
    ? readFileSync(npmrcPath, 'utf-8').split('\n').filter((line, index, all) => !(index === all.length - 1 && line === ''))
    : [];

  for (const [key, value] of Object.entries(entries)) {
    upsertLine(lines, key, value);
  }

  writeFileSync(npmrcPath, `${lines.join('\n')}\n`);
}

export function removeManagedNpmrcEntries({
  keys,
  env = process.env,
} = {}) {
  const npmrcPath = getUserNpmrcPath({ env });
  if (!existsSync(npmrcPath)) return;

  let lines = readFileSync(npmrcPath, 'utf-8').split('\n').filter((line, index, all) => !(index === all.length - 1 && line === ''));
  for (const key of keys) {
    lines = removeLine(lines, key);
  }

  writeFileSync(npmrcPath, `${lines.join('\n')}\n`);
}
