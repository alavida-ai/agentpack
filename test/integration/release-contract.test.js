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
