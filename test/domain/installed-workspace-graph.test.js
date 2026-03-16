import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../integration/scenario-builder.js';
import { buildInstalledWorkspaceGraph } from '../../packages/agentpack/src/domain/skills/installed-workspace-graph.js';

function rootSkillDocument() {
  return `---
name: prd-development
description: Primary package skill.
---

\`\`\`agentpack
import protoPersona from skill "@alavida-ai/prd-development:proto-persona"
\`\`\`

Use [protoPersona](skill:protoPersona){context="primary export delegates to named subskill"}.
`;
}

function namedSkillDocument(name) {
  return `---
name: ${name}
description: ${name} skill.
---

\`\`\`agentpack
\`\`\`

# ${name}
`;
}

describe('installed workspace graph', () => {
  it('discovers installed primary and named exports and derives enabled runtimes from materialization state', () => {
    const repo = createScenario({
      name: 'installed-workspace-graph',
      files: {
        '.agentpack/materialization-state.json': `${JSON.stringify({
          version: 1,
          generated_at: '2026-03-16T00:00:00.000Z',
          adapters: {
            claude: [
              {
                packageName: '@alavida-ai/prd-development',
                skillName: 'prd-development',
                runtimeName: 'prd-development',
                sourceSkillPath: 'node_modules/@alavida-ai/prd-development',
                sourceSkillFile: 'node_modules/@alavida-ai/prd-development/SKILL.md',
                target: '.claude/skills/prd-development',
                mode: 'symlink',
              },
            ],
            agents: [
              {
                packageName: '@alavida-ai/prd-development',
                skillName: 'proto-persona',
                runtimeName: 'prd-development:proto-persona',
                sourceSkillPath: 'node_modules/@alavida-ai/prd-development/skills/proto-persona',
                sourceSkillFile: 'node_modules/@alavida-ai/prd-development/skills/proto-persona/SKILL.md',
                target: '.agents/skills/prd-development:proto-persona',
                mode: 'symlink',
              },
            ],
          },
        }, null, 2)}\n`,
      },
      packages: [
        {
          relPath: 'node_modules/@alavida-ai/prd-development',
          packageJson: {
            name: '@alavida-ai/prd-development',
            version: '0.1.1',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': rootSkillDocument(),
            'skills/proto-persona/SKILL.md': namedSkillDocument('proto-persona'),
            'skills/problem-statement/SKILL.md': namedSkillDocument('problem-statement'),
          },
        },
      ],
    });

    try {
      const graph = buildInstalledWorkspaceGraph(repo.root);
      const pkg = graph.packages['@alavida-ai/prd-development'];

      assert.equal(pkg.primaryExport, '@alavida-ai/prd-development');
      assert.deepEqual(
        pkg.exports,
        [
          '@alavida-ai/prd-development',
          '@alavida-ai/prd-development:problem-statement',
          '@alavida-ai/prd-development:proto-persona',
        ]
      );
      assert.equal(graph.exports['@alavida-ai/prd-development'].runtimeName, 'prd-development');
      assert.equal(
        graph.exports['@alavida-ai/prd-development:proto-persona'].runtimeName,
        'prd-development:proto-persona'
      );
      assert.deepEqual(graph.exports['@alavida-ai/prd-development'].enabled, ['claude']);
      assert.deepEqual(graph.exports['@alavida-ai/prd-development:proto-persona'].enabled, ['agents']);
    } finally {
      repo.cleanup();
    }
  });
});

