import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIAsync, runCLIJson, runCLIJsonAsync } from './fixtures.js';

describe('agentpack skills outdated', () => {
  it('shows no outdated skills when installed skills match local authored versions', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-outdated-source-none');
    const consumer = createRepoFromFixture('consumer', 'skills-outdated-consumer-none');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const outdated = runCLI(['skills', 'outdated'], { cwd: consumer.root });

      assert.equal(outdated.exitCode, 0, outdated.stderr);
      assert.match(outdated.stdout, /Outdated Skills: 0/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('shows outdated skills when a newer local authored package version exists', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-outdated-source-newer');
    const consumer = createRepoFromFixture('consumer', 'skills-outdated-consumer-newer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const pkgPath = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      pkg.version = '1.3.0';
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

      const outdated = runCLI(['skills', 'outdated'], {
        cwd: consumer.root,
        env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },
      });

      assert.equal(outdated.exitCode, 0, outdated.stderr);
      assert.match(outdated.stdout, /Outdated Skills: 1/);
      assert.match(outdated.stdout, /@alavida\/value-copywriting/);
      assert.match(outdated.stdout, /current: 1\.2\.0/);
      assert.match(outdated.stdout, /available: 1\.3\.0/);
      assert.match(outdated.stdout, /type: minor/);
      assert.match(outdated.stdout, /recommended: agentpack skills install @alavida\/value-copywriting/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('returns structured JSON for outdated visibility', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-outdated-json-source');
    const consumer = createRepoFromFixture('consumer', 'skills-outdated-json-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const pkgPath = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      pkg.version = '2.0.0';
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

      const outdated = runCLIJson(['skills', 'outdated'], {
        cwd: consumer.root,
        env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },
      });

      assert.equal(outdated.exitCode, 0, outdated.stderr);
      assert.equal(outdated.json.count, 1);
      assert.equal(outdated.json.skills[0].packageName, '@alavida/value-copywriting');
      assert.equal(outdated.json.skills[0].currentVersion, '1.2.0');
      assert.equal(outdated.json.skills[0].availableVersion, '2.0.0');
      assert.equal(outdated.json.skills[0].updateType, 'major');
      assert.equal(
        outdated.json.skills[0].recommendedCommand,
        'agentpack skills install @alavida/value-copywriting'
      );
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('uses configured registry metadata for outdated visibility when available', async () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-outdated-registry-source');
    const consumer = createRepoFromFixture('consumer', 'skills-outdated-registry-consumer');

    const server = createServer((req, res) => {
      if (req.url === '/%40alavida%2Fvalue-copywriting') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          name: '@alavida/value-copywriting',
          'dist-tags': {
            latest: '1.4.0',
          },
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
      );

      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const outdated = await runCLIJsonAsync(['skills', 'outdated'], { cwd: consumer.root });

      assert.equal(outdated.exitCode, 0, outdated.stderr);
      assert.equal(outdated.json.count, 1);
      assert.equal(outdated.json.skills[0].packageName, '@alavida/value-copywriting');
      assert.equal(outdated.json.skills[0].availableVersion, '1.4.0');
      assert.equal(outdated.json.skills[0].source, 'registry');
      assert.equal(outdated.json.skills[0].availablePackagePath, null);
      assert.equal(
        outdated.json.skills[0].recommendedCommand,
        'agentpack skills install @alavida/value-copywriting'
      );
    } finally {
      server.close();
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
