import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills dependencies', { concurrency: false }, () => {
  it('shows authored reverse dependencies for a local packaged skill', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-dependencies-authored');

    try {
      const result = runCLI(['skills', 'dependencies', '@alavida/methodology-gary-provost'], {
        cwd: monorepo.root,
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/methodology-gary-provost/);
      assert.match(result.stdout, /Graph: authored/);
      assert.match(result.stdout, /Status: current/);
      assert.match(result.stdout, /Direct Dependencies:/);
      assert.match(result.stdout, /- none/);
      assert.match(result.stdout, /Reverse Dependencies:/);
      assert.match(result.stdout, /@alavida\/value-copywriting \(current\)/);
      assert.match(result.stdout, /@alavida\/value-research \(current\)/);
    } finally {
      monorepo.cleanup();
    }
  });

  it('shows affected dependents when a dependency is stale in the authored graph', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-dependencies-affected-authored');

    try {
      const methodologySkill = join(
        monorepo.root,
        'domains',
        'value',
        'methodology',
        'gary-provost',
        'SKILL.md'
      );
      writeFileSync(
        methodologySkill,
        `---
name: gary-provost
description: Sentence rhythm guidance from Gary Provost.
sources:
  - domains/value/knowledge/prose-rhythm.md
---

# Gary Provost

Vary sentence length and cadence.
`
      );
      writeFileSync(join(monorepo.root, 'domains', 'value', 'knowledge', 'prose-rhythm.md'), '# Prose Rhythm\n');

      const buildStatePath = join(monorepo.root, '.agentpack', 'build-state.json');
      const buildState = JSON.parse(readFileSync(buildStatePath, 'utf-8'));
      buildState.skills['@alavida/methodology-gary-provost'].sources = {
        'domains/value/knowledge/prose-rhythm.md': {
          hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        },
      };
      writeFileSync(buildStatePath, `${JSON.stringify(buildState, null, 2)}\n`);

      const result = runCLI(['skills', 'dependencies', '@alavida/value-copywriting'], {
        cwd: monorepo.root,
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Status: affected/);
      assert.match(result.stdout, /@alavida\/methodology-gary-provost \(stale\)/);
    } finally {
      monorepo.cleanup();
    }
  });

  it('shows installed dependencies and reverse dependents in runtime graph', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-dependencies-runtime-source');
    const consumer = createRepoFromFixture('consumer', 'skills-dependencies-runtime-consumer');

    try {
      const copywriting = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const research = join(monorepo.root, 'domains', 'value', 'skills', 'research');

      assert.equal(runCLI(['skills', 'install', copywriting], { cwd: consumer.root }).exitCode, 0);
      assert.equal(runCLI(['skills', 'install', research], { cwd: consumer.root }).exitCode, 0);

      const result = runCLI(['skills', 'dependencies', '@alavida/methodology-gary-provost'], {
        cwd: consumer.root,
        env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/methodology-gary-provost/);
      assert.match(result.stdout, /Graph: installed/);
      assert.match(result.stdout, /Status: current/);
      assert.match(result.stdout, /Direct: false/);
      assert.match(result.stdout, /Reverse Dependencies:/);
      assert.match(result.stdout, /@alavida\/value-copywriting \(current\)/);
      assert.match(result.stdout, /@alavida\/value-research \(current\)/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('returns structured JSON for dependency visibility', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-dependencies-json-source');
    const consumer = createRepoFromFixture('consumer', 'skills-dependencies-json-consumer');

    try {
      const copywriting = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const research = join(monorepo.root, 'domains', 'value', 'skills', 'research');

      assert.equal(runCLI(['skills', 'install', copywriting], { cwd: consumer.root }).exitCode, 0);
      assert.equal(runCLI(['skills', 'install', research], { cwd: consumer.root }).exitCode, 0);

      const result = runCLIJson(['skills', 'dependencies', '@alavida/value-copywriting'], {
        cwd: consumer.root,
        env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.packageName, '@alavida/value-copywriting');
      assert.equal(result.json.graph, 'installed');
      assert.equal(result.json.direct, true);
      assert.equal(result.json.status, 'current');
      assert.equal(result.json.dependencies.length, 1);
      assert.equal(result.json.dependencies[0].packageName, '@alavida/methodology-gary-provost');
      assert.equal(result.json.dependencies[0].status, 'current');
      assert.equal(result.json.reverseDependencies.length, 0);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
