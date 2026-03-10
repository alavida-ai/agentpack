import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI } from './fixtures.js';

describe('agentpack skills env', () => {
  it('shows visible installed skills after install', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-env-source');
    const consumer = createRepoFromFixture('consumer', 'skills-env-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const env = runCLI(['skills', 'env'], { cwd: consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      assert.match(env.stdout, /Installed Skills: 2/);
      assert.match(env.stdout, /@alavida\/value-copywriting/);
      assert.match(env.stdout, /direct: true/);
      assert.match(env.stdout, /@alavida\/methodology-gary-provost/);
      assert.match(env.stdout, /direct: false/);
      assert.match(env.stdout, /\.claude\/skills\/value-copywriting/);
      assert.match(env.stdout, /\.agents\/skills\/value-copywriting/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
