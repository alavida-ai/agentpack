import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, readCompiledState, runCLIJson } from './fixtures.js';

describe('agentpack compiled state', () => {
  it('builds compiled state deterministically for the same compiler-mode skill', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-deterministic',
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

    try {
      let result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      const first = readCompiledState(repo.root);

      result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      const second = readCompiledState(repo.root);

      delete first.generated_at;
      delete second.generated_at;

      assert.deepEqual(second, first);
    } finally {
      repo.cleanup();
    }
  });

  it('captures named skill imports, source bindings, and contextual edges in compiled state', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-shape',
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
import prd, { proto-persona as persona } from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Use [the proto persona workflow](skill:persona){context="for shaping the target user profile"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const compiled = readCompiledState(repo.root);
      assert.equal(compiled.skills[0].packageName, '@alavida/prd-agent');
      assert.deepEqual(
        compiled.skills[0].skillImports.map((entry) => entry.target).sort(),
        ['@alavida/prd-development', '@alavida/prd-development:proto-persona']
      );
      assert.deepEqual(
        compiled.skills[0].sourceBindings.map((entry) => entry.sourcePath),
        ['domains/product/knowledge/prd-principles.md']
      );
      assert.deepEqual(
        compiled.edges.map((edge) => ({ kind: edge.kind, target: edge.target, occurrenceCount: edge.occurrenceCount })),
        [
          {
            kind: 'skill_usage',
            target: '@alavida/prd-development',
            occurrenceCount: 1,
          },
          {
            kind: 'skill_usage',
            target: '@alavida/prd-development:proto-persona',
            occurrenceCount: 1,
          },
          {
            kind: 'source_usage',
            target: 'domains/product/knowledge/prd-principles.md',
            occurrenceCount: 1,
          },
        ]
      );
    } finally {
      repo.cleanup();
    }
  });
});
