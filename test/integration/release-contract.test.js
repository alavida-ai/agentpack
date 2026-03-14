import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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

  it('publishes the root package even when the latest commit did not bump package.json', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'agentpack-release-script-'));
    const binDir = join(tempRoot, 'bin');
    const scriptsDir = join(tempRoot, 'scripts');
    const commandLogPath = join(tempRoot, 'npm-commands.log');
    const npmStubPath = join(binDir, 'npm');

    try {
      mkdirSync(binDir, { recursive: true });
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(commandLogPath, '');

      writeFileSync(
        npmStubPath,
        `#!/usr/bin/env node
const fs = require('node:fs');
const logPath = process.env.NPM_STUB_LOG_PATH;
const args = process.argv.slice(2);
fs.appendFileSync(logPath, args.join(' ') + '\\n');
if (args[0] === 'view') {
  process.stdout.write('0.1.6\\n');
  process.exit(0);
}
if (args[0] === 'publish') {
  process.exit(0);
}
process.exit(1);
`
      );
      chmodSync(npmStubPath, 0o755);

      writeFileSync(
        join(tempRoot, 'package.json'),
        `${JSON.stringify({ name: '@alavida/agentpack', version: '0.1.6' }, null, 2)}\n`
      );
      writeFileSync(join(tempRoot, 'README.md'), '# Agentpack\n');
      writeFileSync(join(scriptsDir, 'release.mjs'), readFileSync(join(repoRoot, 'scripts', 'release.mjs'), 'utf-8'));

      execFileSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['add', '.'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: tempRoot, stdio: 'ignore' });

      writeFileSync(
        join(tempRoot, 'package.json'),
        `${JSON.stringify({ name: '@alavida/agentpack', version: '0.1.7' }, null, 2)}\n`
      );
      execFileSync('git', ['add', 'package.json'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'version bump'], { cwd: tempRoot, stdio: 'ignore' });

      writeFileSync(join(tempRoot, 'README.md'), '# Agentpack\n\nHotfix note.\n');
      execFileSync('git', ['add', 'README.md'], { cwd: tempRoot, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'follow-up fix'], { cwd: tempRoot, stdio: 'ignore' });

      execFileSync('node', ['scripts/release.mjs'], {
        cwd: tempRoot,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          NPM_STUB_LOG_PATH: commandLogPath,
        },
        stdio: 'ignore',
      });

      const commandLog = readFileSync(commandLogPath, 'utf-8');
      assert.match(commandLog, /^view @alavida\/agentpack version --registry https:\/\/registry\.npmjs\.org\/$/m);
      assert.match(commandLog, /^publish$/m);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
