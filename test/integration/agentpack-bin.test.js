import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const agentpackBin = join(repoRoot, 'packages', 'agentpack', 'bin', 'agentpack.js');

function uniqueTempRoot(name) {
  return join(
    tmpdir(),
    `agentpack-${name}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

describe('agentpack bin global-install guard', () => {
  it('works normally when run from the workspace', () => {
    const result = spawnSync(process.execPath, [agentpackBin, '--version'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('prints a clear install message when run from an isolated location', () => {
    const tempRoot = uniqueTempRoot('agentpack-bin-global');
    const isolatedBinDir = join(tempRoot, 'bin');
    mkdirSync(isolatedBinDir, { recursive: true });

    // Copy the bin file
    const isolatedBin = join(isolatedBinDir, 'agentpack.js');
    cpSync(agentpackBin, isolatedBin);

    // Stub src/cli.js so the dynamic import doesn't fail for a different reason
    const srcDir = join(tempRoot, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'cli.js'), 'export function run() {}');

    const cleanEnv = {
      ...process.env,
      // Clear all package-runner markers
      npm_execpath: '',
      _npx_is_active: '',
      npm_command: '',
      npm_config_user_agent: '',
      PNPM_HOME: '',
    };

    const result = spawnSync(process.execPath, [isolatedBin], {
      cwd: tempRoot,
      encoding: 'utf-8',
      env: cleanEnv,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /@alavida\/agentpack is not installed/i);
    assert.match(result.stderr, /npm add -D @alavida\/agentpack/i);
    assert.match(result.stderr, /npx @alavida\/agentpack@latest/i);
  });

  it('allows execution when pnpm dlx user-agent is present', () => {
    const tempRoot = uniqueTempRoot('agentpack-bin-pnpm');
    const isolatedBinDir = join(tempRoot, 'bin');
    mkdirSync(isolatedBinDir, { recursive: true });

    const isolatedBin = join(isolatedBinDir, 'agentpack.js');
    cpSync(agentpackBin, isolatedBin);

    const srcDir = join(tempRoot, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'cli.js'), 'export function run() {}');

    const result = spawnSync(process.execPath, [isolatedBin, '--help'], {
      cwd: tempRoot,
      encoding: 'utf-8',
      env: {
        ...process.env,
        npm_execpath: '',
        _npx_is_active: '',
        npm_command: '',
        npm_config_user_agent: 'pnpm/10.13.1 npm/? node/v24.13.0 darwin arm64',
        PNPM_HOME: '/tmp/fake-pnpm-home',
      },
    });

    assert.equal(result.status, 0);
  });
});
