import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInstalledMultiSkillFixture,
  readMaterializationState,
  runCLI,
  runCLIJson,
  runNpm,
} from './fixtures.js';

describe('agentpack skills enable and disable', () => {
  it('lists installed skill packages from node_modules and enables/disables them without agentpack install', () => {
    const fixture = createInstalledMultiSkillFixture('skills-enable-disable');

    try {
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: fixture.consumer.root });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const listBefore = runCLIJson(['skills', 'list'], { cwd: fixture.consumer.root });
      assert.equal(listBefore.exitCode, 0, listBefore.stderr);
      assert.equal(listBefore.json.packages.length, 2);
      assert.equal(
        listBefore.json.packages.find((entry) => entry.packageName === '@alavida-ai/prd-development').exports[0].enabled.length,
        0
      );

      const enable = runCLI(['skills', 'enable', '@alavida-ai/prd-development'], { cwd: fixture.consumer.root });
      assert.equal(enable.exitCode, 0, enable.stderr);

      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development')), true);
      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona')), true);
      assert.equal(existsSync(join(fixture.consumer.root, '.agents', 'skills', 'prd-development:problem-statement')), true);

      const materializationState = readMaterializationState(fixture.consumer.root);
      assert.ok(materializationState);
      assert.ok(materializationState.adapters.claude.some((entry) => entry.runtimeName === 'prd-development'));

      const listAfter = runCLIJson(['skills', 'list'], { cwd: fixture.consumer.root });
      assert.equal(listAfter.exitCode, 0, listAfter.stderr);
      const prdPackage = listAfter.json.packages.find((entry) => entry.packageName === '@alavida-ai/prd-development');
      assert.deepEqual(
        prdPackage.exports.find((entry) => entry.id === '@alavida-ai/prd-development').enabled.sort(),
        ['agents', 'claude']
      );

      const disable = runCLI(['skills', 'disable', '@alavida-ai/prd-development'], { cwd: fixture.consumer.root });
      assert.equal(disable.exitCode, 0, disable.stderr);

      assert.equal(existsSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development')), false);
      assert.equal(existsSync(join(fixture.consumer.root, '.agents', 'skills', 'prd-development:proto-persona')), false);

      const listDisabled = runCLIJson(['skills', 'list'], { cwd: fixture.consumer.root });
      assert.equal(listDisabled.exitCode, 0, listDisabled.stderr);
      assert.equal(
        listDisabled.json.packages.find((entry) => entry.packageName === '@alavida-ai/prd-development').exports[0].enabled.length,
        0
      );
    } finally {
      fixture.cleanup();
    }
  });
});
