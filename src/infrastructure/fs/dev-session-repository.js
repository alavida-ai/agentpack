import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function getDevSessionPath(repoRoot) {
  return join(repoRoot, '.agentpack', 'dev-session.json');
}

export function readDevSession(repoRoot) {
  const sessionPath = getDevSessionPath(repoRoot);
  if (!existsSync(sessionPath)) return null;
  return JSON.parse(readFileSync(sessionPath, 'utf-8'));
}

export function writeDevSession(repoRoot, session) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(getDevSessionPath(repoRoot), JSON.stringify(session, null, 2) + '\n');
}

export function removeDevSession(repoRoot) {
  rmSync(getDevSessionPath(repoRoot), { force: true });
}

export function devSessionExists(repoRoot) {
  return existsSync(getDevSessionPath(repoRoot));
}
