import { join, resolve, relative } from 'node:path';
import { ensureSkillLink } from '../materialize-skills.js';
import { normalizeDisplayPath } from '../../../domain/skills/skill-model.js';

export const claudeAdapter = {
  name: 'claude',
  materialize(repoRoot, compiledState) {
    return compiledState.skills.map((skill) => {
      const target = ensureSkillLink(
        repoRoot,
        '.claude',
        skill.name,
        resolve(repoRoot, skill.skillPath),
        normalizeDisplayPath
      );

      return {
        skill: skill.id,
        packageName: skill.packageName || null,
        runtimeName: skill.name,
        target,
        mode: 'symlink',
        source: relative(repoRoot, resolve(repoRoot, skill.skillPath)).split('\\').join('/'),
        sourceSkillPath: relative(repoRoot, resolve(repoRoot, skill.skillPath)).split('\\').join('/'),
        sourceSkillFile: skill.skillFile,
      };
    });
  },
};
