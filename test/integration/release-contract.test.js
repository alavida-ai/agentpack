import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('release contract', () => {
  it('does not require esbuild at runtime to start the skill dev workbench server', () => {
    const serverSource = readFileSync(
      join(repoRoot, 'src', 'infrastructure', 'runtime', 'skill-dev-workbench-server.js'),
      'utf-8'
    );

    assert.doesNotMatch(serverSource, /from 'esbuild'/);
    assert.doesNotMatch(serverSource, /await build\(/);
  });

  it('uses changesets on main pushes instead of manual tag releases', () => {
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf-8');
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    const changesetConfig = JSON.parse(readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf-8'));
    const releaseScript = readFileSync(join(repoRoot, 'scripts', 'release.mjs'), 'utf-8');
    const trackerPackageJson = JSON.parse(readFileSync(
      join(repoRoot, 'packages', 'agentpack-release', 'package.json'),
      'utf-8'
    ));
    const trackerChangelog = readFileSync(
      join(repoRoot, 'packages', 'agentpack-release', 'CHANGELOG.md'),
      'utf-8'
    );
    const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf-8');

    assert.match(workflow, /branches:\s*\n\s*-\s*main/);
    assert.match(workflow, /changesets\/action@/);
    assert.match(workflow, /commit:\s*"chore: version packages"/);
    assert.match(workflow, /@alavida-ai:registry=https:\/\/npm\.pkg\.github\.com/);
    assert.match(workflow, /\/\/npm\.pkg\.github\.com\/:_authToken=\$\{GITHUB_PACKAGES_TOKEN:-\$GITHUB_TOKEN\}/);
    assert.doesNotMatch(workflow, /npm view @alavida-ai\/agentpack-auth-probe version --registry https:\/\/npm\.pkg\.github\.com/);
    assert.doesNotMatch(workflow, /tags:\s*\n\s*-\s*'v\*'/);
    assert.doesNotMatch(workflow, /commit:\s*chore:\s*version packages/);
    assert.match(changelog, /^# Changelog/m);

    assert.equal(packageJson.scripts.changeset, 'changeset');
    assert.equal(packageJson.scripts['version-packages'], 'node scripts/version-packages.mjs');
    assert.equal(packageJson.scripts.release, 'node scripts/release.mjs');
    assert.ok(packageJson.devDependencies['@changesets/cli']);
    assert.equal(changesetConfig.privatePackages?.version, true);
    assert.equal(changesetConfig.privatePackages?.tag, false);
    assert.equal(trackerPackageJson.name, '@alavida/agentpack-release');
    assert.equal(trackerPackageJson.private, true);
    assert.match(trackerChangelog, /^# @alavida\/agentpack-release/m);
    assert.doesNotMatch(releaseScript, /changeset', 'publish'/);
    assert.match(releaseScript, /readJsonFromGit\('HEAD\^'/);
  });

  it('documents the merged skills dev and plugin diagnostics behavior without worktree paths', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8');
    const shippedSkill = readFileSync(join(repoRoot, 'skills', 'agentpack-cli', 'SKILL.md'), 'utf-8');
    const sandboxSpec = readFileSync(
      join(repoRoot, 'docs', 'superpowers', 'specs', '2026-03-11-acme-demo-sandbox-design.md'),
      'utf-8'
    );
    const sandboxPlan = readFileSync(
      join(repoRoot, 'docs', 'superpowers', 'plans', '2026-03-11-acme-demo-sandbox.md'),
      'utf-8'
    );

    assert.match(readme, /--no-dashboard/);
    assert.match(readme, /plugin inspect/i);
    assert.doesNotMatch(readme, /\.worktrees\//);
    assert.doesNotMatch(readme, /\/Users\/[^)\s]+/);

    assert.match(shippedSkill, /plugin inspect/i);
    assert.match(shippedSkill, /plugin validate/i);
    assert.match(shippedSkill, /structured diagnostic/i);
    assert.match(shippedSkill, /--no-dashboard/);
    assert.match(shippedSkill, /workbench/i);

    assert.match(sandboxSpec, /domains\/[A-Za-z0-9/_-]*workbenches\//);
    assert.match(sandboxPlan, /domains\/[A-Za-z0-9/_-]*workbenches\//);
    assert.doesNotMatch(sandboxSpec, /workbench\.json/);
    assert.doesNotMatch(sandboxPlan, /workbench\.json/);
  });
});
