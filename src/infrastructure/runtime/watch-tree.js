import { existsSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';

export function watchDirectoryTree(rootDir, onChange) {
  const watchers = new Map();

  const watchDir = (dirPath) => {
    if (watchers.has(dirPath) || !existsSync(dirPath)) return;

    let entries = [];
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const watcher = watch(dirPath, (_eventType, filename) => {
      if (filename) {
        const changedPath = join(dirPath, String(filename));
        if (existsSync(changedPath)) {
          watchDir(changedPath);
        }
      }

      onChange();
    });

    watchers.set(dirPath, watcher);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      watchDir(join(dirPath, entry.name));
    }
  };

  watchDir(rootDir);

  return {
    close() {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
