import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listStaleSkillsFromCompiledState, inspectStaleSkillFromCompiledState } from '../../packages/agentpack/src/application/skills/list-stale-skills.js';

function createCompiledStateFixture() {
  return {
    version: 2,
    packages: {
      '@alavida/prd-agent': {
        packageName: '@alavida/prd-agent',
        packagePath: 'skills/prd-agent',
        root_skill: 'skill:prd-agent',
        skills: [
          {
            id: 'skill:prd-agent',
            exportId: '@alavida/prd-agent',
            skillPath: 'skills/prd-agent',
            skillFile: 'skills/prd-agent/SKILL.md',
          },
        ],
        sourceFiles: [
          {
            path: 'domains/product/knowledge/prd-principles.md',
            hash: 'sha256:recorded',
          },
        ],
      },
    },
  };
}

describe('list-stale-skills use case', () => {
  it('lists changed sources directly from compiled package state', () => {
    const result = listStaleSkillsFromCompiledState(createCompiledStateFixture(), {
      hashFile: () => 'sha256:current',
      repoRoot: '/tmp/repo',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].packageName, '@alavida/prd-agent');
    assert.equal(result[0].changedSources[0].path, 'domains/product/knowledge/prd-principles.md');
  });

  it('inspects one stale package from the computed stale list', () => {
    const staleSkills = listStaleSkillsFromCompiledState(createCompiledStateFixture(), {
      hashFile: () => 'sha256:current',
      repoRoot: '/tmp/repo',
    });

    const result = inspectStaleSkillFromCompiledState(staleSkills, '@alavida/prd-agent');
    assert.equal(result.packageName, '@alavida/prd-agent');
    assert.equal(result.skillFile, 'skills/prd-agent/SKILL.md');
  });
});
