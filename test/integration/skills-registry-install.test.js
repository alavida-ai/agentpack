import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, createScenario, runCLIJson } from './fixtures.js';
import {
  loginToRegistry,
  publishPackageToRegistry,
  readInstallState,
  startRegistry,
  writeScopedRegistryNpmrc,
} from './registry-harness.js';

function buildCompilerSkill({ name, description, declarations = '', body = '# Skill\n' }) {
  return `---
name: ${name}
description: ${description}
---

\`\`\`agentpack
${declarations}
\`\`\`

${body}`;
}

describe('agentpack skills registry install harness', () => {
  it('publishes packages to a local registry and installs them through the real CLI flow', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const dependencyPackageName = `@alavida-ai/methodology-gary-provost-test-${suffix}`;
    const rootPackageName = `@alavida-ai/value-proof-points-test-${suffix}`;
    const source = createScenario({
      name: 'skills-registry-harness-source',
      packages: [
        {
          relPath: 'packages/methodology-gary-provost',
          packageJson: {
            name: dependencyPackageName,
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: buildCompilerSkill({
            name: 'methodology-gary-provost',
            description: 'Sentence rhythm guidance from Gary Provost.',
            body: '# Gary Provost\n',
          }),
        },
        {
          relPath: 'packages/value-proof-points',
          packageJson: {
            name: rootPackageName,
            version: '1.0.1',
            files: ['SKILL.md'],
            dependencies: {
              [dependencyPackageName]: '^1.0.0',
            },
          },
          skillMd: buildCompilerSkill({
            name: 'value-proof-points',
            description: 'Evidence-backed proof points for value messaging.',
            declarations: `import provost from skill "${dependencyPackageName}"`,
            body: '# Value Proof Points\n',
          }),
        },
      ],
    });
    const consumer = createRepoFromFixture('consumer', 'skills-registry-harness-consumer');
    const registry = await startRegistry({
      repoRoot: process.cwd(),
      port: 0,
    });
    let registryAuth = null;

    try {
      assert.match(registry.url, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.notEqual(new URL(registry.url).port, '0');
      registryAuth = await loginToRegistry(registry.url, {
        scope: '@alavida-ai',
        workdir: source.root,
      });

      publishPackageToRegistry(join(source.root, 'packages', 'methodology-gary-provost'), registry.url, {
        userConfigPath: registryAuth.userConfigPath,
      });
      publishPackageToRegistry(join(source.root, 'packages', 'value-proof-points'), registry.url, {
        userConfigPath: registryAuth.userConfigPath,
      });
      writeScopedRegistryNpmrc(consumer.root, '@alavida-ai', registry.url);

      const result = runCLIJson(['skills', 'install', rootPackageName], {
        cwd: consumer.root,
        timeoutMs: 30000,
      });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.ok(result.json.installs[rootPackageName]);
      assert.ok(result.json.installs[dependencyPackageName]);

      const installState = readInstallState(consumer.root);
      assert.equal(installState.installs[rootPackageName].direct, true);
      assert.equal(installState.installs[dependencyPackageName].direct, false);

      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'value-proof-points')), true);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'value-proof-points')), true);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'methodology-gary-provost')), true);
    } finally {
      registryAuth?.cleanup();
      await registry.stop();
      source.cleanup();
      consumer.cleanup();
    }
  });
});
