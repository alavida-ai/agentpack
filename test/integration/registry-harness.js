import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

function uniqueTempRoot(name) {
  return join(
    tmpdir(),
    `agentpack-${name}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function waitForReady(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const onStdout = (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/https?:\/\/127\.0\.0\.1:(\d+)/i)
        || stdout.match(/https?:\/\/localhost:(\d+)/i)
        || stdout.match(/127\.0\.0\.1:(\d+)/i)
        || stdout.match(/localhost:(\d+)/i);
      if (match) {
        cleanup();
        resolve({ stdout, stderr, port: Number(match[1]) });
      }
    };

    const onStderr = (chunk) => {
      stderr += String(chunk);
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`registry exited before ready (code ${code})\n${stdout}\n${stderr}`));
    };

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error(`timed out waiting for registry readiness\n${stdout}\n${stderr}`));
      }
    }, 50);

    function cleanup() {
      clearInterval(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

function allocatePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        if (!port) {
          reject(new Error('failed to allocate a free registry port'));
          return;
        }
        resolve(port);
      });
    });
  });
}

function findVerdaccioBin(repoRoot) {
  const localBin = process.platform === 'win32'
    ? join(repoRoot, 'node_modules', '.bin', 'verdaccio.cmd')
    : join(repoRoot, 'node_modules', '.bin', 'verdaccio');

  return localBin;
}

function writeVerdaccioConfig(configPath, storagePath) {
  const config = [
    `storage: ${storagePath}`,
    'auth:',
    '  htpasswd:',
    `    file: ${join(storagePath, 'htpasswd')}`,
    '    max_users: 1000',
    'packages:',
    "  '@*/*':",
    '    access: $all',
    '    publish: $authenticated',
    '    unpublish: $all',
    '  \'**\':',
    '    access: $all',
    '    publish: $authenticated',
    '    unpublish: $all',
    'server:',
    '  keepAliveTimeout: 60',
    'log:',
    '  - { type: stdout, format: pretty, level: http }',
  ].join('\n');

  writeFileSync(configPath, `${config}\n`);
}

export async function startRegistry({ repoRoot, port = 4873 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agentpack-test-registry-'));
  const storageDir = join(root, 'storage');
  const configPath = join(root, 'config.yaml');
  const verdaccioBin = findVerdaccioBin(repoRoot);
  const requestedPort = port === 0 ? await allocatePort() : port;
  const stdoutLogPath = join(root, 'verdaccio.stdout.log');
  const stderrLogPath = join(root, 'verdaccio.stderr.log');

  mkdirSync(storageDir, { recursive: true });
  writeVerdaccioConfig(configPath, storageDir);

  const child = spawn(verdaccioBin, ['--config', configPath, '--listen', `127.0.0.1:${requestedPort}`], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    writeFileSync(stdoutLogPath, String(chunk), { flag: 'a' });
  });
  child.stderr.on('data', (chunk) => {
    writeFileSync(stderrLogPath, String(chunk), { flag: 'a' });
  });

  const ready = await waitForReady(child);
  const actualPort = ready.port || requestedPort;

  return {
    root,
    url: `http://127.0.0.1:${actualPort}`,
    stdoutLogPath,
    stderrLogPath,
    async stop() {
      if (!child.killed) {
        await new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill('SIGTERM');
        });
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runNpmCommand(args, {
  cwd,
  env,
  input = null,
} = {}) {
  const npmCli = process.env.npm_execpath;

  if (npmCli) {
    return spawnSync(process.execPath, [npmCli, ...args], {
      cwd,
      env,
      input,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }

  const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npmBinary, args, {
    cwd,
    env,
    input,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

export async function loginToRegistry(registryUrl, {
  scope = null,
  username = 'agentpack-test',
  password = 'agentpack-test-password',
  email = 'agentpack-test@example.com',
  workdir = process.cwd(),
} = {}) {
  const userConfigPath = join(workdir, `.npmrc.agentpack-auth-${Date.now()}-${process.pid}`);
  const authUrl = `${registryUrl.replace(/\/+$/, '')}/-/user/org.couchdb.user:${encodeURIComponent(username)}`;
  const response = await fetch(authUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      _id: `org.couchdb.user:${username}`,
      name: username,
      password,
      email,
      type: 'user',
      roles: [],
      date: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    rmSync(userConfigPath, { force: true });
    throw new Error(`registry user bootstrap failed for ${registryUrl}\nHTTP ${response.status}\n${await response.text()}`);
  }

  const payload = await response.json();
  const token = payload?.token;
  if (!token) {
    rmSync(userConfigPath, { force: true });
    throw new Error(`registry user bootstrap did not return a token for ${registryUrl}`);
  }

  const authHost = new URL(registryUrl).host;
  const userConfig = [
    `registry=${registryUrl}`,
    scope ? `${scope}:registry=${registryUrl}` : null,
    `//${authHost}/:_authToken=${token}`,
  ].filter(Boolean).join('\n');

  writeFileSync(userConfigPath, `${userConfig}\n`);

  return {
    userConfigPath,
    cleanup() {
      rmSync(userConfigPath, { force: true });
    },
  };
}

export function publishPackageToRegistry(packageDir, registryUrl, { userConfigPath = null } = {}) {
  const packageJsonPath = join(packageDir, 'package.json');
  const packageName = JSON.parse(readFileSync(packageJsonPath, 'utf-8')).name || '';
  const scope = packageName.startsWith('@') ? packageName.split('/')[0] : null;
  const ownedUserConfigPath = userConfigPath || join(packageDir, '.npmrc.agentpack-publish');
  let result;

  try {
    if (!userConfigPath) {
      const userConfig = [
        `registry=${registryUrl}`,
        scope ? `${scope}:registry=${registryUrl}` : null,
      ].filter(Boolean).join('\n');

      writeFileSync(ownedUserConfigPath, `${userConfig}\n`);
    }

    const publishEnv = {
      ...process.env,
      npm_config_registry: registryUrl,
      npm_config_userconfig: ownedUserConfigPath,
    };

    result = runNpmCommand(['publish', '--registry', registryUrl], {
      cwd: packageDir,
      env: publishEnv,
    });

    if ((result.status ?? 1) !== 0) {
      throw new Error(`npm publish failed for ${packageDir}\n${result.stdout || ''}\n${result.stderr || ''}`);
    }
  } finally {
    if (!userConfigPath) {
      rmSync(ownedUserConfigPath, { force: true });
    }
  }
}

export function writeScopedRegistryNpmrc(repoRoot, scope, registryUrl) {
  const registry = registryUrl.replace(/\/+$/, '');
  writeFileSync(join(repoRoot, '.npmrc'), `${scope}:registry=${registry}\n`);
}

export function readInstallState(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, '.agentpack', 'install.json'), 'utf-8'));
}
