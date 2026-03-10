import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI } from './fixtures.js';

describe('agentpack skills uninstall', () => {
  it('removes the direct skill, orphaned dependency, materialized links, and runtime state', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-uninstall-source');
    const consumer = createRepoFromFixture('consumer', 'skills-uninstall-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const uninstall = runCLI(['skills', 'uninstall', '@alavida/value-copywriting'], { cwd: consumer.root });

      assert.equal(uninstall.exitCode, 0, uninstall.stderr);
      assert.match(uninstall.stdout, /Removed Skills: 2/);
      assert.match(uninstall.stdout, /@alavida\/value-copywriting/);
      assert.match(uninstall.stdout, /@alavida\/methodology-gary-provost/);

      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'gary-provost')), false);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'gary-provost')), false);

      const state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));
      assert.deepEqual(state, { version: 1, installs: {} });
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
