import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLIJson, runNpm } from './fixtures.js';

describe('agentpack skills JSON outputs', () => {
  it('returns structured JSON for inspect', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-json-inspect');

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
status: deprecated
replacement: @alavida/value-research
---

\`\`\`agentpack
import provost from skill "@alavida/methodology-gary-provost"
source sellingPoints = "domains/value/knowledge/selling-points.md"
source toneOfVoice = "domains/value/knowledge/tone-of-voice.md"
\`\`\`

Use [Provost guidance](skill:provost){context="sentence rhythm and cadence guidance for final copy"}.
Ground this in [current selling points](source:sellingPoints){context="primary source material for value messaging"}.
Apply [tone of voice](source:toneOfVoice){context="tone constraints for the final copy"}.
`
      );

      const result = runCLIJson(
        ['author', 'inspect', '@alavida/value-copywriting'],
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
      const build = runCLIJson(['author', 'build', 'domains/value/skills/copywriting'], { cwd: repo.root });
      assert.equal(build.exitCode, 0, build.stderr);

      writeFileSync(
        join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'),
        '# Tone Of Voice\n\nBold, direct, and provocative.\n'
      );

      const result = runCLIJson(['author', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.count, 1);
      assert.equal(result.json.skills[0].packageName, '@alavida/value-copywriting');
      assert.equal(result.json.skills[0].changedSources.length, 1);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured JSON for installed package inventory', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-json-source');
    const consumer = createRepoFromFixture('consumer', 'skills-json-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runNpm(['install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const list = runCLIJson(['skills', 'list'], { cwd: consumer.root });

      assert.equal(list.exitCode, 0, list.stderr);
      assert.equal(list.json.packageCount, 1);
      assert.equal(list.json.packages[0].packageName, '@alavida/value-copywriting');
      assert.equal(list.json.packages[0].exports[0].enabled.length, 0);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
