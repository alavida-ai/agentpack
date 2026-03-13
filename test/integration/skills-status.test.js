import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInstalledMultiSkillFixture, createRepoFromFixture, runCLI, runCLIJson, runCLIJsonAsync } from './fixtures.js';

describe('agentpack skills status', () => {
  it('does not mark a healthy multi-skill install incomplete for exported self-references', () => {
    const fixture = createInstalledMultiSkillFixture('skills-status-multi-skill-complete');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const result = runCLIJson(['skills', 'status'], { cwd: fixture.consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.incompleteCount, 0);
    } finally {
      fixture.cleanup();
    }
  });

  it('shows a healthy empty environment when nothing is installed', async () => {
    const consumer = createRepoFromFixture('consumer', 'skills-status-empty');

    try {
      const result = runCLI(['skills', 'status'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Installed Skills: 0/);
      assert.match(result.stdout, /Outdated Skills: 0/);
      assert.match(result.stdout, /Registry Configured: false/);
      assert.match(result.stdout, /Health: needs-config/);
    } finally {
      consumer.cleanup();
    }
  });

  it('surfaces outdated skills and registry readiness together', async () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-status-source');
    const consumer = createRepoFromFixture('consumer', 'skills-status-consumer');

    const server = createServer((req, res) => {
      if (req.url === '/%40alavida%2Fvalue-copywriting') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          name: '@alavida/value-copywriting',
          'dist-tags': { latest: '1.4.0' },
        }));
        return;
      }

      if (req.url === '/%40alavida%2Fmethodology-gary-provost') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          name: '@alavida/methodology-gary-provost',
          'dist-tags': { latest: '1.0.0' },
        }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    try {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const registryUrl = `http://127.0.0.1:${address.port}`;

      writeFileSync(
        join(consumer.root, '.npmrc'),
        `@alavida:registry=${registryUrl}\n`
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
          + 'always-auth=true\n'
      );

      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const result = await runCLIJsonAsync(['skills', 'status'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.installedCount, 2);
      assert.equal(result.json.directCount, 1);
      assert.equal(result.json.outdatedCount, 1);
      assert.equal(result.json.registry.configured, true);
      assert.equal(result.json.health, 'attention-needed');
      assert.equal(result.json.outdated[0].packageName, '@alavida/value-copywriting');
    } finally {
      await new Promise((resolve) => server.close(resolve));
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('surfaces deprecated installed skills in status output', async () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-status-deprecated-source');
    const consumer = createRepoFromFixture('consumer', 'skills-status-deprecated-consumer');

    try {
      writeFileSync(
        join(monorepo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
    - domains/value/knowledge/tone-of-voice.md
  status: deprecated
  replacement: @alavida/value-research
  message: Use the research skill instead.
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`
      );

      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const result = runCLI(['skills', 'status'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Deprecated Skills: 1/);
      assert.match(result.stdout, /Health: attention-needed/);
      assert.match(result.stdout, /- @alavida\/value-copywriting/);
      assert.match(result.stdout, /status: deprecated/);
      assert.match(result.stdout, /replacement: @alavida\/value-research/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('degrades health when an installed skill has missing required dependencies', async () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-status-missing-source');
    const consumer = createRepoFromFixture('consumer', 'skills-status-missing-consumer');

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

      const result = runCLIJson(['skills', 'status'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.health, 'attention-needed');
      assert.equal(result.json.incompleteCount, 1);
      assert.equal(result.json.incomplete[0].packageName, '@alavida/value-copywriting');
      assert.equal(result.json.incomplete[0].missing[0].packageName, '@alavida/methodology-gary-provost');
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
