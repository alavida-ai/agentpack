import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const scriptPath = join(process.cwd(), 'scripts', 'run-agent-evals.mjs');

describe('run-agent-evals', () => {
  it('lists available scenarios', () => {
    const output = execFileSync('node', [scriptPath, '--list'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    assert.match(output, /synthetic\/new-skill/);
    assert.match(output, /agonda\/validate/);
  });

  it('supports dry-run for a single scenario', () => {
    const output = execFileSync('node', [scriptPath, '--scenario', 'synthetic/new-skill', '--dry-run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.mode, 'dry-run');
    assert.equal(parsed.scenario.id, 'synthetic/new-skill');
    assert.equal(parsed.willUseSandbox, true);
  });
});
