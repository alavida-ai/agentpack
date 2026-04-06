import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { findPackageDirByName } from '../../domain/skills/package-discovery.js';
import { inferPackageRuntimeNamespace, normalizeDisplayPath, readPackageMetadata } from '../../domain/skills/skill-model.js';
import { findRepoRoot } from '../../lib/context.js';
import { readAuthoredRuntimeBundleUseCase } from './read-authored-runtime-bundle.js';
import { AgentpackError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { readPluginSyncState, writePluginSyncState } from '../../infrastructure/fs/plugin-sync-state-repository.js';

function readPluginManifest(pluginDir) {
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) {
    throw new NotFoundError(`plugin manifest not found: ${manifestPath}`, {
      code: 'plugin_manifest_not_found',
      path: manifestPath,
    });
  }

  return {
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf-8')),
  };
}

function ensurePluginSkillsRoot(pluginDir, manifest) {
  if (manifest.skills !== './skills') {
    throw new ValidationError('plugin manifest must set "skills" to "./skills" for package bundle sync', {
      code: 'plugin_manifest_invalid',
      path: join(pluginDir, '.claude-plugin', 'plugin.json'),
      suggestion: 'Set `"skills": "./skills"` in the plugin manifest before syncing.',
    });
  }

  const skillsRoot = join(pluginDir, 'skills');
  if (existsSync(skillsRoot) && lstatSync(skillsRoot).isSymbolicLink()) {
    throw new ValidationError('plugin skills root is a symlink and cannot safely receive synced bundles', {
      code: 'plugin_skills_root_is_symlink',
      path: skillsRoot,
      suggestion: 'Replace the symlink with a real directory before running `agentpack author plugin-sync`.',
    });
  }

  mkdirSync(skillsRoot, { recursive: true });
  return skillsRoot;
}

function findOwningPackageDir(repoRoot, absoluteTarget) {
  let current = absoluteTarget;

  while (current.startsWith(repoRoot)) {
    if (existsSync(join(current, 'package.json'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function resolvePackageDirForPluginSync(repoRoot, target, cwd) {
  const absoluteTarget = isAbsolute(target) ? target : resolve(cwd, target);
  const targetRoot = absoluteTarget.endsWith('SKILL.md') ? dirname(absoluteTarget) : absoluteTarget;
  const packageDirFromPath = findOwningPackageDir(repoRoot, targetRoot);
  if (packageDirFromPath) return packageDirFromPath;

  const packageDirByName = findPackageDirByName(repoRoot, target);
  if (packageDirByName) return packageDirByName;

  throw new NotFoundError(`package target not found: ${target}`, {
    code: 'package_target_not_found',
    path: absoluteTarget,
  });
}

export function syncPluginBundleUseCase(target, pluginDirArg, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const packageDir = resolvePackageDirForPluginSync(repoRoot, target, cwd);
  const packagePath = normalizeDisplayPath(repoRoot, packageDir);
  const packageMetadata = readPackageMetadata(packageDir);
  if (!packageMetadata.packageName) {
    throw new ValidationError(`package.json missing name field: ${packagePath}`, {
      code: 'package_name_missing',
      path: join(packageDir, 'package.json'),
    });
  }
  const bundle = readAuthoredRuntimeBundleUseCase({
    cwd,
    packagePath,
  });
  const pluginDir = resolve(repoRoot, pluginDirArg);
  const { manifest } = readPluginManifest(pluginDir);
  const skillsRoot = ensurePluginSkillsRoot(pluginDir, manifest);
  const runtimeNamespace = inferPackageRuntimeNamespace(bundle.targetPackageName);
  if (!runtimeNamespace) {
    throw new AgentpackError(`could not infer runtime namespace for ${bundle.targetPackageName}`, {
      code: 'plugin_sync_invalid_package_name',
    });
  }

  const bundleSourceDir = join(repoRoot, bundle.targetPackagePath, 'dist');
  const targetDir = join(skillsRoot, runtimeNamespace);
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(skillsRoot, { recursive: true });
  cpSync(bundleSourceDir, targetDir, { recursive: true });

  const syncRecord = {
    version: 1,
    sourcePackageName: bundle.targetPackageName,
    sourcePackagePath: bundle.targetPackagePath,
    bundleSourcePath: `${bundle.targetPackagePath}/dist`,
    pluginDir: normalizeDisplayPath(repoRoot, pluginDir),
    skillsRoot: normalizeDisplayPath(repoRoot, skillsRoot),
    targetDir: normalizeDisplayPath(repoRoot, targetDir),
    syncedAt: new Date().toISOString(),
  };
  writeFileSync(join(targetDir, '.agentpack-plugin-sync.json'), `${JSON.stringify(syncRecord, null, 2)}\n`);

  const existingState = readPluginSyncState(repoRoot) || {
    version: 1,
    syncedBundles: [],
  };
  writePluginSyncState(repoRoot, {
    version: 1,
    syncedBundles: [
      ...existingState.syncedBundles.filter((entry) => entry.targetDir !== syncRecord.targetDir),
      syncRecord,
    ].sort((a, b) => a.targetDir.localeCompare(b.targetDir)),
  });

  return {
    packageName: bundle.targetPackageName,
    pluginDir: normalizeDisplayPath(repoRoot, pluginDir),
    skillsRoot: normalizeDisplayPath(repoRoot, skillsRoot),
    targetDir: normalizeDisplayPath(repoRoot, targetDir),
    rootSkill: bundle.rootSkill,
    exportCount: bundle.exports.length,
  };
}
