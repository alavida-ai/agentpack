import { existsSync, watch } from 'node:fs';
import { join, relative } from 'node:path';
import { watchDirectoryTree } from './watch-tree.js';
import { isGeneratedPackagePath } from '../../domain/skills/generated-package-paths.js';

export function watchSkillWorkbench(repoRoot, {
  packageDir,
  getSelection,
  onRefresh,
} = {}) {
  const sourceWatchers = new Map();
  let timer = null;

  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      syncSourceWatchers();
      onRefresh();
    }, 50);
  };

  const watchPath = (pathValue) => {
    try {
      const watcher = watch(pathValue, refresh);
      return watcher;
    } catch {
      return null;
    }
  };

  const syncSourceWatchers = () => {
    const selection = getSelection?.() || { sources: [] };
    const nextSources = new Set(
      (selection.sources || [])
        .map((source) => join(repoRoot, source.path))
        .filter((pathValue) => existsSync(pathValue))
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

  const packageWatcher = watchDirectoryTree(packageDir, refresh, {
    shouldIncludePath(pathValue) {
      const relativePath = relative(packageDir, pathValue);
      return !isGeneratedPackagePath(relativePath);
    },
  });
  syncSourceWatchers();

  return {
    close() {
      clearTimeout(timer);
      packageWatcher.close();
      for (const watcher of sourceWatchers.values()) watcher.close();
      sourceWatchers.clear();
    },
  };
}
