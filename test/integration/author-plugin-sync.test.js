import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthorPluginSyncFixture, runCLIJson } from './fixtures.js';

describe('agentpack author plugin-sync', () => {
  it('copies the built dist bundle into plugin-local skills/<package> without overwriting sibling bundles', () => {
    const repo = createAuthorPluginSyncFixture('author-plugin-sync-copy');

    try {
      const build = runCLIJson(['author', 'build', 'workbenches/dashboard-creator'], { cwd: repo.root });
      assert.equal(build.exitCode, 0, build.stderr || build.stdout);

      const siblingRoot = join(repo.pluginDir, 'skills', 'existing-package');
      const siblingMarker = join(siblingRoot, 'marker.txt');
      mkdirSync(siblingRoot, { recursive: true });
      writeFileSync(siblingMarker, 'keep me\n');

      const result = runCLIJson(['author', 'plugin-sync', 'workbenches/dashboard-creator', 'plugins/dashboard-plugin'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.packageName, '@alavida-ai/dashboard-creator');
      assert.equal(result.json.pluginDir, 'plugins/dashboard-plugin');
      assert.equal(result.json.targetDir, 'plugins/dashboard-plugin/skills/dashboard-creator');

      const syncedRoot = join(repo.pluginDir, 'skills', 'dashboard-creator');
      assert.equal(existsSync(join(syncedRoot, '.agentpack-bundle.json')), true);
      assert.equal(existsSync(join(syncedRoot, 'agentpack.json')), true);
      assert.equal(existsSync(join(syncedRoot, 'dashboard-creator', 'SKILL.md')), true);
      assert.equal(existsSync(join(syncedRoot, 'foundation-primer', 'SKILL.md')), true);
      assert.equal(existsSync(join(syncedRoot, 'scripts', 'project.ts')), true);
      assert.equal(existsSync(join(syncedRoot, 'lib', 'client.ts')), true);
      assert.equal(existsSync(join(syncedRoot, 'data', 'config.json')), true);
      assert.equal(existsSync(siblingMarker), true);

      const syncManifest = JSON.parse(readFileSync(join(syncedRoot, '.agentpack-plugin-sync.json'), 'utf-8'));
      assert.equal(syncManifest.sourcePackageName, '@alavida-ai/dashboard-creator');
      assert.equal(syncManifest.bundleSourcePath, 'workbenches/dashboard-creator/dist');
    } finally {
      repo.cleanup();
    }
  });

  it('fails clearly when the plugin skills root is a symlink', () => {
    const repo = createAuthorPluginSyncFixture('author-plugin-sync-symlink');

    try {
      const build = runCLIJson(['author', 'build', 'workbenches/dashboard-creator'], { cwd: repo.root });
      assert.equal(build.exitCode, 0, build.stderr || build.stdout);
      repo.makePluginSkillsSymlink();
      assert.equal(lstatSync(join(repo.pluginDir, 'skills')).isSymbolicLink(), true);

      const result = runCLIJson(['author', 'plugin-sync', 'workbenches/dashboard-creator', 'plugins/dashboard-plugin'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.error, 'plugin_skills_root_is_symlink');
      assert.match(result.json.message, /plugin skills root is a symlink/i);
    } finally {
      repo.cleanup();
    }
  });

  it('syncs from an existing dist bundle even if the authored package is currently invalid', () => {
    const repo = createAuthorPluginSyncFixture('author-plugin-sync-dist-first');

    try {
      const build = runCLIJson(['author', 'build', 'workbenches/dashboard-creator'], { cwd: repo.root });
      assert.equal(build.exitCode, 0, build.stderr || build.stdout);

      writeFileSync(
        join(repo.packageDir, 'SKILL.md'),
        `---
name: dashboard-creator
description: Broken after build.
---

\`\`\`agentpack
\`\`\`

\`\`\`agentpack
\`\`\`
`
      );

      const result = runCLIJson(['author', 'plugin-sync', 'workbenches/dashboard-creator', 'plugins/dashboard-plugin'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(existsSync(join(repo.pluginDir, 'skills', 'dashboard-creator', 'dashboard-creator', 'SKILL.md')), true);
    } finally {
      repo.cleanup();
    }
  });
});
