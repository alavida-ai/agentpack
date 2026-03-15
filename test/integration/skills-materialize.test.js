import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, readMaterializationState, runCLIJson } from './fixtures.js';

function createCompilerModeRepo(name = 'skills-materialize') {
  return createScenario({
    name,
    sources: {
      'domains/product/knowledge/prd-principles.md': '# Principles\n',
    },
    packages: [
      {
        relPath: 'skills/prd-agent',
        packageJson: {
          name: '@alavida/prd-agent',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
        skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
      },
    ],
  });
}

describe('agentpack skills materialize', () => {
  it('materializes compiled state into claude and agents runtimes', () => {
    const repo = createCompilerModeRepo('skills-materialize-runtime');

    try {
      const buildResult = runCLIJson(['skills', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(buildResult.exitCode, 0, buildResult.stderr || buildResult.stdout);

      const result = runCLIJson(['skills', 'materialize'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.rootSkill, 'skill:prd-agent');
      assert.equal(result.json.adapterCount, 2);

      const materializationState = readMaterializationState(repo.root);
      assert.ok(materializationState);
      assert.equal(materializationState.adapters.claude.length, 1);
      assert.equal(materializationState.adapters.agents.length, 1);

      const claudePath = join(repo.root, '.claude', 'skills', 'prd-agent');
      const agentsPath = join(repo.root, '.agents', 'skills', 'prd-agent');
      assert.equal(existsSync(claudePath), true);
      assert.equal(existsSync(agentsPath), true);
      assert.equal(lstatSync(claudePath).isSymbolicLink(), true);
      assert.equal(lstatSync(agentsPath).isSymbolicLink(), true);
    } finally {
      repo.cleanup();
    }
  });

  it('fails clearly when compiled state has not been built yet', () => {
    const repo = createCompilerModeRepo('skills-materialize-missing-compiled');

    try {
      const result = runCLIJson(['skills', 'materialize'], { cwd: repo.root });

      assert.equal(result.exitCode, 4);
      assert.equal(result.json.error, 'compiled_state_not_found');
      assert.match(result.json.message, /compiled state not found/i);
    } finally {
      repo.cleanup();
    }
  });
});
