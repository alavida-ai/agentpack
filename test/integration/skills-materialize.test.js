import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, readMaterializationState, runCLIJson } from './fixtures.js';
import { startSkillDev } from '../../packages/agentpack/src/lib/skills.js';

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
import prd from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
      },
    ],
  });
}

describe('agentpack skills materialize', () => {
  it('materializes compiled state into claude and agents runtimes with source references', () => {
    const repo = createCompilerModeRepo('skills-materialize-runtime');

    try {
      const buildResult = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(buildResult.exitCode, 0, buildResult.stderr || buildResult.stdout);

      const result = runCLIJson(['author', 'materialize'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.rootSkill, 'skill:prd-agent');
      assert.equal(result.json.adapterCount, 2);

      const materializationState = readMaterializationState(repo.root);
      assert.ok(materializationState);
      assert.equal(materializationState.adapters.claude.length, 1);
      assert.equal(materializationState.adapters.agents.length, 1);

      const distSkillPath = join(repo.root, 'skills', 'prd-agent', 'dist', 'prd-agent', 'SKILL.md');
      const distReferencesDir = join(repo.root, 'skills', 'prd-agent', 'dist', 'prd-agent', 'references');
      const distReferencePath = join(distReferencesDir, 'prd-principles.md');
      assert.equal(existsSync(distSkillPath), true);
      assert.equal(existsSync(distReferencesDir), true);
      assert.equal(existsSync(distReferencePath), true);
      const distSkill = readFileSync(distSkillPath, 'utf-8');
      const distReference = readFileSync(distReferencePath, 'utf-8');
      assert.doesNotMatch(distSkill, /```agentpack/);
      assert.match(distSkill, /^---\nname: prd-agent\ndescription: Create strong PRDs\.\n---/);
      assert.match(
        distSkill,
        /Use the PRD method \(`\/prd-development`\)\./
      );
      assert.match(
        distSkill,
        /Ground this in \[our PRD principles\]\(references\/prd-principles\.md\)\{context="primary source material"\}\./
      );
      assert.doesNotMatch(distSkill, /## Source Material/);
      assert.doesNotMatch(distSkill, /# Principles/);
      assert.equal(distReference, '# Principles\n');

      const claudePath = join(repo.root, '.claude', 'skills', 'prd-agent');
      const agentsPath = join(repo.root, '.agents', 'skills', 'prd-agent');
      assert.equal(existsSync(claudePath), true);
      assert.equal(existsSync(agentsPath), true);
      assert.equal(lstatSync(claudePath).isSymbolicLink(), true);
      assert.equal(lstatSync(agentsPath).isSymbolicLink(), true);
      assert.equal(
        readFileSync(join(claudePath, 'SKILL.md'), 'utf-8'),
        distSkill
      );
    } finally {
      repo.cleanup();
    }
  });

  it('keeps dev runtime links pointed at the same generated dist artifact shape', () => {
    const repo = createCompilerModeRepo('skills-materialize-dev-runtime-shape');
    let session = null;

    try {
      session = startSkillDev('skills/prd-agent', {
        cwd: repo.root,
        dashboard: false,
      });
      const readyResult = session.initialResult;
      assert.equal(readyResult.name, 'prd-agent');

      const claudeSkillPath = join(repo.root, '.claude', 'skills', 'prd-agent', 'SKILL.md');
      const claudeReferencePath = join(repo.root, '.claude', 'skills', 'prd-agent', 'references', 'prd-principles.md');
      const runtimeSkill = readFileSync(claudeSkillPath, 'utf-8');

      assert.match(
        runtimeSkill,
        /Use the PRD method \(`\/prd-development`\)\./
      );
      assert.match(
        runtimeSkill,
        /Ground this in \[our PRD principles\]\(references\/prd-principles\.md\)\{context="primary source material"\}\./
      );
      assert.equal(readFileSync(claudeReferencePath, 'utf-8'), '# Principles\n');
    } finally {
      session?.close();
      repo.cleanup();
    }
  });

  it('fails clearly when compiled state has not been built yet', () => {
    const repo = createCompilerModeRepo('skills-materialize-missing-compiled');

    try {
      const result = runCLIJson(['author', 'materialize'], { cwd: repo.root });

      assert.equal(result.exitCode, 4);
      assert.equal(result.json.error, 'compiled_state_not_found');
      assert.match(result.json.message, /compiled state not found/i);
      assert.equal(result.json.suggestion, 'Run `agentpack author build <target>` first.');
    } finally {
      repo.cleanup();
    }
  });
});
