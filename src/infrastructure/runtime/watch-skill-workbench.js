import { watch } from 'node:fs';
import { join } from 'node:path';
import { parseSkillFrontmatterFile } from '../../domain/skills/skill-model.js';

export function watchSkillWorkbench(repoRoot, skillDir, onRefresh) {
  const watchers = [];
  let timer = null;

  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      onRefresh();
    }, 50);
  };

  const watchPath = (pathValue) => {
    try {
      const watcher = watch(pathValue, refresh);
      watchers.push(watcher);
    } catch {
      // Ignore paths that cannot be watched for now.
    }
  };

  const skillFile = join(skillDir, 'SKILL.md');
  const packageJsonPath = join(skillDir, 'package.json');
  watchPath(skillFile);
  watchPath(packageJsonPath);

  const metadata = parseSkillFrontmatterFile(skillFile);
  for (const source of metadata.sources) {
    watchPath(join(repoRoot, source));
  }

  return {
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
