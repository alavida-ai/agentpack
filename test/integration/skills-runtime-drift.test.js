import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInstalledMultiSkillFixture,
  readPathState,
  runCLI,
  runCLIJson,
} from './fixtures.js';

function writeDevSession(repoRoot, session) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'dev-session.json'), JSON.stringify(session, null, 2) + '\n');
}

describe('agentpack skills runtime drift', () => {
  it('reports owned drift and orphaned materializations through skills status', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-status');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      rmSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona'), {
        recursive: true,
        force: true,
      });

      const orphanedPath = join(fixture.consumer.root, '.claude', 'skills', 'orphaned-demo');
      mkdirSync(join(fixture.consumer.root, '.claude', 'skills'), { recursive: true });
      symlinkSync(
        join(fixture.consumer.root, 'node_modules', '@alavida-ai', 'prd-development', 'skills', 'problem-statement'),
        orphanedPath,
        'dir'
      );

      const result = runCLIJson(['skills', 'status'], { cwd: fixture.consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.health, 'attention-needed');
      assert.equal(result.json.runtimeDriftCount, 1);
      assert.equal(result.json.runtimeDrift[0].packageName, '@alavida-ai/prd-development');
      assert.equal(result.json.runtimeDrift[0].issues[0].code, 'missing_path');
      assert.equal(result.json.orphanedMaterializationCount, 1);
      assert.equal(result.json.orphanedMaterializations[0].target, '.claude/skills/orphaned-demo');
    } finally {
      fixture.cleanup();
    }
  });

  it('keeps env declarative when runtime entries drift', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-env');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      rmSync(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona'), {
        recursive: true,
        force: true,
      });

      const env = runCLI(['skills', 'env'], { cwd: fixture.consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      assert.match(env.stdout, /Installed Skills: 2/);
      assert.match(env.stdout, /skills: prd-development, problem-statement, proto-persona/);
      assert.match(env.stdout, /materialized: \.claude\/skills\/prd-development:proto-persona \(symlink\)/);
    } finally {
      fixture.cleanup();
    }
  });

  it('does not classify active skills dev links as orphaned materializations', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-dev-links');

    try {
      mkdirSync(join(fixture.consumer.root, 'skills', 'local-skill'), { recursive: true });
      mkdirSync(join(fixture.consumer.root, '.claude', 'skills'), { recursive: true });
      mkdirSync(join(fixture.consumer.root, '.agents', 'skills'), { recursive: true });

      symlinkSync(
        join(fixture.consumer.root, 'skills', 'local-skill'),
        join(fixture.consumer.root, '.claude', 'skills', 'local-skill'),
        'dir'
      );
      symlinkSync(
        join(fixture.consumer.root, 'skills', 'local-skill'),
        join(fixture.consumer.root, '.agents', 'skills', 'local-skill'),
        'dir'
      );

      writeDevSession(fixture.consumer.root, {
        version: 1,
        session_id: 'active-dev',
        status: 'active',
        pid: process.pid,
        repo_root: fixture.consumer.root,
        target: 'skills/local-skill',
        root_skill: {
          name: 'local-skill',
          package_name: '@alavida-ai/local-skill',
          path: 'skills/local-skill',
        },
        linked_skills: [
          { name: 'local-skill', package_name: '@alavida-ai/local-skill', path: 'skills/local-skill' },
        ],
        links: [
          '.claude/skills/local-skill',
          '.agents/skills/local-skill',
        ],
        started_at: '2026-03-13T12:00:00.000Z',
        updated_at: '2026-03-13T12:00:00.000Z',
      });

      const result = runCLIJson(['skills', 'status'], { cwd: fixture.consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.orphanedMaterializationCount, 0);
      assert.deepEqual(result.json.orphanedMaterializations, []);
    } finally {
      fixture.cleanup();
    }
  });

  it('uninstall removes dangling recorded symlinks', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-uninstall-dangling');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      rmSync(
        join(fixture.consumer.root, 'node_modules', '@alavida-ai', 'prd-development', 'skills', 'proto-persona'),
        { recursive: true, force: true }
      );

      const before = readPathState(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona'));
      assert.equal(before.isSymlink, true);

      const uninstall = runCLI(['skills', 'uninstall', '@alavida-ai/prd-development'], { cwd: fixture.consumer.root });

      assert.equal(uninstall.exitCode, 0, uninstall.stderr);

      const after = readPathState(join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona'));
      assert.equal(after.exists, false);
    } finally {
      fixture.cleanup();
    }
  });

  it('uninstall removes wrong-target recorded symlinks', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-uninstall-wrong-target');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const targetPath = join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona');
      rmSync(targetPath, { recursive: true, force: true });
      symlinkSync(
        join(fixture.consumer.root, 'node_modules', '@alavida-ai', 'prd-development', 'skills', 'problem-statement'),
        targetPath,
        'dir'
      );

      const uninstall = runCLI(['skills', 'uninstall', '@alavida-ai/prd-development'], { cwd: fixture.consumer.root });
      assert.equal(uninstall.exitCode, 0, uninstall.stderr);

      const after = readPathState(targetPath);
      assert.equal(after.exists, false);
    } finally {
      fixture.cleanup();
    }
  });

  it('reinstall repairs a missing recorded materialization', () => {
    const fixture = createInstalledMultiSkillFixture('skills-runtime-drift-reinstall');

    try {
      const install = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const targetPath = join(fixture.consumer.root, '.claude', 'skills', 'prd-development:proto-persona');
      rmSync(targetPath, { recursive: true, force: true });

      const reinstall = runCLI(['skills', 'install', fixture.target], { cwd: fixture.consumer.root });
      assert.equal(reinstall.exitCode, 0, reinstall.stderr);

      const after = readPathState(targetPath);
      assert.equal(after.isSymlink, true);
    } finally {
      fixture.cleanup();
    }
  });
});
