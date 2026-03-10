import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLIJson } from './fixtures.js';

describe('agentpack skills JSON outputs', () => {
  it('returns structured JSON for inspect', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-json-inspect');

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
    - domains/value/knowledge/tone-of-voice.md
  status: deprecated
  replacement: @alavida/value-research
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`
      );

      const result = runCLIJson(
        ['skills', 'inspect', '@alavida/value-copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.packageName, '@alavida/value-copywriting');
      assert.equal(result.json.packageVersion, '1.2.0');
      assert.equal(result.json.status, 'deprecated');
      assert.equal(result.json.replacement, '@alavida/value-research');
      assert.deepEqual(result.json.requires, ['@alavida/methodology-gary-provost']);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured JSON for stale list mode', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-json-stale');

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'),
        '# Tone Of Voice\n\nBold, direct, and provocative.\n'
      );

      const result = runCLIJson(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.count, 1);
      assert.equal(result.json.skills[0].packageName, '@alavida/value-copywriting');
      assert.equal(result.json.skills[0].changedSources.length, 1);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured JSON for env after install', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-json-source');
    const consumer = createRepoFromFixture('consumer', 'skills-json-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLIJson(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const env = runCLIJson(['skills', 'env'], { cwd: consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      assert.equal(env.json.installs.length, 2);
      assert.equal(env.json.installs[0].packageName, '@alavida/methodology-gary-provost');
      assert.equal(env.json.installs[1].packageName, '@alavida/value-copywriting');
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
