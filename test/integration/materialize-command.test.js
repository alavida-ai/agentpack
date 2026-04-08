import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInstalledMultiSkillFixture,
  readMaterializationState,
  runCLI,
  runCLIJson,
  runNpm,
} from './fixtures.js';

describe('agentpack materialize', () => {
  it('materializes installed workspace skill dependencies and their transitive skill requirements', () => {
    const fixture = createInstalledMultiSkillFixture('materialize-command');

    try {
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: fixture.consumer.root });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const consumerPackageJsonPath = join(fixture.consumer.root, 'package.json');
      const consumerPackageJson = JSON.parse(readFileSync(consumerPackageJsonPath, 'utf-8'));
      consumerPackageJson.dependencies = {
        '@alavida-ai/prd-development': consumerPackageJson.dependencies['@alavida-ai/prd-development'],
      };
      writeFileSync(consumerPackageJsonPath, JSON.stringify(consumerPackageJson, null, 2) + '\n');

      const listBefore = runCLIJson(['skills', 'list'], { cwd: fixture.consumer.root });
      assert.equal(listBefore.exitCode, 0, listBefore.stderr);
      assert.equal(listBefore.json.packages.length, 2);

      const materialize = runCLIJson(['materialize'], { cwd: fixture.consumer.root });
      assert.equal(materialize.exitCode, 0, materialize.stderr || materialize.stdout);
      assert.equal(materialize.json.action, 'materialize');
      assert.equal(materialize.json.deprecated, true);
      assert.match(materialize.json.message, /skillkit/i);
      assert.deepEqual(materialize.json.directPackages, ['@alavida-ai/prd-development']);

      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development')), true);
      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona')), true);
      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'foundation-primer')), true);
      assert.equal(existsSync(join(fixture.consumer.root, '.agents', 'skills', 'foundation-primer')), true);

      const materializationState = readMaterializationState(fixture.consumer.root);
      assert.ok(materializationState);
      assert.ok(materializationState.adapters.claude.some((entry) => entry.runtimeName === 'prd-development'));
      assert.ok(materializationState.adapters.claude.some((entry) => entry.runtimeName === 'foundation-primer'));
    } finally {
      fixture.cleanup();
    }
  });
});
