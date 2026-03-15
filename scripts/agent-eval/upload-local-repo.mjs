import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'eval-results',
  'playwright-report',
  'test-results',
]);

export async function uploadLocalRepoToSandbox({
  localRoot,
  remoteRoot,
  sandbox,
}) {
  if (!sandbox?.files?.write) {
    throw new Error('sandbox.files.write is required');
  }

  const files = [];
  collectFiles(localRoot, localRoot, files);

  const payload = files.map((path) => ({
    path: join(remoteRoot, relative(localRoot, path)),
    data: readFileSync(path),
  }));

  if (payload.length > 0) {
    await sandbox.files.write(payload);
  }

  return payload.map((entry) => entry.path);
}

function collectFiles(root, current, files) {
  for (const entry of readdirSync(current)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(current, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(root, fullPath, files);
      continue;
    }
    if (stats.isFile()) {
      files.push(fullPath);
    }
  }
}
