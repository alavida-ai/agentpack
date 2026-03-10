import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI } from './fixtures.js';

describe('agentpack skills stale', () => {
  it('reports no stale skills when sources match recorded build-state', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-stale-current');

    try {
      const result = runCLI(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Stale Skills: 0/);
    } finally {
      repo.cleanup();
    }
  });

  it('reports stale skills in list mode after a source file changes', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-stale-list');

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'),
        '# Tone Of Voice\n\nBold, direct, and provocative.\n'
      );

      const result = runCLI(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Stale Skills: 1/);
      assert.match(result.stdout, /@alavida\/value-copywriting/);
      assert.match(result.stdout, /changed_sources: 1/);
    } finally {
      repo.cleanup();
    }
  });

  it('shows hash details in detail mode', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-stale-detail');

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'),
        '# Tone Of Voice\n\nBold, direct, and provocative.\n'
      );

      const result = runCLI(['skills', 'stale', '@alavida/value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/value-copywriting/);
      assert.match(result.stdout, /domains\/value\/knowledge\/tone-of-voice\.md/);
      assert.match(result.stdout, /Recorded: sha256:/);
      assert.match(result.stdout, /Current: sha256:/);
    } finally {
      repo.cleanup();
    }
  });
});
