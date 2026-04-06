import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readPluginSyncState(repoRoot) {
  const statePath = join(repoRoot, '.agentpack', 'plugin-sync-state.json');
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, 'utf-8'));
}

export function writePluginSyncState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(
    join(repoRoot, '.agentpack', 'plugin-sync-state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );
}
