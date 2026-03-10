import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { addPackagedSkill, createRepoFromFixture, createTempRepo, runCLI, runCLIJsonAsync } from './fixtures.js';

function npmPack(cwd) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) {
    return import('node:child_process').then(({ execFileSync }) => {
      const tarballName = execFileSync(process.execPath, [npmCli, 'pack'], { cwd, encoding: 'utf-8' }).trim();
      return readFileSync(join(cwd, tarballName));
    });
  }

  const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return import('node:child_process').then(({ execFileSync }) => {
    const tarballName = execFileSync(npmBinary, ['pack'], { cwd, encoding: 'utf-8' }).trim();
    return readFileSync(join(cwd, tarballName));
  });
}

describe('agentpack skills install', () => {
  it('installs one packaged skill plus its dependency and materializes both', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-install-source');
    const consumer = createRepoFromFixture('consumer', 'skills-install-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const result = runCLI(['skills', 'install', target], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Installed Skills: 2/);
      assert.match(result.stdout, /@alavida\/value-copywriting/);
      assert.match(result.stdout, /@alavida\/methodology-gary-provost/);

      const copywritingClaude = join(consumer.root, '.claude', 'skills', 'value-copywriting');
      const copywritingAgents = join(consumer.root, '.agents', 'skills', 'value-copywriting');
      const provostClaude = join(consumer.root, '.claude', 'skills', 'gary-provost');

      assert.ok(existsSync(copywritingClaude));
      assert.ok(existsSync(copywritingAgents));
      assert.ok(existsSync(provostClaude));
      assert.ok(lstatSync(copywritingClaude).isSymbolicLink());
      assert.ok(lstatSync(copywritingAgents).isSymbolicLink());
      assert.ok(lstatSync(provostClaude).isSymbolicLink());

      const installState = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));
      assert.equal(installState.version, 1);
      assert.equal(installState.installs['@alavida/value-copywriting'].direct, true);
      assert.equal(installState.installs['@alavida/methodology-gary-provost'].direct, false);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });

  it('installs a published package name from a configured registry and materializes its dependency chain', async () => {
    const source = createTempRepo('skills-install-registry-source');
    const consumer = createRepoFromFixture('consumer', 'skills-install-registry-consumer');

    addPackagedSkill(source.root, 'packages/methodology-gary-provost', {
      skillMd: `---
name: methodology-gary-provost
description: Sentence rhythm guidance from Gary Provost.
metadata:
  sources: []
requires: []
---

# Gary Provost
`,
      packageJson: {
        name: '@alavida-ai/methodology-gary-provost',
        version: '1.0.0',
        files: ['SKILL.md'],
      },
    });

    addPackagedSkill(source.root, 'packages/value-proof-points', {
      skillMd: `---
name: value-proof-points
description: Evidence-backed proof points for value messaging.
metadata:
  sources: []
requires:
  - @alavida-ai/methodology-gary-provost
---

# Value Proof Points
`,
      packageJson: {
        name: '@alavida-ai/value-proof-points',
        version: '1.0.1',
        files: ['SKILL.md'],
        dependencies: {
          '@alavida-ai/methodology-gary-provost': '^1.0.0',
        },
      },
    });

    const metadataByPath = new Map([
      ['@alavida-ai/value-proof-points', {
        name: '@alavida-ai/value-proof-points',
        'dist-tags': { latest: '1.0.1' },
        versions: {
          '1.0.1': {
            name: '@alavida-ai/value-proof-points',
            version: '1.0.1',
            dist: { tarball: 'http://127.0.0.1:0/tarballs/value-proof-points-1.0.1.tgz' },
            dependencies: {
              '@alavida-ai/methodology-gary-provost': '^1.0.0',
            },
          },
        },
      }],
      ['@alavida-ai/methodology-gary-provost', {
        name: '@alavida-ai/methodology-gary-provost',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: '@alavida-ai/methodology-gary-provost',
            version: '1.0.0',
            dist: { tarball: 'http://127.0.0.1:0/tarballs/methodology-gary-provost-1.0.0.tgz' },
          },
        },
      }],
    ]);

    const tarballs = new Map();
    tarballs.set(
      '/tarballs/methodology-gary-provost-1.0.0.tgz',
      await npmPack(join(source.root, 'packages', 'methodology-gary-provost'))
    );
    tarballs.set(
      '/tarballs/value-proof-points-1.0.1.tgz',
      await npmPack(join(source.root, 'packages', 'value-proof-points'))
    );

    const server = createServer((req, res) => {
      const metadata = metadataByPath.get(decodeURIComponent((req.url || '').replace(/^\//, '')));
      if (metadata) {
        const port = server.address().port;
        const payload = JSON.parse(JSON.stringify(metadata).replaceAll('127.0.0.1:0', `127.0.0.1:${port}`));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      const tarball = tarballs.get(req.url);
      if (tarball) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(tarball);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    try {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      writeFileSync(
        join(consumer.root, '.npmrc'),
        `@alavida-ai:registry=http://127.0.0.1:${port}\n`
      );

      const result = await runCLIJsonAsync(['skills', 'install', '@alavida-ai/value-proof-points'], {
        cwd: consumer.root,
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.ok(result.json.installs['@alavida-ai/value-proof-points']);
      assert.ok(result.json.installs['@alavida-ai/methodology-gary-provost']);
      assert.equal(result.json.installs['@alavida-ai/value-proof-points'].direct, true);
      assert.equal(result.json.installs['@alavida-ai/methodology-gary-provost'].direct, false);

      assert.ok(existsSync(join(consumer.root, '.claude', 'skills', 'value-proof-points')));
      assert.ok(existsSync(join(consumer.root, '.agents', 'skills', 'value-proof-points')));
      assert.ok(existsSync(join(consumer.root, '.claude', 'skills', 'methodology-gary-provost')));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      source.cleanup();
      consumer.cleanup();
    }
  });
});
