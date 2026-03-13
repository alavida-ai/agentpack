import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack auth commands', () => {
  it('shows auth in top-level help', () => {
    const consumer = createRepoFromFixture('consumer', 'auth-top-level-help');

    try {
      const result = runCLI(['--help'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /\bauth\b/);
      assert.match(result.stdout, /\bskills\b/);
    } finally {
      consumer.cleanup();
    }
  });

  it('shows login, status, and logout in auth help', () => {
    const consumer = createRepoFromFixture('consumer', 'auth-help');

    try {
      const result = runCLI(['auth', '--help'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /\blogin\b/);
      assert.match(result.stdout, /\bstatus\b/);
      assert.match(result.stdout, /\blogout\b/);
    } finally {
      consumer.cleanup();
    }
  });

  it('returns unauthenticated status before setup', () => {
    const consumer = createRepoFromFixture('consumer', 'auth-status-empty');

    try {
      const result = runCLIJson(['auth', 'status'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.configured, false);
      assert.equal(result.json.provider, 'github-packages');
      assert.equal(result.json.storage.mode, 'missing');
      assert.equal(result.json.verification.status, 'not_checked');
    } finally {
      consumer.cleanup();
    }
  });
});
