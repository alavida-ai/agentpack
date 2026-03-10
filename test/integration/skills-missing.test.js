import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills missing', () => {
  it('shows no missing dependencies when the installed environment is complete', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-missing-complete-source');
    const consumer = createRepoFromFixture('consumer', 'skills-missing-complete-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const result = runCLI(['skills', 'missing'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skills With Missing Dependencies: 0/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('shows missing required skills for an incomplete installed environment', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-missing-incomplete-source');
    const consumer = createRepoFromFixture('consumer', 'skills-missing-incomplete-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const statePath = join(consumer.root, '.agentpack', 'install.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      delete state.installs['@alavida/methodology-gary-provost'];
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
      rmSync(join(consumer.root, 'node_modules', '@alavida', 'methodology-gary-provost'), {
        recursive: true,
        force: true,
      });

      const result = runCLI(['skills', 'missing'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skills With Missing Dependencies: 1/);
      assert.match(result.stdout, /@alavida\/value-copywriting/);
      assert.match(result.stdout, /- @alavida\/methodology-gary-provost/);
      assert.match(result.stdout, /recommended: agentpack skills install @alavida\/methodology-gary-provost/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('returns structured JSON for missing dependency visibility', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-missing-json-source');
    const consumer = createRepoFromFixture('consumer', 'skills-missing-json-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const statePath = join(consumer.root, '.agentpack', 'install.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      delete state.installs['@alavida/methodology-gary-provost'];
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

      const result = runCLIJson(['skills', 'missing', '@alavida/value-copywriting'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.count, 1);
      assert.equal(result.json.skills[0].packageName, '@alavida/value-copywriting');
      assert.equal(result.json.skills[0].missing[0].packageName, '@alavida/methodology-gary-provost');
      assert.equal(
        result.json.skills[0].missing[0].recommendedCommand,
        'agentpack skills install @alavida/methodology-gary-provost'
      );
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('shows missing packaged requirements for a local workbench skill before install', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-missing-local-workbench');

    try {
      writeFileSync(join(consumer.root, 'workbench.json'), '{\"primitives\":{}}\n');
      mkdirSync(join(consumer.root, 'skills', 'proof-points'), { recursive: true });
      writeFileSync(
        join(consumer.root, 'skills', 'proof-points', 'SKILL.md'),
        `---
name: proof-points
description: Use when the user needs proof points.
requires:
  - @alavida-ai/value-proof-points
---

# Proof Points
`
      );

      const result = runCLI(['skills', 'missing'], { cwd: join(consumer.root, 'skills', 'proof-points') });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skills With Missing Dependencies: 1/);
      assert.match(result.stdout, /skills\/proof-points\/SKILL\.md/);
      assert.match(result.stdout, /@alavida-ai\/value-proof-points/);
      assert.match(result.stdout, /recommended: agentpack skills install @alavida-ai\/value-proof-points/);
    } finally {
      consumer.cleanup();
    }
  });

  it('returns structured JSON for a local workbench skill with missing packaged requirements', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-missing-local-workbench-json');

    try {
      writeFileSync(join(consumer.root, 'workbench.json'), '{\"primitives\":{}}\n');
      mkdirSync(join(consumer.root, 'skills', 'proof-points'), { recursive: true });
      writeFileSync(
        join(consumer.root, 'skills', 'proof-points', 'SKILL.md'),
        `---
name: proof-points
description: Use when the user needs proof points.
requires:
  - @alavida-ai/value-proof-points
---

# Proof Points
`
      );

      const result = runCLIJson(['skills', 'missing'], { cwd: join(consumer.root, 'skills', 'proof-points') });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.count, 1);
      assert.equal(result.json.skills[0].packageName, null);
      assert.equal(result.json.skills[0].name, 'proof-points');
      assert.equal(result.json.skills[0].skillFile, 'skills/proof-points/SKILL.md');
      assert.equal(result.json.skills[0].missing[0].packageName, '@alavida-ai/value-proof-points');
      assert.equal(
        result.json.skills[0].missing[0].recommendedCommand,
        'agentpack skills install @alavida-ai/value-proof-points'
      );
    } finally {
      consumer.cleanup();
    }
  });
});
