import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findPackageDirByName } from './package-discovery.js';

export function readSkillGraphNode(repoRoot, packageDir, {
  directInstallNames = new Set(),
  parseSkillFrontmatterFile,
  readPackageMetadata,
  normalizeDisplayPath,
} = {}) {
  const skillFile = join(packageDir, 'SKILL.md');
  if (!existsSync(skillFile)) return null;

  const skillMetadata = parseSkillFrontmatterFile(skillFile);
  const packageMetadata = readPackageMetadata(packageDir);
  if (!packageMetadata.packageName) return null;

  const dependencyNames = Object.keys(packageMetadata.dependencies || {})
    .filter((dependencyName) => {
      const localPackageDir = findPackageDirByName(repoRoot, dependencyName);
      if (localPackageDir && existsSync(join(localPackageDir, 'SKILL.md'))) return true;
      const installedPackageDir = join(repoRoot, 'node_modules', ...dependencyName.split('/'));
      return existsSync(join(installedPackageDir, 'SKILL.md'));
    })
    .sort((a, b) => a.localeCompare(b));

  return {
    name: skillMetadata.name,
    description: skillMetadata.description,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    skillPath: normalizeDisplayPath(repoRoot, packageDir),
    skillFile: normalizeDisplayPath(repoRoot, skillFile),
    direct: directInstallNames.has(packageMetadata.packageName),
    dependencies: dependencyNames,
  };
}

export function buildSkillGraph(repoRoot, packageDirs, options) {
  const nodes = new Map();

  for (const packageDir of packageDirs) {
    const node = readSkillGraphNode(repoRoot, packageDir, options);
    if (!node) continue;
    nodes.set(node.packageName, node);
  }

  return nodes;
}

export function buildReverseDependencies(nodes) {
  const reverse = new Map();
  for (const packageName of nodes.keys()) reverse.set(packageName, []);

  for (const node of nodes.values()) {
    for (const dependencyName of node.dependencies || []) {
      if (!reverse.has(dependencyName)) continue;
      reverse.get(dependencyName).push(node.packageName);
    }
  }

  for (const values of reverse.values()) values.sort((a, b) => a.localeCompare(b));
  return reverse;
}

export function buildSkillStatusMap(nodes, staleSkills = new Set()) {
  const cache = new Map();

  function resolveStatus(packageName, seen = new Set()) {
    if (cache.has(packageName)) return cache.get(packageName);
    if (staleSkills.has(packageName)) {
      cache.set(packageName, 'stale');
      return 'stale';
    }

    if (seen.has(packageName)) return 'current';
    seen.add(packageName);

    const node = nodes.get(packageName);
    if (!node) {
      cache.set(packageName, null);
      return null;
    }

    const dependencyStatuses = (node.dependencies || [])
      .map((dependencyName) => resolveStatus(dependencyName, new Set(seen)))
      .filter(Boolean);

    const status = dependencyStatuses.some((value) => value === 'stale' || value === 'affected')
      ? 'affected'
      : 'current';

    cache.set(packageName, status);
    return status;
  }

  for (const packageName of nodes.keys()) {
    resolveStatus(packageName);
  }

  return cache;
}

export function readNodeStatus(statusMap, packageName) {
  if (!statusMap) return null;
  return statusMap.get(packageName) || null;
}

export function resolveDependencyClosure(initialRequires, { resolveNode }) {
  const seen = new Set();
  const queue = [...initialRequires];
  const resolved = [];
  const unresolved = [];

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (seen.has(packageName)) continue;
    seen.add(packageName);

    const node = resolveNode(packageName);
    if (!node) {
      unresolved.push(packageName);
      continue;
    }

    resolved.push(node);

    for (const requirement of node.requires || []) {
      if (!seen.has(requirement)) queue.push(requirement);
    }
  }

  resolved.sort((a, b) => a.packageName.localeCompare(b.packageName));
  unresolved.sort((a, b) => a.localeCompare(b));

  return { resolved, unresolved };
}
