import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempRepo, runCLIJson } from './fixtures.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createHomeEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-auth-logout-home-'));
  cleanupPaths.push(home);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
  };
}

function writeAuthFiles(env) {
  const configDir = join(env.XDG_CONFIG_HOME, 'agentpack');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({
      version: 1,
      provider: 'github-packages',
      scope: '@alavida',
      registry: 'https://npm.pkg.github.com',
      verificationPackage: '@alavida/registry-probe',
      managedNpmKeys: ['@alavida:registry', '//npm.pkg.github.com/:_authToken'],
    }, null, 2) + '\n'
  );
  writeFileSync(
    join(configDir, 'credentials.json'),
    JSON.stringify({ token: 'secret-token' }, null, 2) + '\n'
  );
  writeFileSync(
    join(env.HOME, '.npmrc'),
    '# keep this\n'
      + 'registry=https://registry.npmjs.org/\n'
      + '@other:registry=https://example.com\n'
      + '@alavida:registry=https://npm.pkg.github.com\n'
      + '//npm.pkg.github.com/:_authToken=secret-token\n'
  );
}

describe('agentpack auth logout', () => {
  it('removes file-backed credentials and only managed npm keys', () => {
    const repo = createTempRepo('auth-logout');
    const env = createHomeEnv();

    try {
      writeAuthFiles(env);

      const result = runCLIJson(['auth', 'logout'], { cwd: repo.root, env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.removedCredentials, true);
      assert.equal(result.json.removedNpmKeys, 2);

      const npmrc = readFileSync(join(env.HOME, '.npmrc'), 'utf-8');
      assert.match(npmrc, /# keep this/);
      assert.match(npmrc, /registry=https:\/\/registry\.npmjs\.org\//);
      assert.match(npmrc, /@other:registry=https:\/\/example\.com/);
      assert.doesNotMatch(npmrc, /@alavida:registry=/);
      assert.doesNotMatch(npmrc, /npm\.pkg\.github\.com\/:_authToken/);
    } finally {
      repo.cleanup();
    }
  });
});
