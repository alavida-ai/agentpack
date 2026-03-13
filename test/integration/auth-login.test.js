import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTempRepo } from './fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', '..', 'bin', 'agentpack.js');
const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createHomeEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-auth-login-home-'));
  cleanupPaths.push(home);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
    AGENTPACK_BROWSER_CAPTURE_PATH: join(home, 'browser-url.txt'),
  };
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

function runLogin(args, {
  cwd,
  env,
  input,
} = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

describe('agentpack auth login', () => {
  it('opens the browser hint, prompts for a token, and writes config on success', async () => {
    const repo = createTempRepo('auth-login-success');
    const env = createHomeEnv();

    try {
      await withRegistryServer((req, res) => {
        if (req.headers.authorization !== 'Bearer secret-token') {
          res.writeHead(401);
          res.end('unauthorized');
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ 'dist-tags': { latest: '1.0.0' } }));
      }, async (registryUrl) => {
        const result = await runLogin(
          ['auth', 'login', '--scope', '@alavida', '--registry', registryUrl, '--verify-package', '@alavida/registry-probe'],
          {
            cwd: repo.root,
            env,
            input: 'secret-token\n',
          }
        );

        assert.equal(result.exitCode, 0, result.stderr);
        assert.match(result.stdout, /Token:/);
        assert.match(result.stdout, /Configured auth for @alavida/);
        assert.match(readFileSync(env.AGENTPACK_BROWSER_CAPTURE_PATH, 'utf-8'), /github\.com/);

        const config = JSON.parse(readFileSync(join(env.XDG_CONFIG_HOME, 'agentpack', 'config.json'), 'utf-8'));
        assert.equal(config.scope, '@alavida');
        assert.equal(config.registry, registryUrl);
        assert.equal(config.verificationPackage, '@alavida/registry-probe');

        const credentials = JSON.parse(readFileSync(join(env.XDG_CONFIG_HOME, 'agentpack', 'credentials.json'), 'utf-8'));
        assert.equal(credentials.token, 'secret-token');

        const npmrc = readFileSync(join(env.HOME, '.npmrc'), 'utf-8');
        assert.match(npmrc, /@alavida:registry=/);
        assert.match(npmrc, /:_authToken=secret-token/);
      });
    } finally {
      repo.cleanup();
    }
  });

  it('fails cleanly when the token is rejected', async () => {
    const repo = createTempRepo('auth-login-invalid');
    const env = createHomeEnv();

    try {
      await withRegistryServer((req, res) => {
        res.writeHead(401);
        res.end('unauthorized');
      }, async (registryUrl) => {
        const result = await runLogin(
          ['auth', 'login', '--scope', '@alavida', '--registry', registryUrl, '--verify-package', '@alavida/registry-probe'],
          {
            cwd: repo.root,
            env,
            input: 'bad-token\n',
          }
        );

        assert.equal(result.exitCode, 1, result.stdout);
        assert.match(result.stderr, /credential/i);
      });
    } finally {
      repo.cleanup();
    }
  });
});
