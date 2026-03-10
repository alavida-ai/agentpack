import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPluginBundleFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack plugin build', () => {
  it('builds a plugin artifact with local files and vendored skills', () => {
    const repo = createPluginBundleFixture();

    try {
      const result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');

      assert.equal(result.exitCode, 0, result.stderr);
      assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')));
      assert.ok(existsSync(join(outDir, 'skills', 'proof-points', 'SKILL.md')));
      assert.ok(existsSync(join(outDir, 'skills', 'copywriting', 'SKILL.md')));
      assert.ok(existsSync(join(outDir, 'skills', 'value-proof-points', 'SKILL.md')));
      assert.ok(existsSync(join(outDir, 'skills', 'value-copywriting', 'SKILL.md')));
      assert.ok(existsSync(join(outDir, 'skills', 'methodology-gary-provost', 'SKILL.md')));
      assert.ok(existsSync(join(outDir, 'package.json')));
    } finally {
      repo.cleanup();
    }
  });

  it('writes bundled skill provenance and json output', () => {
    const repo = createPluginBundleFixture();

    try {
      const result = runCLIJson(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');
      const bundled = JSON.parse(readFileSync(join(outDir, '.claude-plugin', 'bundled-skills.json'), 'utf-8'));
      const packageNames = bundled.packages.map((entry) => entry.packageName);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.pluginName, 'website-dev');
      assert.equal(result.json.success, true);
      assert.equal(result.json.outputPath, '.agentpack/dist/plugins/website-dev');
      assert.ok(result.json.vendoredSkills.includes('value-proof-points'));
      assert.ok(packageNames.includes('@alavida-ai/value-proof-points'));
      assert.ok(packageNames.includes('@alavida-ai/methodology-gary-provost'));
    } finally {
      repo.cleanup();
    }
  });

  it('copies hooks and templates when present', () => {
    const repo = createPluginBundleFixture();

    try {
      mkdirSync(join(repo.root, 'plugins', 'website-dev', 'hooks'), { recursive: true });
      mkdirSync(join(repo.root, 'plugins', 'website-dev', 'templates'), { recursive: true });
      writeFileSync(join(repo.root, 'plugins', 'website-dev', 'hooks', 'init.js'), 'export default {};');
      writeFileSync(join(repo.root, 'plugins', 'website-dev', 'templates', 'page.md'), '# Page\n');

      const result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');

      assert.equal(result.exitCode, 0, result.stderr);
      assert.ok(existsSync(join(outDir, 'hooks', 'init.js')));
      assert.ok(existsSync(join(outDir, 'templates', 'page.md')));
    } finally {
      repo.cleanup();
    }
  });

  it('supports --clean and removes stale output', () => {
    const repo = createPluginBundleFixture();

    try {
      runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');
      writeFileSync(join(outDir, 'stale-file.txt'), 'stale');

      const result = runCLI(['plugin', 'build', '--clean', 'plugins/website-dev'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(existsSync(join(outDir, 'stale-file.txt')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('syncs local plugin skill package dependencies before bundling', () => {
    const repo = createPluginBundleFixture();

    try {
      const localPackagePath = join(repo.root, 'plugins', 'website-dev', 'skills', 'proof-points', 'package.json');
      writeFileSync(
        localPackagePath,
        JSON.stringify(
          {
            name: '@alavida-ai/proof-points-local',
            version: '1.0.0',
            files: ['SKILL.md'],
            dependencies: {},
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const packageJson = JSON.parse(readFileSync(localPackagePath, 'utf-8'));

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(packageJson.dependencies['@alavida-ai/value-proof-points'], '*');
    } finally {
      repo.cleanup();
    }
  });

  it('fails with no partial output when dependencies are unresolved', () => {
    const repo = createPluginBundleFixture();

    try {
      rmSync(join(repo.root, 'packages', 'skills', 'value-proof-points'), { recursive: true, force: true });

      const result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr + result.stdout, /value-proof-points|unresolved/i);
      assert.equal(existsSync(outDir), false);
    } finally {
      repo.cleanup();
    }
  });

  it('fails when vendored skills collide with local skill names', () => {
    const repo = createPluginBundleFixture();

    try {
      mkdirSync(join(repo.root, 'plugins', 'website-dev', 'skills', 'methodology-gary-provost'), { recursive: true });
      writeFileSync(
        join(repo.root, 'plugins', 'website-dev', 'skills', 'methodology-gary-provost', 'SKILL.md'),
        `---
name: methodology-gary-provost
description: Duplicate.
requires: []
---

# Duplicate
`
      );

      const result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr + result.stdout, /collision|duplicate|methodology-gary-provost/i);
      assert.equal(existsSync(outDir), false);
    } finally {
      repo.cleanup();
    }
  });

  it('fails on invalid plugin structure', () => {
    const repo = createPluginBundleFixture();

    try {
      const badPluginDir = join(repo.root, 'plugins', 'bad');
      mkdirSync(badPluginDir, { recursive: true });
      writeFileSync(join(badPluginDir, 'package.json'), '{"name":"bad"}\n');

      const result = runCLI(['plugin', 'build', 'plugins/bad'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stderr + result.stdout, /plugin\.json|plugin/i);
    } finally {
      repo.cleanup();
    }
  });
});
