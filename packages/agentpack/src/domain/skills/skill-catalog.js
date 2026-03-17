import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCanonicalSkillRequirement,
  normalizeDisplayPath,
  readInstalledSkillExports,
  readPackageMetadata,
} from './skill-model.js';
import { buildAuthoredWorkspaceGraph } from './workspace-graph.js';

function isIgnoredEntry(name) {
  return name === '.git' || name === 'node_modules' || name === '.agentpack';
}

function listInstalledNodeModulesRoots(repoRoot) {
  const results = [];
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
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name === '.git' || entry.name === '.agentpack') continue;

      const fullPath = join(current, entry.name);
      if (entry.name === 'node_modules') {
        results.push(fullPath);
        continue;
      }

      stack.push(fullPath);
    }
  }

  return [...new Set(results)].sort((a, b) => a.localeCompare(b));
}

function listSkillPackageDirs(repoRoot, { installed = false } = {}) {
  if (installed) {
    return listInstalledNodeModulesRoots(repoRoot)
      .flatMap((root) => listSkillPackageDirs(root, { installed: false }))
      .sort((a, b) => a.localeCompare(b));
  }

  const root = repoRoot;
  if (!existsSync(root)) return [];

  const stack = [root];
  const results = [];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasRootSkillFile = false;
    let packageMetadata = null;

    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        if (!installed && isIgnoredEntry(entry.name)) continue;
        stack.push(join(current, entry.name));
        continue;
      }

      if (entry.name === 'SKILL.md') hasRootSkillFile = true;
      if (entry.name !== 'package.json') continue;

      try {
        packageMetadata = readPackageMetadata(current);
      } catch {
        packageMetadata = null;
      }
    }

    if (!packageMetadata?.packageName) continue;
    if (packageMetadata.skillRoot || hasRootSkillFile) {
      results.push(current);
    }
  }

  return results.sort();
}

export function listAuthoredSkillPackageDirs(repoRoot) {
  return Object.values(buildAuthoredWorkspaceGraph(repoRoot).packages)
    .map((pkg) => pkg.packageDir)
    .sort((a, b) => a.localeCompare(b));
}

export function listInstalledSkillPackageDirs(repoRoot) {
  return listSkillPackageDirs(repoRoot, { installed: true });
}

function buildCatalogKey(packageName, exportedSkills, entry) {
  if (!packageName) return null;
  if (entry.isPrimary) return packageName;
  if (exportedSkills.length <= 1) return packageName;
  return buildCanonicalSkillRequirement(packageName, entry.name);
}

export function readSkillPackage(repoRoot, packageDir, { origin = 'authored' } = {}) {
  const packageMetadata = readPackageMetadata(packageDir);
  if (!packageMetadata.packageName) return null;

  const exportedSkills = readInstalledSkillExports(packageDir);
  if (exportedSkills.length === 0) return null;

  return {
    origin,
    packageDir,
    packagePath: normalizeDisplayPath(repoRoot, packageDir),
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    packageMetadata,
    exports: exportedSkills.map((entry) => ({
      ...entry,
      key: buildCatalogKey(packageMetadata.packageName, exportedSkills, entry),
      packageName: packageMetadata.packageName,
      packageVersion: packageMetadata.packageVersion,
      packageDir,
      packagePath: normalizeDisplayPath(repoRoot, packageDir),
      skillDirPath: entry.skillDir,
      skillFilePath: entry.skillFile,
      skillPath: normalizeDisplayPath(repoRoot, entry.skillDir),
      skillFile: normalizeDisplayPath(repoRoot, entry.skillFile),
    })),
  };
}

export function listAuthoredSkillPackages(repoRoot) {
  const graph = buildAuthoredWorkspaceGraph(repoRoot);

  return Object.values(graph.packages)
    .map((pkg) => ({
      origin: 'authored',
      packageDir: pkg.packageDir,
      packagePath: pkg.packagePath,
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      packageMetadata: pkg.packageMetadata,
      primaryExport: pkg.primaryExport,
      status: pkg.status,
      diagnostics: pkg.diagnostics,
      exports: pkg.exports
        .map((exportId) => graph.exports[exportId])
        .filter(Boolean),
    }))
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function listInstalledSkillPackages(repoRoot) {
  return listInstalledSkillPackageDirs(repoRoot)
    .map((packageDir) => {
      try {
        return readSkillPackage(repoRoot, packageDir, { origin: 'installed' });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
