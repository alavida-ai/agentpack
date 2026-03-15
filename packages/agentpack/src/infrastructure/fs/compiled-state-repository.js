import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readCompiledState(repoRoot) {
  const compiledPath = join(repoRoot, '.agentpack', 'compiled.json');
  if (!existsSync(compiledPath)) return null;
  return JSON.parse(readFileSync(compiledPath, 'utf-8'));
}

export function writeCompiledState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'compiled.json'), JSON.stringify(state, null, 2) + '\n');
}
