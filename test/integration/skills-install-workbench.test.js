import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI } from './fixtures.js';

describe('agentpack skills install from workbench roots', () => {
  it('infers dependency roots from local workbench skills requires', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-install-workbench');

    try {
      const result = runCLI(
        ['--workbench', 'workbenches/website-dev', 'skills', 'install'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /@alavida\/value-copywriting/);
      assert.match(result.stdout, /@alavida\/methodology-gary-provost/);

      assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')));
      assert.ok(existsSync(join(repo.root, '.agents', 'skills', 'gary-provost')));
    } finally {
      repo.cleanup();
    }
  });

  it('unions roots from multiple local skills and deduplicates shared roots', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-install-workbench-multi');

    try {
      const result = runCLI(
        ['--workbench', 'workbenches/website-dev', 'skills', 'install'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Installed Skills: 3/);
      assert.match(result.stdout, /@alavida\/value-copywriting/);
      assert.match(result.stdout, /@alavida\/value-research/);
      assert.match(result.stdout, /@alavida\/methodology-gary-provost/);

      assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')));
      assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-research')));
      assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'gary-provost')));
    } finally {
      repo.cleanup();
    }
  });
});
