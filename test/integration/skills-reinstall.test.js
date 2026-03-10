import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills reinstall and failure modes', () => {
  it('reinstall keeps runtime state stable for the same target', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-reinstall-source');
    const consumer = createRepoFromFixture('consumer', 'skills-reinstall-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');

      const first = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(first.exitCode, 0, first.stderr);
      const stateAfterFirst = readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8');

      const second = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(second.exitCode, 0, second.stderr);
      const stateAfterSecond = readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8');

      assert.equal(stateAfterSecond, stateAfterFirst);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('fails clearly when install is called with no target and no workbench context', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-install-no-target');

    try {
      const result = runCLI(['skills', 'install'], { cwd: consumer.root });

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, /no install target provided/i);
    } finally {
      consumer.cleanup();
    }
  });

  it('fails clearly when a workbench has no external dependency roots', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-install-empty-workbench');

    try {
      const workbenchDir = join(repo.root, 'workbenches', 'empty-workbench');
      mkdirSync(join(workbenchDir, 'skills', 'local-only'), { recursive: true });
      writeFileSync(join(workbenchDir, 'workbench.json'), JSON.stringify({ primitives: {} }, null, 2) + '\n');
      writeFileSync(
        join(workbenchDir, 'skills', 'local-only', 'SKILL.md'),
        `---
name: local-only
description: Local only skill.
---

# Local Only
`
      );

      const result = runCLI(
        ['--workbench', 'workbenches/empty-workbench', 'skills', 'install'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, /no external skill dependencies found/i);
    } finally {
      repo.cleanup();
    }
  });

  it('returns JSON errors for invalid install context', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-install-json-error');

    try {
      const result = runCLIJson(['skills', 'install'], { cwd: consumer.root });

      assert.equal(result.exitCode, 4);
      assert.equal(result.json.error, 'missing_install_target');
    } finally {
      consumer.cleanup();
    }
  });
});
