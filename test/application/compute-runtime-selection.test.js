import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRuntimeSelectionFromCompiledState } from '../../packages/agentpack/src/application/skills/compute-runtime-selection.js';

function createCompiledStateFixture() {
  return {
    version: 2,
    active_package: '@alavida/planning-kit',
    packages: {
      '@alavida/planning-kit': {
        packageName: '@alavida/planning-kit',
        root_skill: 'skill:planning-kit',
        root_export: '@alavida/planning-kit',
        skills: [
          {
            id: 'skill:planning-kit',
            exportId: '@alavida/planning-kit',
            name: 'planning-kit',
            packageName: '@alavida/planning-kit',
            skillImports: [
              { target: '@alavida/planning-kit:kickoff' },
            ],
            sourceBindings: [],
            runtimePath: 'skills/planning-kit/dist/planning-kit',
            runtimeFile: 'skills/planning-kit/dist/planning-kit/SKILL.md',
            skillPath: 'skills/planning-kit',
            skillFile: 'skills/planning-kit/SKILL.md',
          },
          {
            id: 'skill:planning-kit:kickoff',
            exportId: '@alavida/planning-kit:kickoff',
            name: 'planning-kit:kickoff',
            packageName: '@alavida/planning-kit',
            skillImports: [],
            sourceBindings: [
              { sourcePath: 'domains/planning/knowledge/kickoff.md' },
            ],
            runtimePath: 'skills/planning-kit/dist/planning-kit:kickoff',
            runtimeFile: 'skills/planning-kit/dist/planning-kit:kickoff/SKILL.md',
            skillPath: 'skills/planning-kit/skills/kickoff',
            skillFile: 'skills/planning-kit/skills/kickoff/SKILL.md',
          },
          {
            id: 'skill:planning-kit:retro',
            exportId: '@alavida/planning-kit:retro',
            name: 'planning-kit:retro',
            packageName: '@alavida/planning-kit',
            skillImports: [],
            sourceBindings: [
              { sourcePath: 'domains/planning/knowledge/retro.md' },
            ],
            runtimePath: 'skills/planning-kit/dist/planning-kit:retro',
            runtimeFile: 'skills/planning-kit/dist/planning-kit:retro/SKILL.md',
            skillPath: 'skills/planning-kit/skills/retro',
            skillFile: 'skills/planning-kit/skills/retro/SKILL.md',
          },
        ],
        edges: [
          {
            source: '@alavida/planning-kit',
            target: '@alavida/planning-kit:kickoff',
            kind: 'skill_usage',
          },
        ],
      },
    },
  };
}

describe('computeRuntimeSelectionFromCompiledState', () => {
  it('returns all package exports in package mode', () => {
    const selection = computeRuntimeSelectionFromCompiledState(createCompiledStateFixture(), {
      mode: 'package',
      packageName: '@alavida/planning-kit',
    });

    assert.equal(selection.mode, 'package');
    assert.equal(selection.packageName, '@alavida/planning-kit');
    assert.deepEqual(
      selection.exports.map((entry) => entry.exportId),
      [
        '@alavida/planning-kit',
        '@alavida/planning-kit:kickoff',
        '@alavida/planning-kit:retro',
      ]
    );
    assert.deepEqual(
      selection.sources.map((entry) => entry.path),
      [
        'domains/planning/knowledge/kickoff.md',
        'domains/planning/knowledge/retro.md',
      ]
    );
  });

  it('returns only the selected export closure in closure mode', () => {
    const selection = computeRuntimeSelectionFromCompiledState(createCompiledStateFixture(), {
      mode: 'closure',
      packageName: '@alavida/planning-kit',
      exportId: '@alavida/planning-kit',
    });

    assert.equal(selection.mode, 'closure');
    assert.deepEqual(
      selection.exports.map((entry) => entry.exportId),
      [
        '@alavida/planning-kit',
        '@alavida/planning-kit:kickoff',
      ]
    );
    assert.deepEqual(
      selection.sources.map((entry) => entry.path),
      ['domains/planning/knowledge/kickoff.md']
    );
  });
});
