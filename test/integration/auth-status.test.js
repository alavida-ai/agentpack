import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempRepo, runCLIJsonAsync } from './fixtures.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createHomeEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-auth-home-'));
  cleanupPaths.push(home);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
  };
}

function writeAuthFiles(env, {
  config,
  credentials,
  npmrc,
} = {}) {
  const configDir = join(env.XDG_CONFIG_HOME, 'agentpack');
  mkdirSync(configDir, { recursive: true });

  if (config) {
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  }
  if (credentials) {
    writeFileSync(join(configDir, 'credentials.json'), JSON.stringify(credentials, null, 2) + '\n');
  }
  if (npmrc) {
    writeFileSync(join(env.HOME, '.npmrc'), npmrc);
  }
}

async function withRegistryServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('agentpack auth status', () => {
  it('reports unauthenticated status when nothing is configured', async () => {
    const repo = createTempRepo('auth-status-missing');
    const env = createHomeEnv();

    try {
      const result = await runCLIJsonAsync(['auth', 'status'], { cwd: repo.root, env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.configured, false);
      assert.equal(result.json.storage.mode, 'missing');
      assert.equal(result.json.verification.status, 'not_checked');
    } finally {
      repo.cleanup();
    }
  });

  it('reports configured status from file-backed credentials and npm wiring', async () => {
    const repo = createTempRepo('auth-status-configured');
    const env = createHomeEnv();

    try {
      writeAuthFiles(env, {
        config: {
          version: 1,
          provider: 'github-packages',
          scope: '@alavida',
          registry: 'https://npm.pkg.github.com',
          verificationPackage: '@alavida/registry-probe',
          managedNpmKeys: ['@alavida:registry', '//npm.pkg.github.com/:_authToken'],
        },
        credentials: { token: 'secret-token' },
        npmrc: '@alavida:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=secret-token\n',
      });

      const result = await runCLIJsonAsync(['auth', 'status'], { cwd: repo.root, env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.configured, true);
      assert.equal(result.json.storage.mode, 'file');
      assert.equal(result.json.scope, '@alavida');
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.npmConfig.wired, true);
    } finally {
      repo.cleanup();
    }
  });

  it('returns valid when verify succeeds against the probe package', async () => {
    const repo = createTempRepo('auth-status-valid');
    const env = createHomeEnv();

    try {
      await withRegistryServer((req, res) => {
        if (req.headers.authorization !== 'Bearer secret-token') {
          res.writeHead(401);
          res.end('unauthorized');
          return;
        }

        if (req.url === '/%40alavida%2Fregistry-probe') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ 'dist-tags': { latest: '1.0.0' } }));
          return;
        }

        res.writeHead(404);
        res.end('not found');
      }, async (registryUrl) => {
        writeAuthFiles(env, {
          config: {
            version: 1,
            provider: 'github-packages',
            scope: '@alavida',
            registry: registryUrl,
            verificationPackage: '@alavida/registry-probe',
            managedNpmKeys: ['@alavida:registry', '//127.0.0.1:_authToken'],
          },
          credentials: { token: 'secret-token' },
          npmrc: `@alavida:registry=${registryUrl}\n//127.0.0.1:${new URL(registryUrl).port}/:_authToken=secret-token\n`,
        });

        const result = await runCLIJsonAsync(['auth', 'status', '--verify'], { cwd: repo.root, env });
        assert.equal(result.exitCode, 0, result.stderr);
        assert.equal(result.json.verification.status, 'valid');
      });
    } finally {
      repo.cleanup();
    }
  });

  it('returns invalid when the saved token is rejected', async () => {
    const repo = createTempRepo('auth-status-invalid');
    const env = createHomeEnv();

    try {
      await withRegistryServer((req, res) => {
        res.writeHead(401);
        res.end('unauthorized');
      }, async (registryUrl) => {
        writeAuthFiles(env, {
          config: {
            version: 1,
            provider: 'github-packages',
            scope: '@alavida',
            registry: registryUrl,
            verificationPackage: '@alavida/registry-probe',
            managedNpmKeys: ['@alavida:registry', '//127.0.0.1:_authToken'],
          },
          credentials: { token: 'bad-token' },
          npmrc: `@alavida:registry=${registryUrl}\n//127.0.0.1:${new URL(registryUrl).port}/:_authToken=bad-token\n`,
        });

        const result = await runCLIJsonAsync(['auth', 'status', '--verify'], { cwd: repo.root, env });
        assert.equal(result.exitCode, 0, result.stderr);
        assert.equal(result.json.verification.status, 'invalid');
      });
    } finally {
      repo.cleanup();
    }
  });

  it('returns unreachable when the registry cannot be contacted', async () => {
    const repo = createTempRepo('auth-status-unreachable');
    const env = createHomeEnv();

    try {
      writeAuthFiles(env, {
        config: {
          version: 1,
          provider: 'github-packages',
          scope: '@alavida',
          registry: 'http://127.0.0.1:9',
          verificationPackage: '@alavida/registry-probe',
          managedNpmKeys: ['@alavida:registry', '//127.0.0.1:9/:_authToken'],
        },
        credentials: { token: 'secret-token' },
        npmrc: '@alavida:registry=http://127.0.0.1:9\n//127.0.0.1:9/:_authToken=secret-token\n',
      });

      const result = await runCLIJsonAsync(['auth', 'status', '--verify'], { cwd: repo.root, env });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.verification.status, 'unreachable');
    } finally {
      repo.cleanup();
    }
  });
});
