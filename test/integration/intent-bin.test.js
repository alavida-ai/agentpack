import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const wrappedIntentBin = join(repoRoot, 'bin', 'intent.js');
const upstreamIntentCli = join(repoRoot, 'node_modules', '@tanstack', 'intent', 'dist', 'cli.mjs');

function uniqueTempRoot(name) {
  return join(
    tmpdir(),
    `agentpack-${name}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

describe('bundled intent bin', () => {
  it('forwards arguments to the upstream intent cli', () => {
    const wrapped = spawnSync(process.execPath, [wrappedIntentBin, '--help'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    const upstream = spawnSync(process.execPath, [upstreamIntentCli, '--help'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });

    assert.equal(wrapped.status, upstream.status);
    assert.equal(wrapped.stderr, upstream.stderr);
    assert.equal(wrapped.stdout, upstream.stdout);
    assert.notEqual(wrapped.stdout.trim(), '');
  });

  it('prints a clear install message when @tanstack/intent is unavailable', () => {
    const tempRoot = uniqueTempRoot('intent-bin-missing');
    mkdirSync(tempRoot, { recursive: true });
    const isolatedBin = join(tempRoot, 'bin', 'intent.js');
    mkdirSync(dirname(isolatedBin), { recursive: true });
    cpSync(wrappedIntentBin, isolatedBin);

    const result = spawnSync(process.execPath, [isolatedBin, '--help'], {
      cwd: tempRoot,
      encoding: 'utf-8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /@tanstack\/intent is not installed/i);
    assert.match(result.stderr, /npm add -D @tanstack\/intent/i);
  });
});
