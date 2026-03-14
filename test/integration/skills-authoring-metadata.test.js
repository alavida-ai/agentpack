import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addMultiSkillPackage, addPackagedSkill, createRepoFromFixture, createTempRepo } from './fixtures.js';
import { generateBuildState, generateSkillsCatalog } from '../../packages/agentpack/src/lib/skills.js';

describe('agentpack skills authoring metadata generation', () => {
  it('generates skills catalog deterministically from the fixture monorepo', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-catalog-generation');

    try {
      const generated = generateSkillsCatalog({ cwd: repo.root });
      const expected = JSON.parse(
        readFileSync(join(repo.root, '.agentpack', 'catalog.json'), 'utf-8')
      );

      assert.deepEqual(generated, expected);
    } finally {
      repo.cleanup();
    }
  });

  it('generates build-state deterministically from the fixture monorepo', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-build-state-generation');

    try {
      const generated = generateBuildState({ cwd: repo.root });
      const expected = JSON.parse(
        readFileSync(join(repo.root, '.agentpack', 'build-state.json'), 'utf-8')
      );

      assert.deepEqual(generated, expected);
    } finally {
      repo.cleanup();
    }
  });

  it('includes authored multi-skill package exports in generated catalog and build-state', () => {
    const repo = createTempRepo('skills-authoring-multi-skill');

    try {
      addMultiSkillPackage(repo.root, 'domains/operations/workbenches/creator/planning-kit', {
        packageJson: {
          name: '@alavida/planning-kit',
          version: '0.1.0',
          files: ['skills'],
          agentpack: {
            skills: {
              kickoff: { path: 'skills/kickoff/SKILL.md' },
              recap: { path: 'skills/recap/SKILL.md' },
            },
          },
        },
        skills: [
          {
            path: 'skills/kickoff',
            skillMd: `---
name: kickoff
description: Run a kickoff workflow.
metadata:
  sources: []
requires:
  - @alavida/planning-kit:recap
---

# Kickoff
`,
          },
          {
            path: 'skills/recap',
            skillMd: `---
name: recap
description: Run a recap workflow.
metadata:
  sources: []
requires: []
---

# Recap
`,
          },
        ],
      });

      const catalog = generateSkillsCatalog({ cwd: repo.root });
      const buildState = generateBuildState({ cwd: repo.root });

      assert.deepEqual(Object.keys(catalog.skills).sort(), [
        '@alavida/planning-kit:kickoff',
        '@alavida/planning-kit:recap',
      ]);
      assert.equal(
        catalog.skills['@alavida/planning-kit:kickoff'].skill_file,
        'domains/operations/workbenches/creator/planning-kit/skills/kickoff/SKILL.md'
      );
      assert.deepEqual(
        catalog.skills['@alavida/planning-kit:kickoff'].requires,
        ['@alavida/planning-kit:recap']
      );
      assert.equal(
        buildState.skills['@alavida/planning-kit:recap'].skill_file,
        'domains/operations/workbenches/creator/planning-kit/skills/recap/SKILL.md'
      );
    } finally {
      repo.cleanup();
    }
  });

  it('records wrapper metadata in generated authored metadata', () => {
    const repo = createTempRepo('skills-authoring-wraps');

    try {
      addPackagedSkill(repo.root, 'skills/branded-diagram', {
        skillMd: `---
name: branded-diagram
description: Render the branded diagram workflow.
wraps: "@vendor/diagram-kit:generate-diagram"
overrides:
  - references/brand.md
metadata:
  sources: []
requires: []
---

# Branded Diagram
`,
        packageJson: {
          name: '@alavida-ai/branded-diagram',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const catalog = generateSkillsCatalog({ cwd: repo.root });
      const buildState = generateBuildState({ cwd: repo.root });

      assert.equal(
        catalog.skills['@alavida-ai/branded-diagram'].wraps,
        '@vendor/diagram-kit:generate-diagram'
      );
      assert.deepEqual(
        catalog.skills['@alavida-ai/branded-diagram'].overrides,
        ['references/brand.md']
      );
      assert.equal(
        buildState.skills['@alavida-ai/branded-diagram'].wraps,
        '@vendor/diagram-kit:generate-diagram'
      );
      assert.deepEqual(
        buildState.skills['@alavida-ai/branded-diagram'].overrides,
        ['references/brand.md']
      );
    } finally {
      repo.cleanup();
    }
  });
});
