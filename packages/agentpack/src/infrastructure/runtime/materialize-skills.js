import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { writeInstallState } from '../fs/install-state-repository.js';
import { writeMaterializationState } from '../fs/materialization-state-repository.js';

function ensureDir(pathValue) {
  mkdirSync(pathValue, { recursive: true });
}

export function removePathIfExists(pathValue) {
  try {
    const stat = lstatSync(pathValue);
    if (stat.isSymbolicLink() || stat.isFile()) {
      unlinkSync(pathValue);
      return;
    }
    rmSync(pathValue, { recursive: true, force: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
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
    try {
      removePathIfExists(pathValue);
      removed.push(normalizeDisplayPath(repoRoot, pathValue));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
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
    try {
      removePathIfExists(pathValue);
      removed.push(normalizeDisplayPath(repoRoot, pathValue));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return [...new Set(removed)];
}

function ensureSymlink(targetPath, linkPath) {
  removePathIfExists(linkPath);
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath, 'dir');
}

function inferPackageRuntimeNamespace(packageName) {
  return packageName?.split('/').pop() || null;
}

function buildRuntimeName(packageName, exportedSkills, entry) {
  if (exportedSkills.length <= 1) return entry.name;

  const namespace = inferPackageRuntimeNamespace(packageName);
  if (!namespace) return entry.name;
  if (entry.name === namespace) return namespace;
  return `${namespace}:${entry.name}`;
}

function buildMaterializationState(installs) {
  const adapters = {
    claude: [],
    agents: [],
  };

  for (const [packageName, install] of Object.entries(installs)) {
    for (const skill of install.skills || []) {
      for (const materialization of skill.materializations || []) {
        if (materialization.target.startsWith('.claude/')) {
          adapters.claude.push({
            packageName,
            skillName: skill.name,
            runtimeName: skill.runtime_name,
            sourceSkillPath: skill.source_skill_path,
            sourceSkillFile: skill.source_skill_file,
            ...materialization,
          });
          continue;
        }

        if (materialization.target.startsWith('.agents/')) {
          adapters.agents.push({
            packageName,
            skillName: skill.name,
            runtimeName: skill.runtime_name,
            sourceSkillPath: skill.source_skill_path,
            sourceSkillFile: skill.source_skill_file,
            ...materialization,
          });
        }
      }
    }
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    adapters,
  };
}

export function buildInstallRecord(repoRoot, packageDir, directTargetMap, {
  readPackageMetadata,
  readInstalledSkillExports,
  normalizeRelativePath,
} = {}) {
  const packageMetadata = readPackageMetadata(packageDir);
  if (!packageMetadata.packageName) return null;
  const exportedSkills = readInstalledSkillExports(packageDir);
  if (exportedSkills.length === 0) return null;
  const materializations = [];
  const skills = [];

  for (const entry of exportedSkills) {
    const runtimeName = buildRuntimeName(packageMetadata.packageName, exportedSkills, entry);
    const skillMaterializations = [];

    const claudeTargetAbs = join(repoRoot, '.claude', 'skills', runtimeName);
    ensureSymlink(entry.skillDir, claudeTargetAbs);
    skillMaterializations.push({
      target: normalizeRelativePath(relative(repoRoot, claudeTargetAbs)),
      mode: 'symlink',
    });

    const agentsTargetAbs = join(repoRoot, '.agents', 'skills', runtimeName);
    ensureSymlink(entry.skillDir, agentsTargetAbs);
    skillMaterializations.push({
      target: normalizeRelativePath(relative(repoRoot, agentsTargetAbs)),
      mode: 'symlink',
    });

    materializations.push(...skillMaterializations);
    skills.push({
      name: entry.name,
      runtime_name: runtimeName,
      source_skill_path: normalizeRelativePath(relative(repoRoot, entry.skillDir)),
      source_skill_file: normalizeRelativePath(relative(repoRoot, entry.skillFile)),
      requires: entry.requires,
      status: entry.status,
      replacement: entry.replacement,
      message: entry.message,
      materializations: skillMaterializations,
    });
  }

  return {
    packageName: packageMetadata.packageName,
    direct: directTargetMap.has(packageMetadata.packageName),
    requestedTarget: directTargetMap.get(packageMetadata.packageName) || null,
    packageVersion: packageMetadata.packageVersion,
    sourcePackagePath: normalizeRelativePath(relative(repoRoot, packageDir)),
    skills,
    materializations,
  };
}

export function rebuildInstallState(repoRoot, directTargetMap, {
  packageDirs = [],
  readPackageMetadata,
  readInstalledSkillExports,
  normalizeRelativePath,
} = {}) {
  const installs = {};

  for (const packageDir of packageDirs) {
    const record = buildInstallRecord(repoRoot, packageDir, directTargetMap, {
      readPackageMetadata,
      readInstalledSkillExports,
      normalizeRelativePath,
    });
    if (!record) continue;

    installs[record.packageName] = {
      direct: record.direct,
      requested_target: record.requestedTarget,
      package_version: record.packageVersion,
      source_package_path: record.sourcePackagePath,
      skills: record.skills,
      materializations: record.materializations,
    };
  }

  const state = { version: 1, installs };
  writeInstallState(repoRoot, state);
  writeMaterializationState(repoRoot, buildMaterializationState(installs));
  return state;
}
