import { readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { compileSkillDocument } from '../../domain/compiler/skill-compiler.js';

export function watchSkillWorkbench(repoRoot, skillDir, onRefresh) {
  const staticWatchers = [];
  const sourceWatchers = new Map();
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
      return watcher;
    } catch {
      // Ignore paths that cannot be watched for now.
      return null;
    }
  };

  const syncSourceWatchers = () => {
    let compiled;
    try {
      compiled = compileSkillDocument(readFileSync(skillFile, 'utf-8'));
    } catch {
      return;
    }

    const nextSources = new Set(
      Object.values(compiled.sourceBindings).map((source) => join(repoRoot, source.sourcePath))
    );

    for (const [pathValue, watcher] of sourceWatchers.entries()) {
      if (nextSources.has(pathValue)) continue;
      watcher.close();
      sourceWatchers.delete(pathValue);
    }

    for (const pathValue of nextSources) {
      if (sourceWatchers.has(pathValue)) continue;
      const watcher = watchPath(pathValue);
      if (watcher) sourceWatchers.set(pathValue, watcher);
    }
  };

  const skillFile = join(skillDir, 'SKILL.md');
  const packageJsonPath = join(skillDir, 'package.json');
  const skillFileWatcher = watch(skillFile, () => {
    syncSourceWatchers();
    refresh();
  });
  staticWatchers.push(skillFileWatcher);
  const packageWatcher = watchPath(packageJsonPath);
  if (packageWatcher) staticWatchers.push(packageWatcher);
  syncSourceWatchers();

  return {
    close() {
      clearTimeout(timer);
      for (const watcher of staticWatchers) watcher.close();
      for (const watcher of sourceWatchers.values()) watcher.close();
    },
  };
}
