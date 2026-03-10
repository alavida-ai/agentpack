import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPluginBundleFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack plugin bundle commands', () => {
  it('inspects direct and transitive bundled skill packages for a plugin', () => {
    const repo = createPluginBundleFixture();

    try {
      const result = runCLI(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Plugin: website-dev/);
      assert.match(result.stdout, /Package: @alavida-ai\/plugin-website-dev/);
      assert.match(result.stdout, /Direct Bundled Packages: 2/);
      assert.match(result.stdout, /Transitive Bundled Packages: 1/);
      assert.match(result.stdout, /@alavida-ai\/value-proof-points/);
      assert.match(result.stdout, /@alavida-ai\/value-copywriting/);
      assert.match(result.stdout, /@alavida-ai\/methodology-gary-provost/);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured bundle inspection data', () => {
    const repo = createPluginBundleFixture();

    try {
      const result = runCLIJson(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.packageName, '@alavida-ai/plugin-website-dev');
      assert.equal(result.json.directPackages.length, 2);
      assert.equal(result.json.transitivePackages.length, 1);
      assert.equal(result.json.bundleManifestPath, 'plugins/website-dev/.claude-plugin/bundled-skills.json');
    } finally {
      repo.cleanup();
    }
  });

  it('validates a bundleable plugin successfully', () => {
    const repo = createPluginBundleFixture();

    try {
      const result = runCLI(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Status: valid/);
      assert.match(result.stdout, /Issues: 0/);
      assert.match(result.stdout, /Direct Bundled Packages: 2/);
      assert.match(result.stdout, /Transitive Bundled Packages: 1/);
    } finally {
      repo.cleanup();
    }
  });

  it('fails when a direct required skill package is not present in plugin devDependencies', () => {
    const repo = createPluginBundleFixture();

    try {
      const packageJsonPath = join(repo.root, 'plugins', 'website-dev', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      delete packageJson.devDependencies['@alavida-ai/value-proof-points'];
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

      const result = runCLIJson(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'missing_bundle_input');
      assert.equal(result.json.issues[0].packageName, '@alavida-ai/value-proof-points');
    } finally {
      repo.cleanup();
    }
  });
});
