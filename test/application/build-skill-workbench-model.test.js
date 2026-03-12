import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillWorkbenchModel } from '../../src/application/skills/build-skill-workbench-model.js';

describe('buildSkillWorkbenchModel', () => {
  it('builds a focused graph for one selected skill', () => {
    const result = buildSkillWorkbenchModel({
      repoRoot: '/repo',
      selectedSkill: {
        name: 'value-copywriting',
        packageName: '@alavida/value-copywriting',
        skillFile: '/repo/skills/copywriting/SKILL.md',
        sources: ['domains/value/knowledge/tone-of-voice.md'],
        requires: ['@alavida/research'],
      },
      dependencyRecords: [
        { packageName: '@alavida/research', status: 'current' },
      ],
      sourceStatuses: new Map([['domains/value/knowledge/tone-of-voice.md', 'current']]),
      selectedStatus: 'current',
    });

    assert.equal(result.selected.packageName, '@alavida/value-copywriting');
    assert.equal(result.nodes.length, 3);
    assert.equal(result.edges.length, 2);
    assert.deepEqual(result.edges, [
      {
        source: 'source:domains/value/knowledge/tone-of-voice.md',
        target: '@alavida/value-copywriting',
        kind: 'provenance',
      },
      {
        source: '@alavida/value-copywriting',
        target: '@alavida/research',
        kind: 'requires',
      },
    ]);
  });

  it('explains stale sources and affected dependencies', () => {
    const result = buildSkillWorkbenchModel({
      repoRoot: '/repo',
      selectedSkill: {
        name: 'value-copywriting',
        packageName: '@alavida/value-copywriting',
        skillFile: '/repo/skills/copywriting/SKILL.md',
        sources: ['domains/value/knowledge/selling-points.md'],
        requires: ['@alavida/core-writing'],
      },
      dependencyRecords: [
        { packageName: '@alavida/core-writing', status: 'affected' },
      ],
      sourceStatuses: new Map([['domains/value/knowledge/selling-points.md', 'changed']]),
      selectedStatus: 'stale',
    });

    assert.match(result.selected.explanation, /selling-points\.md/i);
    assert.equal(
      result.nodes.find((node) => node.packageName === '@alavida/core-writing').status,
      'affected'
    );
    assert.equal(
      result.nodes.find((node) => node.path === 'domains/value/knowledge/selling-points.md').explanation,
      'Changed since recorded build-state'
    );
  });
});
