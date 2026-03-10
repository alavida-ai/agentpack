import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills multi-root runtime graph', { concurrency: false }, () => {
  it('preserves multiple direct roots across separate installs', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-multi-root-source');
    const consumer = createRepoFromFixture('consumer', 'skills-multi-root-consumer');

    try {
      const copywriting = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const research = join(monorepo.root, 'domains', 'value', 'skills', 'research');

      assert.equal(runCLI(['skills', 'install', copywriting], { cwd: consumer.root }).exitCode, 0);
      assert.equal(runCLI(['skills', 'install', research], { cwd: consumer.root }).exitCode, 0);

      const env = runCLIJson(['skills', 'env'], { cwd: consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      const installs = Object.fromEntries(env.json.installs.map((entry) => [entry.packageName, entry]));
      assert.equal(installs['@alavida/value-copywriting'].direct, true);
      assert.equal(installs['@alavida/value-research'].direct, true);
      assert.equal(installs['@alavida/methodology-gary-provost'].direct, false);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('preserves a shared dependency when one of two direct roots is removed', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-shared-dep-source');
    const consumer = createRepoFromFixture('consumer', 'skills-shared-dep-consumer');

    try {
      const copywriting = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const research = join(monorepo.root, 'domains', 'value', 'skills', 'research');

      assert.equal(runCLI(['skills', 'install', copywriting], { cwd: consumer.root }).exitCode, 0);
      assert.equal(runCLI(['skills', 'install', research], { cwd: consumer.root }).exitCode, 0);

      const uninstall = runCLI(['skills', 'uninstall', '@alavida/value-copywriting'], { cwd: consumer.root });
      assert.equal(uninstall.exitCode, 0, uninstall.stderr);

      const env = runCLIJson(['skills', 'env'], { cwd: consumer.root });
      assert.equal(env.exitCode, 0, env.stderr);

      const installs = Object.fromEntries(env.json.installs.map((entry) => [entry.packageName, entry]));
      assert.equal(Boolean(installs['@alavida/value-copywriting']), false);
      assert.equal(installs['@alavida/value-research'].direct, true);
      assert.equal(installs['@alavida/methodology-gary-provost'].direct, false);

      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'value-research')), true);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'gary-provost')), true);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
