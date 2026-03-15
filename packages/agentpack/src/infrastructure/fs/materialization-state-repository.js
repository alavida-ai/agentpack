import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readMaterializationState(repoRoot) {
  const materializationPath = join(repoRoot, '.agentpack', 'materialization-state.json');
  if (!existsSync(materializationPath)) return null;
  return JSON.parse(readFileSync(materializationPath, 'utf-8'));
}

export function writeMaterializationState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(
    join(repoRoot, '.agentpack', 'materialization-state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );
}
