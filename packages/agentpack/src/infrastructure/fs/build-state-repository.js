import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readBuildState(repoRoot) {
  const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');
  if (!existsSync(buildStatePath)) {
    return { version: 1, skills: {} };
  }

  return JSON.parse(readFileSync(buildStatePath, 'utf-8'));
}

export function writeBuildState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'build-state.json'), JSON.stringify(state, null, 2) + '\n');
}
