import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInstalledMultiSkillFixture,
  runCLI,
  runCLIJson,
  runNpm,
} from './fixtures.js';

describe('agentpack skills status', () => {
  it('reports runtime health only and does not mention registry or auth setup', () => {
    const fixture = createInstalledMultiSkillFixture('skills-status-empty');

    try {
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: fixture.consumer.root });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const result = runCLI(['skills', 'status'], { cwd: fixture.consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Health: healthy/);
      assert.match(result.stdout, /Installed Packages: 2/);
      assert.doesNotMatch(result.stdout, /Registry/i);
      assert.doesNotMatch(result.stdout, /Auth/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('surfaces runtime drift when a materialized link is missing', () => {
    const fixture = createInstalledMultiSkillFixture('skills-status-drift');

    try {
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: fixture.consumer.root });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const enable = runCLI(['skills', 'enable', '@alavida-ai/prd-development'], { cwd: fixture.consumer.root });
      assert.equal(enable.exitCode, 0, enable.stderr);

      rmSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development'), {
        recursive: true,
        force: true,
      });

      const result = runCLIJson(['skills', 'status'], { cwd: fixture.consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.health, 'attention-needed');
      assert.equal(result.json.runtimeDriftCount, 1);
      assert.equal(result.json.runtimeDrift[0].packageName, '@alavida-ai/prd-development');
      assert.equal(result.json.runtimeDrift[0].issues[0].code, 'missing_path');
    } finally {
      fixture.cleanup();
    }
  });
});

