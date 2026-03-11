import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readInstallState(repoRoot) {
  const installStatePath = join(repoRoot, '.agentpack', 'install.json');
  if (!existsSync(installStatePath)) {
    return { version: 1, installs: {} };
  }

  return JSON.parse(readFileSync(installStatePath, 'utf-8'));
}

export function writeInstallState(repoRoot, state) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'install.json'), JSON.stringify(state, null, 2) + '\n');
}
