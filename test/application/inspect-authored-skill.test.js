import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../integration/fixtures.js';
import { inspectAuthoredSkillUseCase } from '../../packages/agentpack/src/application/skills/inspect-authored-skill.js';

describe('inspectAuthoredSkillUseCase', () => {
  it('inspects a multi-skill package as a package result', () => {
    const repo = createScenario({
      name: 'inspect-authored-skill-package',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'skills/kickoff/SKILL.md': `---
name: planning-kit:kickoff
description: Plan the kickoff.
---

\`\`\`agentpack
\`\`\`
`,
            'skills/recap/SKILL.md': `---
name: planning-kit:recap
description: Plan the recap.
---

\`\`\`agentpack
\`\`\`
`,
          },
        },
      ],
    });

    try {
      const result = inspectAuthoredSkillUseCase('@alavida-ai/planning-kit', { cwd: repo.root });

      assert.equal(result.kind, 'package');
      assert.equal(result.packageName, '@alavida-ai/planning-kit');
      assert.deepEqual(
        result.exports.map((entry) => entry.name).sort(),
        ['planning-kit:kickoff', 'planning-kit:recap']
      );
    } finally {
      repo.cleanup();
    }
  });
});
