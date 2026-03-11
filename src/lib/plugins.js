import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { resolveDependencyClosure } from '../domain/skills/skill-graph.js';
import { normalizeRepoPath, parseSkillFrontmatterFile, readPackageMetadata } from '../domain/skills/skill-model.js';
import {
  findPackageDirByName,
  syncSkillDependencies,
} from './skills.js';
import { findRepoRoot } from './context.js';
import { AgentpackError, EXIT_CODES, NotFoundError, ValidationError } from '../utils/errors.js';

const require = createRequire(import.meta.url);

function resolvePluginDir(repoRoot, target) {
  const absoluteTarget = resolve(repoRoot, target);
  if (!existsSync(absoluteTarget)) {
    throw new NotFoundError('plugin not found', {
      code: 'plugin_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  return absoluteTarget;
}

function resolvePackageDir(repoRoot, pluginDir, packageName) {
  const localDir = findPackageDirByName(repoRoot, packageName);
  if (localDir) {
    return { packageDir: localDir, source: 'repo' };
  }

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [pluginDir],
    });
    return { packageDir: dirname(packageJsonPath), source: 'node_modules' };
  } catch {
    return null;
  }
}

function collectPluginLocalSkills(pluginDir) {
  const skillsRoot = join(pluginDir, 'skills');
  if (!existsSync(skillsRoot)) return [];

  const entries = readdirSync(skillsRoot, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsRoot, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const metadata = parseSkillFrontmatterFile(skillFile);
    skills.push({
      localName: entry.name,
      name: metadata.name,
      skillFile,
      requires: metadata.requires,
    });
  }

  return skills.sort((a, b) => a.localName.localeCompare(b.localName));
}

function collectPluginLocalSkillDirs(pluginDir) {
  const skillsRoot = join(pluginDir, 'skills');
  if (!existsSync(skillsRoot)) return [];

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => join(skillsRoot, entry.name))
    .sort();
}

function resolveBundleClosure(repoRoot, pluginDir, directRequires) {
  const { resolved, unresolved } = resolveDependencyClosure(directRequires, {
    resolveNode(packageName) {
      const resolvedPackage = resolvePackageDir(repoRoot, pluginDir, packageName);
      if (!resolvedPackage) return null;

      const skillFile = join(resolvedPackage.packageDir, 'SKILL.md');
      if (!existsSync(skillFile)) return null;

      const metadata = parseSkillFrontmatterFile(skillFile);
      const packageMetadata = readPackageMetadata(resolvedPackage.packageDir);

      return {
        packageName,
        packageVersion: packageMetadata.packageVersion,
        skillName: metadata.name,
        skillFile,
        packageDir: resolvedPackage.packageDir,
        source: resolvedPackage.source,
        requires: metadata.requires,
      };
    },
  });

  return { bundled: resolved, unresolved };
}

function stagePluginRuntimeFiles(pluginDir, stageDir) {
  mkdirSync(stageDir, { recursive: true });
  for (const entry of readdirSync(pluginDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.agentpack') continue;
    cpSync(join(pluginDir, entry.name), join(stageDir, entry.name), { recursive: true });
  }
}

function watchDirectoryTree(rootDir, onChange) {
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

export function buildPlugin(target, {
  cwd = process.cwd(),
  clean = false,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const pluginDir = resolvePluginDir(repoRoot, target);

  for (const localSkillDir of collectPluginLocalSkillDirs(pluginDir)) {
    if (existsSync(join(localSkillDir, 'package.json'))) {
      syncSkillDependencies(localSkillDir);
    }
  }

  const validation = validatePluginBundle(target, { cwd });
  if (!validation.valid) {
    throw new AgentpackError(validation.issues.map((issue) => issue.message).join('; '), {
      code: validation.issues[0]?.code || 'plugin_build_failed',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  const inspection = inspectPluginBundle(target, { cwd });
  const outputPath = join(repoRoot, '.agentpack', 'dist', 'plugins', inspection.pluginName);
  const stagePath = join(repoRoot, '.agentpack', 'dist', 'plugins', `.tmp-${inspection.pluginName}-${Date.now()}`);

  if (clean) {
    rmSync(outputPath, { recursive: true, force: true });
  }

  rmSync(stagePath, { recursive: true, force: true });

  try {
    stagePluginRuntimeFiles(pluginDir, stagePath);

    const vendoredSkills = [];
    for (const entry of [...inspection.directPackages, ...inspection.transitivePackages]) {
      const vendoredDir = join(stagePath, 'skills', entry.skillName);
      mkdirSync(vendoredDir, { recursive: true });
      cpSync(join(repoRoot, entry.skillFile), join(vendoredDir, 'SKILL.md'));
      vendoredSkills.push(entry.skillName);
    }

    const bundledManifestPath = join(stagePath, '.claude-plugin', 'bundled-skills.json');
    writeFileSync(
      bundledManifestPath,
      JSON.stringify({
        pluginName: inspection.pluginName,
        packages: [...inspection.directPackages, ...inspection.transitivePackages],
      }, null, 2) + '\n'
    );

    rmSync(outputPath, { recursive: true, force: true });
    renameSync(stagePath, outputPath);

    return {
      pluginName: inspection.pluginName,
      outputPath: normalizeRepoPath(repoRoot, outputPath),
      localSkills: inspection.localSkills.map((skill) => skill.localName),
      vendoredSkills: [...new Set(vendoredSkills)].sort(),
      success: true,
    };
  } catch (error) {
    rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}

export function startPluginDev(target, {
  cwd = process.cwd(),
  clean = false,
  onBuild = () => {},
  onRebuild = () => {},
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const pluginDir = resolvePluginDir(repoRoot, target);
  const initialResult = buildPlugin(target, { cwd, clean });
  onBuild(initialResult);

  let timer = null;
  let closed = false;

  const watcher = watchDirectoryTree(pluginDir, () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const rebuildResult = buildPlugin(target, { cwd });
        onRebuild(rebuildResult);
      } catch (error) {
        onRebuild({ error });
      }
    }, 100);
  });

  return {
    initialResult,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      watcher.close();
    },
  };
}

export function inspectPluginBundle(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const pluginDir = resolvePluginDir(repoRoot, target);
  const pluginManifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  const pluginManifest = existsSync(pluginManifestPath)
    ? JSON.parse(readFileSync(pluginManifestPath, 'utf-8'))
    : null;

  const packageMetadata = readPackageMetadata(pluginDir);
  if (!packageMetadata.packageName || !packageMetadata.packageVersion) {
    throw new ValidationError('plugin package.json missing name or version', {
      code: 'missing_plugin_package_metadata',
      suggestion: normalizeRepoPath(repoRoot, join(pluginDir, 'package.json')),
    });
  }

  if (!pluginManifest) {
    throw new ValidationError('plugin missing .claude-plugin/plugin.json', {
      code: 'missing_plugin_manifest',
      suggestion: normalizeRepoPath(repoRoot, join(pluginDir, '.claude-plugin', 'plugin.json')),
    });
  }

  const localSkills = collectPluginLocalSkills(pluginDir);
  const directRequires = [...new Set(localSkills.flatMap((skill) => skill.requires))].sort();
  const { bundled, unresolved } = resolveBundleClosure(repoRoot, pluginDir, directRequires);
  const directPackageSet = new Set(directRequires);

  return {
    pluginName: pluginManifest.name || packageMetadata.packageName,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    pluginPath: normalizeRepoPath(repoRoot, pluginDir),
    pluginManifestPath: normalizeRepoPath(repoRoot, pluginManifestPath),
    localSkills: localSkills.map((skill) => ({
      localName: skill.localName,
      name: skill.name,
      skillFile: normalizeRepoPath(repoRoot, skill.skillFile),
      requires: skill.requires,
    })),
    directPackages: bundled
      .filter((entry) => directPackageSet.has(entry.packageName))
      .map((entry) => ({
        packageName: entry.packageName,
        packageVersion: entry.packageVersion,
        skillName: entry.skillName,
        skillFile: normalizeRepoPath(repoRoot, entry.skillFile),
        source: entry.source,
      })),
    transitivePackages: bundled
      .filter((entry) => !directPackageSet.has(entry.packageName))
      .map((entry) => ({
        packageName: entry.packageName,
        packageVersion: entry.packageVersion,
        skillName: entry.skillName,
        skillFile: normalizeRepoPath(repoRoot, entry.skillFile),
        source: entry.source,
      })),
    unresolvedPackages: unresolved,
    bundleManifestPath: normalizeRepoPath(repoRoot, join(pluginDir, '.claude-plugin', 'bundled-skills.json')),
  };
}

export function validatePluginBundle(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const pluginDir = resolvePluginDir(repoRoot, target);
  const result = inspectPluginBundle(target, { cwd });
  const packageMetadata = readPackageMetadata(pluginDir);
  const issues = [];
  const localSkillNames = new Set(result.localSkills.map((skill) => skill.localName));
  const bundledSkillNames = new Map();
  const coveredPackages = new Set();

  for (const packageName of result.unresolvedPackages) {
    if (coveredPackages.has(packageName)) continue;
    issues.push({
      code: 'unresolved_bundle_dependency',
      packageName,
      message: `${packageName} is required by a local plugin skill but was not resolvable from the repo or node_modules. Are you sure you ran npm install?`,
    });
  }

  for (const localSkill of result.localSkills) {
    for (const packageName of localSkill.requires) {
      const declared = packageMetadata.devDependencies[packageName];
      const resolvedPackage = resolvePackageDir(repoRoot, pluginDir, packageName);
      if (!declared || !resolvedPackage) {
        coveredPackages.add(packageName);
        issues.push({
          code: 'missing_bundle_input',
          packageName,
          skillFile: localSkill.skillFile,
          message: `${packageName} is required by local plugin skill ${localSkill.localName} but is missing from package.json devDependencies or not installed. Are you sure you ran npm install?`,
        });
      }
    }
  }

  for (const entry of [...result.directPackages, ...result.transitivePackages]) {
    if (localSkillNames.has(entry.skillName)) {
      issues.push({
        code: 'bundled_skill_name_collision',
        packageName: entry.packageName,
        skillName: entry.skillName,
        message: `Bundled skill ${entry.skillName} collides with an existing local plugin skill`,
      });
    }

    if (bundledSkillNames.has(entry.skillName)) {
      issues.push({
        code: 'bundled_skill_name_collision',
        packageName: entry.packageName,
        skillName: entry.skillName,
        message: `Bundled skill ${entry.skillName} collides with ${bundledSkillNames.get(entry.skillName)}`,
      });
    } else {
      bundledSkillNames.set(entry.skillName, entry.packageName);
    }
  }

  return {
    pluginName: result.pluginName,
    packageName: result.packageName,
    packageVersion: result.packageVersion,
    pluginPath: result.pluginPath,
    valid: issues.length === 0,
    issueCount: issues.length,
    localSkillCount: result.localSkills.length,
    directPackageCount: result.directPackages.length,
    transitivePackageCount: result.transitivePackages.length,
    issues,
    bundledPackages: [...result.directPackages, ...result.transitivePackages],
    bundleManifestPath: result.bundleManifestPath,
  };
}
