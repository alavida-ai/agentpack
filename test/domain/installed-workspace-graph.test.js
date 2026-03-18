import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createScenario } from '../integration/scenario-builder.js';
import { buildInstalledWorkspaceGraph } from '../../packages/agentpack/src/domain/skills/installed-workspace-graph.js';

function runtimeSkillDocument(name, description) {
  return `---
name: ${name}
description: ${description}
---
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
            files: ['dist'],
          },
          files: {
            'dist/agentpack.json': `${JSON.stringify({
              version: 1,
              packageName: '@alavida-ai/prd-development',
              packageVersion: '0.1.1',
              exports: [
                {
                  id: '@alavida-ai/prd-development',
                  declaredName: 'prd-development',
                  moduleName: 'prd-development',
                  runtimeName: 'prd-development',
                  description: 'Primary package skill.',
                  isPrimary: true,
                  runtimeDir: 'dist/prd-development',
                  runtimeFile: 'dist/prd-development/SKILL.md',
                  compiled: {
                    skillImports: {
                      protoPersona: {
                        kind: 'skill',
                        localName: 'protoPersona',
                        packageSpecifier: '@alavida-ai/prd-development',
                        importedName: 'proto-persona',
                        target: '@alavida-ai/prd-development:proto-persona',
                      },
                    },
                    sourceBindings: {},
                    occurrences: [],
                    edges: [],
                  },
                },
                {
                  id: '@alavida-ai/prd-development:proto-persona',
                  declaredName: 'prd-development:proto-persona',
                  moduleName: 'proto-persona',
                  runtimeName: 'prd-development:proto-persona',
                  description: 'Proto persona skill.',
                  isPrimary: false,
                  runtimeDir: 'dist/prd-development:proto-persona',
                  runtimeFile: 'dist/prd-development:proto-persona/SKILL.md',
                  compiled: {
                    skillImports: {},
                    sourceBindings: {},
                    occurrences: [],
                    edges: [],
                  },
                },
                {
                  id: '@alavida-ai/prd-development:problem-statement',
                  declaredName: 'prd-development:problem-statement',
                  moduleName: 'problem-statement',
                  runtimeName: 'prd-development:problem-statement',
                  description: 'Problem statement skill.',
                  isPrimary: false,
                  runtimeDir: 'dist/prd-development:problem-statement',
                  runtimeFile: 'dist/prd-development:problem-statement/SKILL.md',
                  compiled: {
                    skillImports: {},
                    sourceBindings: {},
                    occurrences: [],
                    edges: [],
                  },
                },
              ],
            }, null, 2)}\n`,
            'dist/prd-development/SKILL.md': runtimeSkillDocument('prd-development', 'Primary package skill.'),
            'dist/prd-development:proto-persona/SKILL.md': runtimeSkillDocument('prd-development:proto-persona', 'Proto persona skill.'),
            'dist/prd-development:problem-statement/SKILL.md': runtimeSkillDocument('prd-development:problem-statement', 'Problem statement skill.'),
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

  it('discovers installed skill packages from an ancestor node_modules for nested workspace packages', () => {
    const repo = createScenario({
      name: 'installed-workspace-graph-hoisted',
      files: {
        'package.json': `${JSON.stringify({
          name: '@alavida-ai/workspaces',
          private: true,
          version: '0.1.0',
          workspaces: ['research-analyst'],
        }, null, 2)}\n`,
        'research-analyst/package.json': `${JSON.stringify({
          name: '@alavida-ai/workspace-research-analyst',
          private: true,
          version: '0.1.0',
          dependencies: {
            '@alavida-ai/prd-development': '0.1.1',
          },
        }, null, 2)}\n`,
      },
      packages: [
        {
          relPath: 'node_modules/@alavida-ai/prd-development',
          packageJson: {
            name: '@alavida-ai/prd-development',
            version: '0.1.1',
            files: ['dist'],
          },
          files: {
            'dist/agentpack.json': `${JSON.stringify({
              version: 1,
              packageName: '@alavida-ai/prd-development',
              packageVersion: '0.1.1',
              exports: [
                {
                  id: '@alavida-ai/prd-development',
                  declaredName: 'prd-development',
                  moduleName: 'prd-development',
                  runtimeName: 'prd-development',
                  description: 'Primary package skill.',
                  isPrimary: true,
                  runtimeDir: 'dist/prd-development',
                  runtimeFile: 'dist/prd-development/SKILL.md',
                  compiled: {
                    skillImports: {},
                    sourceBindings: {},
                    occurrences: [],
                    edges: [],
                  },
                },
              ],
            }, null, 2)}\n`,
            'dist/prd-development/SKILL.md': runtimeSkillDocument('prd-development', 'Primary package skill.'),
          },
        },
      ],
    });

    try {
      const workspaceRoot = join(repo.root, 'research-analyst');
      const graph = buildInstalledWorkspaceGraph(workspaceRoot);
      assert.deepEqual(Object.keys(graph.packages), ['@alavida-ai/prd-development']);
      assert.equal(graph.packages['@alavida-ai/prd-development'].primaryExport, '@alavida-ai/prd-development');
    } finally {
      repo.cleanup();
    }
  });

  it('discovers installed exports from dist skill directories when no manifest is published', () => {
    const repo = createScenario({
      name: 'installed-workspace-graph-dist-only',
      packages: [
        {
          relPath: 'node_modules/@alavida-ai/research-analyst',
          packageJson: {
            name: '@alavida-ai/research-analyst',
            version: '0.2.0',
            files: ['dist'],
          },
          files: {
            'dist/research-analyst/SKILL.md': runtimeSkillDocument('research-analyst', 'Primary package skill.'),
            'dist/research-analyst:research-flow/SKILL.md': runtimeSkillDocument('research-analyst:research-flow', 'Research flow skill.'),
          },
        },
      ],
    });

    try {
      const graph = buildInstalledWorkspaceGraph(repo.root);
      const pkg = graph.packages['@alavida-ai/research-analyst'];

      assert.equal(pkg.primaryExport, '@alavida-ai/research-analyst');
      assert.deepEqual(
        pkg.exports,
        [
          '@alavida-ai/research-analyst',
          '@alavida-ai/research-analyst:research-flow',
        ]
      );
      assert.equal(graph.exports['@alavida-ai/research-analyst'].runtimeName, 'research-analyst');
      assert.equal(graph.exports['@alavida-ai/research-analyst:research-flow'].runtimeName, 'research-analyst:research-flow');
    } finally {
      repo.cleanup();
    }
  });
});
