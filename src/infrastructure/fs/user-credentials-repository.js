import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

function resolveConfigDir(env = process.env) {
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  if (xdgConfigHome) return join(xdgConfigHome, 'agentpack');
  return join(env.HOME || homedir(), '.config', 'agentpack');
}

export function getUserCredentialsPath({ env = process.env } = {}) {
  return join(resolveConfigDir(env), 'credentials.json');
}

export function readUserCredentials({ env = process.env } = {}) {
  const credentialsPath = getUserCredentialsPath({ env });
  if (!existsSync(credentialsPath)) return null;
  return JSON.parse(readFileSync(credentialsPath, 'utf-8'));
}

export function writeUserCredentials(credentials, { env = process.env } = {}) {
  const credentialsPath = getUserCredentialsPath({ env });
  mkdirSync(dirname(credentialsPath), { recursive: true });
  writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
  chmodSync(credentialsPath, 0o600);
}

export function deleteUserCredentials({ env = process.env } = {}) {
  rmSync(getUserCredentialsPath({ env }), { force: true });
}
