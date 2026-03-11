import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReverseDependencies,
  buildSkillStatusMap,
  resolveDependencyClosure,
} from '../../src/domain/skills/skill-graph.js';

describe('skill graph', () => {
  it('builds reverse dependencies for a graph', () => {
    const nodes = new Map([
      ['@alavida/core', { packageName: '@alavida/core', dependencies: [] }],
      ['@alavida/a', { packageName: '@alavida/a', dependencies: ['@alavida/core'] }],
      ['@alavida/b', { packageName: '@alavida/b', dependencies: ['@alavida/core'] }],
    ]);

    const reverse = buildReverseDependencies(nodes);

    assert.deepEqual(reverse.get('@alavida/core'), ['@alavida/a', '@alavida/b']);
    assert.deepEqual(reverse.get('@alavida/a'), []);
  });

  it('marks dependents as affected when a dependency is stale', () => {
    const nodes = new Map([
      ['@alavida/core', { packageName: '@alavida/core', dependencies: [] }],
      ['@alavida/feature', { packageName: '@alavida/feature', dependencies: ['@alavida/core'] }],
      ['@alavida/top', { packageName: '@alavida/top', dependencies: ['@alavida/feature'] }],
    ]);

    const statusMap = buildSkillStatusMap(nodes, new Set(['@alavida/core']));

    assert.equal(statusMap.get('@alavida/core'), 'stale');
    assert.equal(statusMap.get('@alavida/feature'), 'affected');
    assert.equal(statusMap.get('@alavida/top'), 'affected');
  });

  it('resolves direct and transitive dependency closure', () => {
    const graph = new Map([
      ['@alavida/a', { packageName: '@alavida/a', requires: ['@alavida/b', '@alavida/c'] }],
      ['@alavida/b', { packageName: '@alavida/b', requires: ['@alavida/d'] }],
      ['@alavida/c', { packageName: '@alavida/c', requires: [] }],
      ['@alavida/d', { packageName: '@alavida/d', requires: [] }],
    ]);

    const { resolved, unresolved } = resolveDependencyClosure(['@alavida/a'], {
      resolveNode(packageName) {
        return graph.get(packageName) || null;
      },
    });

    assert.deepEqual(
      resolved.map((entry) => entry.packageName),
      ['@alavida/a', '@alavida/b', '@alavida/c', '@alavida/d']
    );
    assert.deepEqual(unresolved, []);
  });
});
