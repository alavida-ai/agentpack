import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createTempRepo, readMaterializationState } from '../integration/fixtures.js';
import { applyRuntimeMaterializationPlanUseCase } from '../../packages/agentpack/src/application/skills/apply-runtime-materialization.js';

describe('applyRuntimeMaterializationPlanUseCase', () => {
  it('applies adapter outputs and prunes old materializations through one shared path', () => {
    const repo = createTempRepo('apply-runtime-materialization');

    try {
      const firstSkillDir = join(repo.root, 'skills', 'alpha');
      mkdirSync(firstSkillDir, { recursive: true });
      writeFileSync(join(firstSkillDir, 'SKILL.md'), '# Alpha\n');

      const secondSkillDir = join(repo.root, 'skills', 'beta');
      mkdirSync(secondSkillDir, { recursive: true });
      writeFileSync(join(secondSkillDir, 'SKILL.md'), '# Beta\n');

      applyRuntimeMaterializationPlanUseCase(repo.root, {
        claude: [
          {
            packageName: '@alavida/alpha',
            skillName: 'alpha',
            runtimeName: 'alpha',
            sourceSkillPath: 'skills/alpha',
            sourceSkillFile: 'skills/alpha/SKILL.md',
            target: '.claude/skills/alpha',
            mode: 'symlink',
          },
        ],
        agents: [
          {
            packageName: '@alavida/alpha',
            skillName: 'alpha',
            runtimeName: 'alpha',
            sourceSkillPath: 'skills/alpha',
            sourceSkillFile: 'skills/alpha/SKILL.md',
            target: '.agents/skills/alpha',
            mode: 'symlink',
          },
        ],
      });

      applyRuntimeMaterializationPlanUseCase(repo.root, {
        claude: [
          {
            packageName: '@alavida/beta',
            skillName: 'beta',
            runtimeName: 'beta',
            sourceSkillPath: 'skills/beta',
            sourceSkillFile: 'skills/beta/SKILL.md',
            target: '.claude/skills/beta',
            mode: 'symlink',
          },
        ],
        agents: [],
      });

      const state = readMaterializationState(repo.root);
      assert.deepEqual(state.adapters.agents, []);
      assert.equal(state.adapters.claude.length, 1);
      assert.equal(state.adapters.claude[0].runtimeName, 'beta');
      assert.equal(
        resolve(repo.root, readlinkSync(join(repo.root, '.claude', 'skills', 'beta'))),
        secondSkillDir
      );
      assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'alpha')), false);
    } finally {
      repo.cleanup();
    }
  });
});
