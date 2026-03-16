import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('release contract', () => {
  it('does not require esbuild at runtime to start the skill dev workbench server', () => {
    const serverSource = readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'src', 'infrastructure', 'runtime', 'skill-dev-workbench-server.js'),
      'utf-8'
    );

    assert.doesNotMatch(serverSource, /from 'esbuild'/);
    assert.doesNotMatch(serverSource, /await build\(/);
  });

  it('uses changesets on main pushes instead of manual tag releases', () => {
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf-8');
    const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    const packageJson = JSON.parse(readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'package.json'),
      'utf-8'
    ));
    const changesetConfig = JSON.parse(readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf-8'));
    const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf-8');

    assert.match(workflow, /branches:\s*\n\s*-\s*main/);
    assert.match(workflow, /changesets\/action@/);
    assert.match(workflow, /commit:\s*"chore: version packages"/);
    assert.match(workflow, /version:\s*npx changeset version/);
    assert.match(workflow, /publish:\s*npx changeset publish/);
    assert.match(workflow, /@alavida-ai:registry=https:\/\/npm\.pkg\.github\.com/);
    assert.match(workflow, /\/\/npm\.pkg\.github\.com\/:_authToken=\$\{GITHUB_PACKAGES_TOKEN:-\$GITHUB_TOKEN\}/);
    assert.doesNotMatch(workflow, /npm view @alavida-ai\/agentpack-auth-probe version --registry https:\/\/npm\.pkg\.github\.com/);
    assert.doesNotMatch(workflow, /tags:\s*\n\s*-\s*'v\*'/);
    assert.doesNotMatch(workflow, /commit:\s*chore:\s*version packages/);
    assert.doesNotMatch(workflow, /npm run version-packages/);
    assert.doesNotMatch(workflow, /npm run release/);
    assert.match(changelog, /^# Changelog/m);

    assert.equal(rootPackageJson.private, true);
    assert.deepEqual(rootPackageJson.workspaces, ['packages/*']);
    assert.equal(rootPackageJson.scripts.changeset, 'changeset');
    assert.equal(rootPackageJson.scripts['test:sandboxes'], 'node scripts/test-sandboxes.mjs');
    assert.equal(rootPackageJson.scripts['validate:live'], undefined);
    assert.equal(rootPackageJson.scripts['smoke:monorepo'], undefined);
    assert.ok(rootPackageJson.devDependencies['@changesets/cli']);
    assert.equal(packageJson.name, '@alavida/agentpack');
    assert.equal(packageJson.publishConfig?.registry, 'https://registry.npmjs.org/');
    assert.equal(packageJson.bin?.agentpack, 'bin/agentpack.js');
    assert.equal(packageJson.bin?.intent, 'bin/intent.js');
    assert.equal(changesetConfig.access, 'public');
    assert.equal(changesetConfig.baseBranch, 'main');
  });

  it('documents the compiler/bundler skill workflow without plugin surface or worktree paths', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8');
    const shippedSkill = readFileSync(join(repoRoot, 'packages', 'agentpack', 'skills', 'agentpack-cli', 'SKILL.md'), 'utf-8');
    const sandboxSpec = readFileSync(
      join(repoRoot, 'docs', 'superpowers', 'specs', '2026-03-11-acme-demo-sandbox-design.md'),
      'utf-8'
    );
    const sandboxPlan = readFileSync(
      join(repoRoot, 'docs', 'superpowers', 'plans', '2026-03-11-acme-demo-sandbox.md'),
      'utf-8'
    );

    assert.match(readme, /--no-dashboard/);
    assert.match(readme, /compiled\.json/i);
    assert.match(readme, /materialization-state\.json/i);
    assert.match(readme, /test:sandboxes/i);
    assert.doesNotMatch(readme, /agentpack plugin /i);
    assert.doesNotMatch(readme, /\.worktrees\//);
    assert.doesNotMatch(readme, /\/Users\/[^)\s]+/);

    assert.match(shippedSkill, /compiled artifact/i);
    assert.match(shippedSkill, /author build/i);
    assert.match(shippedSkill, /--no-dashboard/);
    assert.match(shippedSkill, /workbench/i);
    assert.doesNotMatch(shippedSkill, /\bplugin\b/i);

    assert.match(sandboxSpec, /domains\/[A-Za-z0-9/_-]*workbenches\//);
    assert.match(sandboxPlan, /domains\/[A-Za-z0-9/_-]*workbenches\//);
    assert.doesNotMatch(sandboxSpec, /workbench\.json/);
    assert.doesNotMatch(sandboxPlan, /workbench\.json/);
  });

  it('keeps bundled authoring skills on the compiler-first contract', () => {
    const compilerModeAuthoring = readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'skills', 'compiler-mode-authoring', 'SKILL.md'),
      'utf-8'
    );
    const multiSkillPackages = readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'skills', 'multi-skill-packages', 'SKILL.md'),
      'utf-8'
    );
    const authoringFromKnowledge = readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'skills', 'authoring-skillgraphs-from-knowledge', 'SKILL.md'),
      'utf-8'
    );
    const developingAndTesting = readFileSync(
      join(repoRoot, 'packages', 'agentpack', 'skills', 'developing-and-testing-skills', 'SKILL.md'),
      'utf-8'
    );

    for (const skill of [compilerModeAuthoring, multiSkillPackages, authoringFromKnowledge, developingAndTesting]) {
      assert.doesNotMatch(skill, /metadata\.sources/);
      assert.doesNotMatch(skill, /^requires:\s*$/m);
    }
  });

  it('hard-deletes plugin handling from the shipped product surface', () => {
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'src', 'commands', 'plugin.js')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'src', 'lib', 'plugins.js')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'src', 'application', 'plugins')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'src', 'domain', 'plugins')), false);
    assert.equal(existsSync(join(repoRoot, 'docs', 'building-plugins.mdx')), false);
    assert.equal(existsSync(join(repoRoot, 'test', 'integration', 'plugin-build.test.js')), false);
    assert.equal(existsSync(join(repoRoot, 'test', 'integration', 'plugin-bundle.test.js')), false);
    assert.equal(existsSync(join(repoRoot, 'test', 'integration', 'plugin-dev.test.js')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'skills', 'repairing-broken-skill-or-plugin-state')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'skills', 'shipping-production-plugins-and-packages')), false);
    assert.equal(existsSync(join(repoRoot, 'packages', 'agentpack', 'skills', 'agentpack-cli', 'references', 'plugin-lifecycle.md')), false);
  });

  it('keeps thin root bin wrappers for local repo usage', () => {
    const rootAgentpackBin = readFileSync(join(repoRoot, 'bin', 'agentpack.js'), 'utf-8');
    const rootIntentBin = readFileSync(join(repoRoot, 'bin', 'intent.js'), 'utf-8');

    assert.match(rootAgentpackBin, /packages\/agentpack\/bin\/agentpack\.js/);
    assert.match(rootIntentBin, /findIntentPackageJson/);
  });
});
