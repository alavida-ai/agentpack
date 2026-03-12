import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { writeInstallState } from '../fs/install-state-repository.js';

function ensureDir(pathValue) {
  mkdirSync(pathValue, { recursive: true });
}

export function removePathIfExists(pathValue) {
  rmSync(pathValue, { recursive: true, force: true });
}

export function ensureSkillLink(repoRoot, baseDir, skillName, skillDir, normalizeDisplayPath) {
  const skillsDir = join(repoRoot, baseDir, 'skills');
  ensureDir(skillsDir);
  const linkPath = join(skillsDir, skillName);
  removePathIfExists(linkPath);
  symlinkSync(skillDir, linkPath, 'dir');
  return normalizeDisplayPath(repoRoot, linkPath);
}

export function removeSkillLinks(repoRoot, name, normalizeDisplayPath) {
  const removed = [];
  for (const pathValue of [
    join(repoRoot, '.claude', 'skills', name),
    join(repoRoot, '.agents', 'skills', name),
  ]) {
    if (!existsSync(pathValue)) continue;
    removePathIfExists(pathValue);
    removed.push(normalizeDisplayPath(repoRoot, pathValue));
  }
  return removed;
}

export function removeSkillLinksByNames(repoRoot, names, normalizeDisplayPath) {
  const removed = [];
  for (const name of names) {
    removed.push(...removeSkillLinks(repoRoot, name, normalizeDisplayPath));
  }
  return [...new Set(removed)];
}

export function removeSkillLinksByPaths(repoRoot, paths, normalizeDisplayPath) {
  const removed = [];
  const allowedRoots = [
    resolve(repoRoot, '.claude', 'skills'),
    resolve(repoRoot, '.agents', 'skills'),
  ];
  for (const relativePath of paths || []) {
    const pathValue = resolve(repoRoot, relativePath);
    const inAllowedRoot = allowedRoots.some((root) => pathValue === root || pathValue.startsWith(`${root}/`));
    if (!inAllowedRoot) continue;
    if (!existsSync(pathValue)) continue;
    removePathIfExists(pathValue);
    removed.push(normalizeDisplayPath(repoRoot, pathValue));
  }
  return [...new Set(removed)];
}

function ensureSymlink(targetPath, linkPath) {
  removePathIfExists(linkPath);
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath, 'dir');
}

export function buildInstallRecord(repoRoot, packageDir, directTargetMap, {
  parseSkillFrontmatterFile,
  readPackageMetadata,
  normalizeRelativePath,
} = {}) {
  const packageMetadata = readPackageMetadata(packageDir);
  if (!packageMetadata.packageName) return null;

  const skillMetadata = parseSkillFrontmatterFile(join(packageDir, 'SKILL.md'));
  const skillDirName = skillMetadata.name;
  const materializations = [];

  const claudeTargetAbs = join(repoRoot, '.claude', 'skills', skillDirName);
  ensureSymlink(packageDir, claudeTargetAbs);
  materializations.push({
    target: normalizeRelativePath(relative(repoRoot, claudeTargetAbs)),
    mode: 'symlink',
  });

  const agentsTargetAbs = join(repoRoot, '.agents', 'skills', skillDirName);
  ensureSymlink(packageDir, agentsTargetAbs);
  materializations.push({
    target: normalizeRelativePath(relative(repoRoot, agentsTargetAbs)),
    mode: 'symlink',
  });

  return {
    packageName: packageMetadata.packageName,
    direct: directTargetMap.has(packageMetadata.packageName),
    requestedTarget: directTargetMap.get(packageMetadata.packageName) || null,
    packageVersion: packageMetadata.packageVersion,
    sourcePackagePath: normalizeRelativePath(relative(repoRoot, packageDir)),
    materializations,
  };
}

export function rebuildInstallState(repoRoot, directTargetMap, {
  listInstalledPackageDirs,
  parseSkillFrontmatterFile,
  readPackageMetadata,
  normalizeRelativePath,
} = {}) {
  const packageDirs = listInstalledPackageDirs(join(repoRoot, 'node_modules'));
  const installs = {};

  for (const packageDir of packageDirs) {
    const skillFile = join(packageDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const record = buildInstallRecord(repoRoot, packageDir, directTargetMap, {
      parseSkillFrontmatterFile,
      readPackageMetadata,
      normalizeRelativePath,
    });
    if (!record) continue;

    installs[record.packageName] = {
      direct: record.direct,
      requested_target: record.requestedTarget,
      package_version: record.packageVersion,
      source_package_path: record.sourcePackagePath,
      materializations: record.materializations,
    };
  }

  const state = { version: 1, installs };
  writeInstallState(repoRoot, state);
  return state;
}
