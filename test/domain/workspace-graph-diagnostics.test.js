import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../integration/scenario-builder.js';
import { buildAuthoredWorkspaceGraph } from '../../packages/agentpack/src/domain/skills/workspace-graph.js';

describe('authored workspace graph diagnostics', () => {
  it('attaches actionable nextSteps to invalid exports', () => {
    const repo = createScenario({
      name: 'workspace-graph-diagnostics',
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
            'SKILL.md': `---
name: planning-kit
description: Primary planning package skill.
---

\`\`\`agentpack
\`\`\`
`,
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
    });

    try {
      const graph = buildAuthoredWorkspaceGraph(repo.root);
      const diagnostic = graph.exports['@alavida-ai/planning-kit:broken-skill'].diagnostics[0];

      assert.equal(diagnostic.code, 'invalid_agentpack_declaration');
      assert.equal(diagnostic.level, 'error');
      assert.equal(diagnostic.scope, 'export');
      assert.equal(diagnostic.exportId, '@alavida-ai/planning-kit:broken-skill');
      assert.equal(diagnostic.nextSteps[0].action, 'edit_file');
      assert.match(diagnostic.nextSteps[0].reason, /replace unsupported source declaration/i);
    } finally {
      repo.cleanup();
    }
  });
});
