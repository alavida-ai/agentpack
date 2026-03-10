import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPluginBundleFixture, startCLI } from './fixtures.js';

describe('agentpack plugin dev', () => {
  it('builds initially, prints the plugin-dir path, and rebuilds on source changes', async () => {
    const repo = createPluginBundleFixture();

    try {
      const session = startCLI(['plugin', 'dev', 'plugins/website-dev'], { cwd: repo.root });
      const outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev');

      await session.waitForOutput(/--plugin-dir/);
      assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')));

      const skillPath = join(repo.root, 'plugins', 'website-dev', 'skills', 'copywriting', 'SKILL.md');
      writeFileSync(skillPath, readFileSync(skillPath, 'utf-8') + '\n<!-- changed -->\n');

      await session.waitForOutput(/Rebuilt plugin|Rebuilding plugin/);

      const result = await session.stop();
      assert.match(result.stdout, /\.agentpack\/dist\/plugins\/website-dev/);
      assert.match(result.stdout, /--plugin-dir/);
    } finally {
      repo.cleanup();
    }
  });

  it('rebuilds when hook files change', async () => {
    const repo = createPluginBundleFixture();

    try {
      const hooksDir = join(repo.root, 'plugins', 'website-dev', 'hooks');
      const hookPath = join(hooksDir, 'init.js');
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(hookPath, 'export default {};\n');

      const session = startCLI(['plugin', 'dev', 'plugins/website-dev'], { cwd: repo.root });
      await session.waitForOutput(/--plugin-dir/);

      writeFileSync(hookPath, 'export default { changed: true };\n');
      await session.waitForOutput(/Rebuilt plugin|Rebuilding plugin/);

      const result = await session.stop();
      assert.match(result.stdout, /Rebuilt plugin/);
    } finally {
      repo.cleanup();
    }
  });
});
