import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findPackageDirByName(repoRoot, packageName) {
  const stack = [repoRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;

      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.name !== 'package.json') continue;

      try {
        const pkg = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (pkg.name === packageName) {
          return dirname(fullPath);
        }
      } catch {
        // Ignore invalid package files outside the current target set.
      }
    }
  }

  return null;
}
