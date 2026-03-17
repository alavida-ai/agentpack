import { resolve, relative } from 'node:path';

export const claudeAdapter = {
  name: 'claude',
  materialize(repoRoot, selection) {
    return selection.exports.map((skill) => {
      const materializedSource = skill.runtimePath || skill.skillPath;

      return {
        skill: skill.id,
        packageName: skill.packageName || null,
        runtimeName: skill.name,
        target: `.claude/skills/${skill.name}`,
        mode: 'symlink',
        source: relative(repoRoot, resolve(repoRoot, materializedSource)).split('\\').join('/'),
        sourceSkillPath: relative(repoRoot, resolve(repoRoot, skill.skillPath)).split('\\').join('/'),
        sourceSkillFile: skill.skillFile,
      };
    });
  },
};
