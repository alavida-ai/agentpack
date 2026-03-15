import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario } from '../../test/integration/scenario-builder.js';
import { buildCompiledStateUseCase } from '../../packages/agentpack/src/application/skills/build-compiled-state.js';
import { materializeCompiledStateUseCase } from '../../packages/agentpack/src/application/skills/materialize-compiled-state.js';

export async function createSyntheticRepo(fixture) {
  switch (fixture) {
    case 'new-skill-authoring':
      return createScenario({
        name: 'agent-eval-new-skill-authoring',
        files: {
          'README.md': '# Agent Eval Repo\n',
          'domains/product/knowledge/prd-principles.md': '# PRD Principles\n\nUse evidence and clear scope.\n',
          'domains/product/knowledge/market-map.md': '# Market Map\n\nList competitors and adjacent opportunities.\n',
        },
      });
    case 'stale-repair': {
      const repo = createScenario({
        name: 'agent-eval-stale-repair',
        sources: {
          'domains/product/knowledge/prd-principles.md': '# PRD Principles\n\nVersion 1 guidance.\n',
        },
        packages: [
          {
            relPath: 'skills/prd-agent',
            packageJson: {
              name: '@alavida/prd-agent',
              version: '1.0.0',
              files: ['SKILL.md'],
              agentpack: {
                primarySkill: 'prd-agent',
                skills: {
                  'prd-agent': { path: 'SKILL.md' },
                },
              },
            },
            skillMd: `---
name: prd-agent
description: Source-backed PRD skill.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
          },
        ],
      });

      buildCompiledStateUseCase('@alavida/prd-agent', { cwd: repo.root });
      writeFileSync(
        join(repo.root, 'domains/product/knowledge/prd-principles.md'),
        '# PRD Principles\n\nVersion 2 guidance with changed content.\n',
        'utf8',
      );
      return repo;
    }
    case 'runtime-drift': {
      const repo = createScenario({
        name: 'agent-eval-runtime-drift',
        sources: {
          'domains/product/knowledge/prd-principles.md': '# PRD Principles\n\nStable guidance.\n',
        },
        packages: [
          {
            relPath: 'skills/prd-agent',
            packageJson: {
              name: '@alavida/prd-agent',
              version: '1.0.0',
              files: ['SKILL.md'],
              agentpack: {
                primarySkill: 'prd-agent',
                skills: {
                  'prd-agent': { path: 'SKILL.md' },
                },
              },
            },
            skillMd: `---
name: prd-agent
description: Source-backed PRD skill.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
          },
        ],
      });

      buildCompiledStateUseCase('@alavida/prd-agent', { cwd: repo.root });
      materializeCompiledStateUseCase({ cwd: repo.root });

      const materializedPath = join(repo.root, '.claude/skills/prd-agent/SKILL.md');
      const current = readFileSync(materializedPath, 'utf8');
      writeFileSync(materializedPath, `${current}\n<!-- drift -->\n`, 'utf8');
      return repo;
    }
    case 'dev-dashboard':
      return createScenario({
        name: 'agent-eval-dev-dashboard',
        sources: {
          'domains/product/knowledge/prd-principles.md': '# PRD Principles\n\nUse evidence and clear scope.\n',
        },
        packages: [
          {
            relPath: 'skills/methodology',
            packageJson: {
              name: '@alavida/methodology-gary-provost',
              version: '1.0.0',
              files: ['SKILL.md'],
              agentpack: {
                primarySkill: 'methodology-gary-provost',
                skills: {
                  'methodology-gary-provost': { path: 'SKILL.md' },
                },
              },
            },
            skillMd: `---
name: methodology-gary-provost
description: Sentence rhythm guidance.
---

\`\`\`agentpack
\`\`\`

# Gary Provost
`,
          },
          {
            relPath: 'skills/copywriting',
            packageJson: {
              name: '@alavida/value-copywriting',
              version: '1.0.0',
              files: ['SKILL.md'],
              dependencies: {
                '@alavida/methodology-gary-provost': '^1.0.0',
              },
              agentpack: {
                primarySkill: 'value-copywriting',
                skills: {
                  'value-copywriting': { path: 'SKILL.md' },
                },
              },
            },
            skillMd: `---
name: value-copywriting
description: Copy with source-backed proof.
---

\`\`\`agentpack
import methodology from skill "@alavida/methodology-gary-provost"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the methodology guidance](skill:methodology){context="for sentence rhythm and style"}.
Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
          },
        ],
      });
    case 'empty-consumer-repo':
      return createScenario({
        name: 'agent-eval-empty-consumer-repo',
        files: {
          'README.md': '# Empty consumer repo\n',
        },
      });
    default:
      throw new Error(`synthetic fixture not implemented: ${fixture}`);
  }
}
