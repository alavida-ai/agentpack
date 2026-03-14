import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getUserConfigPath,
  readUserConfig,
  writeUserConfig,
} from '../../packages/agentpack/src/infrastructure/fs/user-config-repository.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-config-home-'));
  cleanupPaths.push(home);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
  };
}

describe('user config repository', () => {
  it('resolves config path under xdg config home', () => {
    const env = createEnv();

    const configPath = getUserConfigPath({ env });

    assert.equal(configPath, join(env.XDG_CONFIG_HOME, 'agentpack', 'config.json'));
  });

  it('returns defaults when config is missing', () => {
    const env = createEnv();

    const config = readUserConfig({ env });

    assert.deepEqual(config, {
      version: 1,
      provider: 'github-packages',
      scope: '@alavida-ai',
      registry: 'https://npm.pkg.github.com',
      verificationPackage: '@alavida-ai/agentpack-auth-probe',
      managedNpmKeys: [],
    });
  });

  it('creates parent directories and persists config json', () => {
    const env = createEnv();
    const next = {
      version: 1,
      provider: 'github-packages',
      scope: '@acme',
      registry: 'https://npm.pkg.github.com',
      verificationPackage: '@acme/registry-probe',
      managedNpmKeys: ['@acme:registry'],
    };

    writeUserConfig(next, { env });

    assert.equal(existsSync(getUserConfigPath({ env })), true);
    assert.deepEqual(readUserConfig({ env }), next);
  });
});
