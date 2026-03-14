import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { NotFoundError } from '../utils/errors.js';

/**
 * Walk up from startDir looking for a directory containing `marker`.
 * Returns the directory path or null.
 */
function walkUp(startDir, marker) {
  let dir = resolve(startDir);
  const root = dirname(dir) === dir ? dir : undefined; // filesystem root

  while (true) {
    if (existsSync(join(dir, marker))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Find the git repo root by walking up from cwd.
 * Throws NotFoundError (exit 4) if not in a git repo.
 */
export function findRepoRoot(cwd = process.cwd()) {
  const root = walkUp(cwd, '.git');
  if (!root) {
    throw new NotFoundError(
      'Not inside a git repository. Run from inside an agentpack repo.',
      { code: 'repo_not_found', suggestion: 'cd into your agentpack knowledge base repo' }
    );
  }
  return root;
}

/**
 * Find workbench context by walking up from cwd looking for workbench.json.
 * Returns { path, config } or null if not inside a workbench.
 * Stops at repo root (won't walk above .git).
 */
export function findWorkbenchContext(cwd = process.cwd()) {
  const repoRoot = findRepoRoot(cwd);
  let dir = resolve(cwd);

  while (true) {
    const wbPath = join(dir, 'workbench.json');
    if (existsSync(wbPath)) {
      const config = JSON.parse(readFileSync(wbPath, 'utf-8'));
      return {
        path: dir,
        relativePath: relative(repoRoot, dir),
        config,
      };
    }
    // Don't walk above repo root
    if (dir === repoRoot) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Recursively find all workbench.json files under a directory.
 */
function findWorkbenchFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    // Skip .claude/worktrees/ — temporary agent isolation, not canonical workbench locations
    if (entry.name === 'worktrees' && dir.endsWith('.claude')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findWorkbenchFiles(fullPath));
    } else if (entry.name === 'workbench.json') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Discover all workbenches in the repo.
 * Returns array of { name, path, relativePath, config }.
 */
export function findAllWorkbenches(cwd = process.cwd()) {
  const repoRoot = findRepoRoot(cwd);
  const files = findWorkbenchFiles(repoRoot);

  return files.map((filePath) => {
    const wbDir = dirname(filePath);
    const config = JSON.parse(readFileSync(filePath, 'utf-8'));
    const relPath = relative(repoRoot, wbDir);
    // Derive name from directory name
    const name = relPath.split('/').pop();
    return {
      name,
      path: wbDir,
      relativePath: relPath,
      config,
    };
  });
}

/**
 * Resolve a --workbench flag value to a workbench path.
 * First tries as a marketplace.json alias, then as a direct path.
 */
export function resolveWorkbenchFlag(nameOrPath, cwd = process.cwd()) {
  const repoRoot = findRepoRoot(cwd);

  // Try marketplace.json alias first
  const marketplacePath = join(repoRoot, '.claude-plugin', 'marketplace.json');
  if (existsSync(marketplacePath)) {
    const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf-8'));
    const plugin = (marketplace.plugins || []).find((p) => p.name === nameOrPath);
    if (plugin && plugin.source) {
      const resolved = resolve(repoRoot, plugin.source);
      if (existsSync(join(resolved, 'workbench.json'))) {
        const config = JSON.parse(readFileSync(join(resolved, 'workbench.json'), 'utf-8'));
        return {
          path: resolved,
          relativePath: relative(repoRoot, resolved),
          config,
        };
      }
    }
  }

  // Try as direct path (absolute or relative to cwd)
  const directPath = resolve(cwd, nameOrPath);
  if (existsSync(join(directPath, 'workbench.json'))) {
    const config = JSON.parse(readFileSync(join(directPath, 'workbench.json'), 'utf-8'));
    return {
      path: directPath,
      relativePath: relative(repoRoot, directPath),
      config,
    };
  }

  // Try as relative to repo root
  const fromRoot = resolve(repoRoot, nameOrPath);
  if (fromRoot !== directPath && existsSync(join(fromRoot, 'workbench.json'))) {
    const config = JSON.parse(readFileSync(join(fromRoot, 'workbench.json'), 'utf-8'));
    return {
      path: fromRoot,
      relativePath: relative(repoRoot, fromRoot),
      config,
    };
  }

  throw new NotFoundError(
    `Workbench "${nameOrPath}" not found. Not a marketplace alias or valid path.`,
    {
      code: 'workbench_not_found',
      suggestion: 'Pass a path to a directory containing workbench.json, or run the appropriate marketplace/workbench discovery command if you expose one.',
    }
  );
}
