import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createScenario } from '../integration/scenario-builder.js';
import { buildAuthoredWorkspaceGraph } from '../../packages/agentpack/src/domain/skills/workspace-graph.js';

function validRootSkillDocument() {
  return `---
name: planning-kit
description: Primary planning package skill.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="primary package entrypoint delegates to the kickoff workflow"}.
`;
}

function validNamedSkillDocument(name, sourcePath) {
  return `---
name: planning-kit:${name}
description: ${name} workflow.
---

\`\`\`agentpack
source knowledge = "${sourcePath}"
\`\`\`

Use [knowledge](source:knowledge){context="source material for ${name}"}.
`;
}

describe('authored workspace graph', () => {
  it('discovers the root SKILL.md as the package primary export and named exports under agentpack.root', () => {
    const repo = createScenario({
      name: 'workspace-graph-primary-export',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': validRootSkillDocument(),
            'skills/kickoff/SKILL.md': validNamedSkillDocument('kickoff', 'domains/planning/knowledge/kickoff.md'),
            'skills/recap/SKILL.md': validNamedSkillDocument('recap', 'domains/planning/knowledge/recap.md'),
          },
        },
      ],
      sources: {
        'domains/planning/knowledge/kickoff.md': '# Kickoff\n',
        'domains/planning/knowledge/recap.md': '# Recap\n',
      },
    });

    try {
      const graph = buildAuthoredWorkspaceGraph(repo.root);
      const pkg = graph.packages['@alavida-ai/planning-kit'];

      assert.equal(pkg.primaryExport, '@alavida-ai/planning-kit');
      assert.deepEqual(
        pkg.exports.slice().sort(),
        ['@alavida-ai/planning-kit', '@alavida-ai/planning-kit:kickoff', '@alavida-ai/planning-kit:recap']
      );

      assert.equal(graph.targets['@alavida-ai/planning-kit'].kind, 'package');
      assert.equal(graph.targets['@alavida-ai/planning-kit:kickoff'].kind, 'export');
      assert.equal(graph.targets['workbenches/planning-kit'].kind, 'package');
      assert.equal(graph.targets['workbenches/planning-kit/skills/kickoff'].kind, 'export');
    } finally {
      repo.cleanup();
    }
  });

  it('keeps the package visible when one named export fails compilation', () => {
    const repo = createScenario({
      name: 'workspace-graph-invalid-export',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': validRootSkillDocument(),
            'skills/kickoff/SKILL.md': validNamedSkillDocument('kickoff', 'domains/planning/knowledge/kickoff.md'),
            'skills/broken-skill/SKILL.md': `---
name: broken-skill
description: Broken workflow.
---

\`\`\`agentpack
source knowledge from "domains/planning/knowledge/kickoff.md"
\`\`\`
`,
          },
        },
      ],
      sources: {
        'domains/planning/knowledge/kickoff.md': '# Kickoff\n',
      },
    });

    try {
      const graph = buildAuthoredWorkspaceGraph(repo.root);
      const pkg = graph.packages['@alavida-ai/planning-kit'];

      assert.equal(pkg.status, 'invalid');
      assert.equal(graph.exports['@alavida-ai/planning-kit'].status, 'valid');
      assert.equal(graph.exports['@alavida-ai/planning-kit:kickoff'].status, 'valid');
      assert.equal(graph.exports['@alavida-ai/planning-kit:broken-skill'].status, 'invalid');
    } finally {
      repo.cleanup();
    }
  });
});
