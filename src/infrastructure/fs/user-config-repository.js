import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CONFIG = {
  version: 1,
  provider: 'github-packages',
  scope: '@alavida-ai',
  registry: 'https://npm.pkg.github.com',
  verificationPackage: '@alavida-ai/agentpack-auth-probe',
  managedNpmKeys: [],
};

function resolveConfigDir(env = process.env) {
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  if (xdgConfigHome) return join(xdgConfigHome, 'agentpack');
  return join(env.HOME || homedir(), '.config', 'agentpack');
}

export function getUserConfigPath({ env = process.env } = {}) {
  return join(resolveConfigDir(env), 'config.json');
}

export function readUserConfig({ env = process.env } = {}) {
  const configPath = getUserConfigPath({ env });
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  return {
    ...DEFAULT_CONFIG,
    ...JSON.parse(readFileSync(configPath, 'utf-8')),
  };
}

export function writeUserConfig(config, { env = process.env } = {}) {
  const configPath = getUserConfigPath({ env });
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
