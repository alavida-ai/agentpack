import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRepoFromFixture, runCLI } from './fixtures.js';

describe('agentpack command surface', () => {
  it('shows author, publish, and skills in top-level help and hides auth', () => {
    const consumer = createRepoFromFixture('consumer', 'command-surface-top-level-help');

    try {
      const result = runCLI(['--help'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /\bauthor\b/);
      assert.match(result.stdout, /\bpublish\b/);
      assert.match(result.stdout, /\bskills\b/);
      assert.doesNotMatch(result.stdout, /\bauth\b/);
    } finally {
      consumer.cleanup();
    }
  });

  it('shows list, enable, disable, and status in skills help and drops install/auth commands', () => {
    const consumer = createRepoFromFixture('consumer', 'command-surface-skills-help');

    try {
      const result = runCLI(['skills', '--help'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /\blist\b/);
      assert.match(result.stdout, /\benable\b/);
      assert.match(result.stdout, /\bdisable\b/);
      assert.match(result.stdout, /\bstatus\b/);
      assert.doesNotMatch(result.stdout, /\binstall\b/);
      assert.doesNotMatch(result.stdout, /\buninstall\b/);
      assert.doesNotMatch(result.stdout, /\bregistry\b/);
      assert.doesNotMatch(result.stdout, /\benv\b/);
      assert.doesNotMatch(result.stdout, /\bmissing\b/);
    } finally {
      consumer.cleanup();
    }
  });

  it('rejects source-authoring commands under `skills` after the split', () => {
    const consumer = createRepoFromFixture('consumer', 'command-surface-no-skills-authoring');

    try {
      const result = runCLI(['skills', 'dev', 'anything'], { cwd: consumer.root });

      assert.notEqual(result.exitCode, 0);
      assert.match(result.stderr, /unknown command|command.*dev/i);
    } finally {
      consumer.cleanup();
    }
  });
});
