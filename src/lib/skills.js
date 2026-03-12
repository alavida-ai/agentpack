import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findAllWorkbenches, findRepoRoot, findWorkbenchContext, resolveWorkbenchFlag } from './context.js';
import {
  buildReverseDependencies,
  buildSkillGraph,
  buildSkillStatusMap,
  readNodeStatus,
} from '../domain/skills/skill-graph.js';
import { readInstallState } from '../infrastructure/fs/install-state-repository.js';
import {
  ensureSkillLink,
  rebuildInstallState,
  removePathIfExists,
  removeSkillLinks,
  removeSkillLinksByNames,
} from '../infrastructure/runtime/materialize-skills.js';
import {
  normalizeDisplayPath,
  normalizeRepoPath,
  parseSkillFrontmatterFile,
  readPackageMetadata,
} from '../domain/skills/skill-model.js';
import {
  buildStateRecordForPackageDir,
  compareRecordedSources,
  hashFile,
  readBuildState,
  writeBuildState,
} from '../domain/skills/skill-provenance.js';
import { startSkillDevWorkbench } from '../application/skills/start-skill-dev-workbench.js';
import { AgentpackError, EXIT_CODES, NetworkError, NotFoundError, ValidationError } from '../utils/errors.js';

const GITHUB_PACKAGES_REGISTRY = 'https://npm.pkg.github.com';
const MANAGED_PACKAGE_SCOPES = ['@alavida', '@alavida-ai'];

function isManagedPackageName(packageName) {
  return typeof packageName === 'string'
    && MANAGED_PACKAGE_SCOPES.some((scope) => packageName.startsWith(`${scope}/`));
}

function inferManagedScope(packageName) {
  return MANAGED_PACKAGE_SCOPES.find((scope) => packageName?.startsWith(`${scope}/`)) || null;
}

function resolveDevLinkedSkills(repoRoot, rootSkillDir) {
  const queue = [rootSkillDir];
  const seenDirs = new Set();
  const linkedSkills = [];
  const unresolved = new Set();

  while (queue.length > 0) {
    const skillDir = queue.shift();
    if (seenDirs.has(skillDir)) continue;
    seenDirs.add(skillDir);

    const skillFile = join(skillDir, 'SKILL.md');
    const metadata = parseSkillFrontmatterFile(skillFile);
    const packageMetadata = readPackageMetadata(skillDir);

    linkedSkills.push({
      name: metadata.name,
      skillDir,
      requires: metadata.requires,
      packageName: packageMetadata.packageName,
    });

    for (const requirement of metadata.requires) {
      const dependencyDir = findPackageDirByName(repoRoot, requirement)
        || join(repoRoot, 'node_modules', ...requirement.split('/'));
      if (!existsSync(dependencyDir)) {
        unresolved.add(requirement);
        continue;
      }
      if (!existsSync(join(dependencyDir, 'SKILL.md'))) continue;
      if (!existsSync(join(dependencyDir, 'package.json'))) continue;
      queue.push(dependencyDir);
    }
  }

  linkedSkills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    linkedSkills,
    unresolved: [...unresolved].sort((a, b) => a.localeCompare(b)),
  };
}

function resolveLocalPackagedSkillDir(repoRoot, target) {
  const skillFile = resolveSkillFileTarget(repoRoot, target);
  if (!skillFile) {
    throw new AgentpackError(`SKILL.md not found for target: ${target}`, {
      code: 'skill_not_found',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  const skillDir = dirname(skillFile);
  const packageJsonPath = join(skillDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new AgentpackError(`package.json not found: ${packageJsonPath}`, {
      code: 'package_json_not_found',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  return { skillDir, skillFile, packageJsonPath };
}

function resolveSkillFileTarget(repoRoot, target) {
  const absoluteTarget = isAbsolute(target) ? target : resolve(repoRoot, target);

  if (existsSync(absoluteTarget)) {
    if (absoluteTarget.endsWith('SKILL.md')) return absoluteTarget;
    const skillFile = join(absoluteTarget, 'SKILL.md');
    if (existsSync(skillFile)) return skillFile;
  }

  return null;
}

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

function readPackageJson(packageDir) {
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new NotFoundError(`package.json not found: ${packageJsonPath}`, {
      code: 'package_json_not_found',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  return {
    packageJsonPath,
    packageJson: JSON.parse(readFileSync(packageJsonPath, 'utf-8')),
  };
}

export function syncSkillDependencies(skillDir) {
  const skillFile = join(skillDir, 'SKILL.md');
  const metadata = parseSkillFrontmatterFile(skillFile);
  const { packageJsonPath, packageJson } = readPackageJson(skillDir);
  const nextDependencies = { ...(packageJson.dependencies || {}) };
  const required = [...new Set(metadata.requires || [])].sort((a, b) => a.localeCompare(b));
  const requiredSet = new Set(required);
  const added = [];
  const removed = [];

  for (const packageName of required) {
    if (!nextDependencies[packageName]) {
      nextDependencies[packageName] = '*';
      added.push(packageName);
    }
  }

  for (const packageName of Object.keys(nextDependencies).sort((a, b) => a.localeCompare(b))) {
    if (!isManagedPackageName(packageName)) continue;
    if (requiredSet.has(packageName)) continue;
    delete nextDependencies[packageName];
    removed.push(packageName);
  }

  const previousSerialized = JSON.stringify(packageJson.dependencies || {});
  const nextSerialized = JSON.stringify(nextDependencies);
  if (previousSerialized !== nextSerialized) {
    packageJson.dependencies = nextDependencies;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  return {
    skillDir,
    packageJsonPath,
    added,
    removed,
    unchanged: added.length === 0 && removed.length === 0,
  };
}

export function devSkill(target, {
  cwd = process.cwd(),
  sync = true,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  try {
    const { skillDir } = resolveLocalPackagedSkillDir(repoRoot, target);
    const { linkedSkills, unresolved } = resolveDevLinkedSkills(repoRoot, skillDir);
    const rootSkill = linkedSkills.find((entry) => entry.skillDir === skillDir);
    const synced = sync
      ? syncSkillDependencies(skillDir)
      : {
        skillDir,
        packageJsonPath: join(skillDir, 'package.json'),
        added: [],
        removed: [],
        unchanged: true,
      };
    const links = [];

    for (const linkedSkill of linkedSkills) {
      links.push(ensureSkillLink(repoRoot, '.claude', linkedSkill.name, linkedSkill.skillDir, normalizeDisplayPath));
      links.push(ensureSkillLink(repoRoot, '.agents', linkedSkill.name, linkedSkill.skillDir, normalizeDisplayPath));
    }

    return {
      name: rootSkill.name,
      path: normalizeDisplayPath(repoRoot, skillDir),
      linked: true,
      links,
      linkedSkills: linkedSkills.map((entry) => ({
        name: entry.name,
        path: normalizeDisplayPath(repoRoot, entry.skillDir),
        packageName: entry.packageName,
      })),
      unresolved,
      synced,
    };
  } catch (error) {
    if (error instanceof AgentpackError && error.exitCode === EXIT_CODES.GENERAL) {
      throw error;
    }

    throw new AgentpackError(error.message, {
      code: error.code || 'skill_dev_failed',
      exitCode: EXIT_CODES.GENERAL,
    });
  }
}

export function startSkillDev(target, {
  cwd = process.cwd(),
  sync = true,
  dashboard = true,
  onStart = () => {},
  onRebuild = () => {},
} = {}) {
  const outerRepoRoot = findRepoRoot(cwd);
  const { skillDir } = resolveLocalPackagedSkillDir(outerRepoRoot, target);
  const repoRoot = findRepoRoot(skillDir);
  let closed = false;
  let timer = null;
  let currentNames = [];
  let watcher = null;
  let workbench = null;
  let initialResult = null;

  const cleanup = () => {
    if (closed) return { name: currentNames[0] || null, unlinked: false, removed: [] };
    closed = true;
    clearTimeout(timer);
    if (watcher) watcher.close();
    if (workbench) workbench.close();
    const removed = removeSkillLinksByNames(repoRoot, currentNames, normalizeDisplayPath);
    detachProcessCleanup();
    return {
      name: currentNames[0] || null,
      unlinked: removed.length > 0,
      removed,
    };
  };

  const processCleanupHandlers = new Map();
  const attachProcessCleanup = () => {
    for (const eventName of ['exit', 'beforeExit', 'SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => {
        cleanup();
      };
      processCleanupHandlers.set(eventName, handler);
      process.once(eventName, handler);
    }
  };

  const detachProcessCleanup = () => {
    for (const [eventName, handler] of processCleanupHandlers.entries()) {
      process.removeListener(eventName, handler);
    }
    processCleanupHandlers.clear();
  };

  const enrichResult = (result) => ({
    ...result,
    workbench: workbench
      ? {
        enabled: true,
        url: workbench.url,
        port: workbench.port,
      }
      : {
        enabled: false,
        url: null,
        port: null,
      },
  });

  const applyDevResult = (result) => {
    const nextNames = result.linkedSkills.map((entry) => entry.name);
    const staleNames = currentNames.filter((name) => !nextNames.includes(name));
    if (staleNames.length > 0) {
      removeSkillLinksByNames(repoRoot, staleNames, normalizeDisplayPath);
    }
    currentNames = nextNames;
    return result;
  };

  const startOrRefreshWorkbench = async () => {
    if (dashboard && !workbench) {
      workbench = await startSkillDevWorkbench({
        repoRoot,
        skillDir,
        open: true,
        disableBrowser: process.env.AGENTPACK_DISABLE_BROWSER === '1',
      });
    } else if (workbench) {
      workbench.refresh();
    }
  };

  initialResult = enrichResult(applyDevResult(devSkill(target, { cwd, sync })));
  const ready = Promise.resolve(startOrRefreshWorkbench())
    .then(() => {
      const result = enrichResult(initialResult);
      initialResult = result;
      onStart(result);
      return result;
    })
    .catch((error) => {
      cleanup();
      throw error;
    });

  attachProcessCleanup();

  watcher = watch(skillDir, { recursive: true }, () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      Promise.resolve()
        .then(() => applyDevResult(devSkill(target, { cwd, sync })))
        .then(async (result) => {
          await startOrRefreshWorkbench();
          return enrichResult(result);
        })
        .then(onRebuild)
        .catch((error) => {
          onRebuild({ error });
        });
    }, 100);
  });

  return {
    initialResult,
    ready,
    close() {
      return cleanup();
    },
  };
}

export function unlinkSkill(name, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const existing = [
    join(repoRoot, '.claude', 'skills', name),
    join(repoRoot, '.agents', 'skills', name),
  ].filter((pathValue) => existsSync(pathValue));

  if (existing.length === 0) {
    throw new AgentpackError(`linked skill not found: ${name}`, {
      code: 'linked_skill_not_found',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  const removed = removeSkillLinks(repoRoot, name, normalizeDisplayPath);

  return {
    name,
    unlinked: true,
    removed,
  };
}

function buildValidateNextSteps(packageMetadata, valid) {
  if (!valid || !packageMetadata.packageName) return [];

  const steps = [
    {
      type: 'version',
      command: 'npm version patch',
      reason: 'assign the next package version after reviewed skill changes',
    },
  ];

  if (isManagedPackageName(packageMetadata.packageName)) {
    steps.push({
      type: 'publish',
      command: 'npm publish',
      registry: GITHUB_PACKAGES_REGISTRY,
      reason: 'publish the versioned package to the private registry',
    });
  }

  return steps;
}

function parseNpmRcFile(content) {
  const config = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    config[key] = value;
  }
  return config;
}

function readRepoNpmRegistryConfig(repoRoot, scope = null) {
  const npmrcPath = join(repoRoot, '.npmrc');
  const config = existsSync(npmrcPath)
    ? parseNpmRcFile(readFileSync(npmrcPath, 'utf-8'))
    : {};
  const scopes = scope ? [scope] : MANAGED_PACKAGE_SCOPES;
  const matchedScope = scopes.find((candidate) => config[`${candidate}:registry`]) || scope || scopes[0] || null;

  return {
    npmrcPath: existsSync(npmrcPath) ? npmrcPath : null,
    scope: matchedScope,
    registry: matchedScope ? (config[`${matchedScope}:registry`] || null) : null,
    authToken: config['//npm.pkg.github.com/:_authToken'] || null,
    alwaysAuth: String(config['always-auth'] || '').toLowerCase() === 'true',
  };
}

export function inspectRegistryConfig({
  cwd = process.cwd(),
  scope = null,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const { npmrcPath, scope: resolvedScope, registry, authToken, alwaysAuth } = readRepoNpmRegistryConfig(
    repoRoot,
    scope
  );

  let auth = {
    configured: false,
    mode: 'missing',
    key: null,
    value: null,
  };

  if (authToken) {
    const envMatch = authToken.match(/^\$\{([^}]+)\}$/);
    if (envMatch) {
      auth = {
        configured: true,
        mode: 'env',
        key: envMatch[1],
        value: null,
      };
    } else {
      auth = {
        configured: true,
        mode: 'literal',
        key: null,
        value: authToken,
      };
    }
  }

  return {
    scope: resolvedScope,
    repoRoot,
    npmrcPath: npmrcPath ? normalizeDisplayPath(repoRoot, npmrcPath) : null,
    configured: Boolean(registry),
    registry,
    auth,
    alwaysAuth,
  };
}

function resolveRegistryAuthToken(rawValue) {
  if (!rawValue) return null;
  const envMatch = rawValue.match(/^\$\{([^}]+)\}$/);
  if (envMatch) {
    return process.env[envMatch[1]] || null;
  }
  return rawValue;
}

async function fetchRegistryLatestVersion(packageName, {
  registry,
  authToken,
} = {}) {
  if (!registry) return null;

  const base = registry.replace(/\/+$/, '');
  const url = `${base}/${encodeURIComponent(packageName)}`;
  const headers = { accept: 'application/json' };
  const resolvedToken = resolveRegistryAuthToken(authToken);
  if (resolvedToken) headers.authorization = `Bearer ${resolvedToken}`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new NetworkError(`failed to query registry for ${packageName}`, {
      code: 'registry_lookup_failed',
      suggestion: error instanceof Error ? error.message : String(error),
    });
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new NetworkError(`registry lookup failed for ${packageName}`, {
      code: 'registry_lookup_failed',
      suggestion: `HTTP ${response.status}`,
    });
  }

  const metadata = await response.json();
  return metadata?.['dist-tags']?.latest || null;
}

export function inspectSkill(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);

  let skillFile = resolveSkillFileTarget(repoRoot, target);

  if (!skillFile && target.startsWith('@')) {
    const packageDir = findPackageDirByName(repoRoot, target);
    if (packageDir) {
      skillFile = join(packageDir, 'SKILL.md');
    }
  }

  if (!skillFile) {
    throw new NotFoundError('skill not found', {
      code: 'skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  const metadata = parseSkillFrontmatterFile(skillFile);
  const packageMetadata = readPackageMetadata(dirname(skillFile));

  return {
    name: metadata.name,
    description: metadata.description,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    skillFile: normalizeDisplayPath(repoRoot, skillFile),
    sources: metadata.sources,
    requires: metadata.requires,
    status: metadata.status,
    replacement: metadata.replacement,
    message: metadata.message,
  };
}

function buildAuthoredSkillGraph(repoRoot) {
  return buildSkillGraph(repoRoot, listPackagedSkillDirs(repoRoot), {
    parseSkillFrontmatterFile,
    readPackageMetadata,
    findPackageDirByName,
    normalizeDisplayPath,
  });
}

function buildInstalledSkillGraph(repoRoot) {
  const installState = readInstallState(repoRoot);
  const directInstallNames = new Set(
    Object.entries(installState.installs || {})
      .filter(([, install]) => install.direct)
      .map(([packageName]) => packageName)
  );

  return buildSkillGraph(repoRoot, listInstalledPackageDirs(join(repoRoot, 'node_modules')), {
    directInstallNames,
    parseSkillFrontmatterFile,
    readPackageMetadata,
    findPackageDirByName,
    normalizeDisplayPath,
  });
}

function buildSkillStatusMapForRepo(repoRoot) {
  const nodes = buildAuthoredSkillGraph(repoRoot);
  const staleSkills = new Set(listStaleSkills({ cwd: repoRoot }).map((skill) => skill.packageName));
  return buildSkillStatusMap(nodes, staleSkills);
}

export function inspectSkillDependencies(target, {
  cwd = process.cwd(),
  discoveryRoot = process.env.AGENTPACK_DISCOVERY_ROOT,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const authoredNodes = buildAuthoredSkillGraph(repoRoot);
  const installedNodes = buildInstalledSkillGraph(repoRoot);
  const statusRoot = discoveryRoot ? resolve(discoveryRoot) : repoRoot;
  const statusMap = buildSkillStatusMapForRepo(statusRoot);

  const authoredTarget = authoredNodes.get(target) || null;
  const installedTarget = installedNodes.get(target) || null;

  let graph = null;
  let nodes = null;
  let node = null;

  if (authoredTarget) {
    graph = 'authored';
    nodes = authoredNodes;
    node = authoredTarget;
  } else if (installedTarget) {
    graph = 'installed';
    nodes = installedNodes;
    node = installedTarget;
  } else {
    const targetPath = resolveSkillFileTarget(repoRoot, target);
    if (targetPath) {
      const packageDir = dirname(targetPath);
      const packageMetadata = readPackageMetadata(packageDir);
      if (packageMetadata.packageName && authoredNodes.has(packageMetadata.packageName)) {
        graph = 'authored';
        nodes = authoredNodes;
        node = authoredNodes.get(packageMetadata.packageName);
      }
    }
  }

  if (!node || !nodes || !graph) {
    throw new NotFoundError('skill dependency graph target not found', {
      code: 'skill_graph_target_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  const reverseDependencies = buildReverseDependencies(nodes).get(node.packageName) || [];

  return {
    graph,
    name: node.name,
    packageName: node.packageName,
    packageVersion: node.packageVersion,
    skillPath: node.skillPath,
    skillFile: node.skillFile,
    direct: graph === 'installed' ? node.direct : null,
    status: readNodeStatus(statusMap, node.packageName),
    dependencies: node.dependencies.map((packageName) => {
      const dependencyNode = nodes.get(packageName);
      return {
        packageName,
        packageVersion: dependencyNode?.packageVersion || null,
        skillPath: dependencyNode?.skillPath || null,
        direct: graph === 'installed' ? dependencyNode?.direct || false : null,
        status: readNodeStatus(statusMap, packageName),
      };
    }),
    reverseDependencies: reverseDependencies.map((packageName) => {
      const dependencyNode = nodes.get(packageName);
      return {
        packageName,
        packageVersion: dependencyNode?.packageVersion || null,
        skillPath: dependencyNode?.skillPath || null,
        direct: graph === 'installed' ? dependencyNode?.direct || false : null,
        status: readNodeStatus(statusMap, packageName),
      };
    }),
  };
}

function resolvePackagedSkillTarget(repoRoot, target) {
  let skillFile = null;

  if (target) {
    skillFile = resolveSkillFileTarget(repoRoot, target);

    if (!skillFile && target.startsWith('@')) {
      const packageDir = findPackageDirByName(repoRoot, target);
      if (packageDir) {
        skillFile = join(packageDir, 'SKILL.md');
      }
    }

    if (!skillFile) {
      throw new NotFoundError('skill not found', {
        code: 'skill_not_found',
        suggestion: `Target: ${target}`,
      });
    }

    const packageDir = dirname(skillFile);
    const packageMetadata = readPackageMetadata(packageDir);
    if (!packageMetadata.packageName) {
      throw new ValidationError('validate target is not a packaged skill', {
        code: 'invalid_validate_target',
        suggestion: `Target: ${target}`,
      });
    }

    return [packageDir];
  }

  return listPackagedSkillDirs(repoRoot);
}

function validatePackagedSkillDir(repoRoot, packageDir) {
  const skillFile = join(packageDir, 'SKILL.md');
  const packageMetadata = readPackageMetadata(packageDir);
  const issues = [];
  let skillMetadata = null;

  try {
    skillMetadata = parseSkillFrontmatterFile(skillFile);
  } catch (error) {
    issues.push({
      code: error.code || 'invalid_skill_file',
      message: error.message,
    });
  }

  if (!packageMetadata.packageName) {
    issues.push({
      code: 'missing_package_name',
      message: 'package.json missing "name"',
    });
  }

  if (!packageMetadata.packageVersion) {
    issues.push({
      code: 'missing_package_version',
      message: 'package.json missing "version"',
    });
  }

  if (packageMetadata.files && !packageMetadata.files.includes('SKILL.md')) {
    issues.push({
      code: 'skill_not_published',
      message: 'package.json files does not include SKILL.md',
    });
  }

  if (isManagedPackageName(packageMetadata.packageName)) {
    if (!packageMetadata.repository) {
      issues.push({
        code: 'missing_repository',
        message: 'package.json missing repository for private registry publishing',
      });
    }

    if (packageMetadata.publishConfigRegistry !== GITHUB_PACKAGES_REGISTRY) {
      issues.push({
        code: 'invalid_publish_registry',
        message: `package.json publishConfig.registry must target ${GITHUB_PACKAGES_REGISTRY}`,
      });
    }
  }

  if (skillMetadata) {
    if (skillMetadata.status && !['deprecated', 'retired'].includes(skillMetadata.status)) {
      issues.push({
        code: 'invalid_skill_status',
        message: 'metadata.status must be "deprecated" or "retired"',
      });
    }

    if (skillMetadata.replacement && !skillMetadata.replacement.startsWith('@')) {
      issues.push({
        code: 'invalid_replacement',
        message: 'metadata.replacement must be a package name',
      });
    }

    for (const sourcePath of skillMetadata.sources) {
      if (!existsSync(join(repoRoot, sourcePath))) {
        issues.push({
          code: 'missing_source',
          message: 'declared source file does not exist',
          path: sourcePath,
        });
      }
    }

    for (const requirement of skillMetadata.requires) {
      if (!packageMetadata.dependencies[requirement]) {
        issues.push({
          code: 'missing_dependency_declaration',
          message: 'required skill is not declared in package dependencies',
          dependency: requirement,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    name: skillMetadata?.name || null,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    skillFile: normalizeDisplayPath(repoRoot, skillFile),
    packagePath: normalizeDisplayPath(repoRoot, packageDir),
    status: skillMetadata?.status || null,
    replacement: skillMetadata?.replacement || null,
    nextSteps: buildValidateNextSteps(packageMetadata, issues.length === 0),
    issues,
  };
}

export function validateSkills(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const packageDirs = resolvePackagedSkillTarget(repoRoot, target);

  for (const packageDir of packageDirs) {
    syncSkillDependencies(packageDir);
  }

  const skills = packageDirs
    .map((packageDir) => validatePackagedSkillDir(repoRoot, packageDir))
    .sort((a, b) => (a.packageName || a.packagePath).localeCompare(b.packageName || b.packagePath));

  const validCount = skills.filter((skill) => skill.valid).length;
  const invalidCount = skills.length - validCount;

  if (validCount > 0) {
    const buildState = readBuildState(repoRoot);

    for (const packageDir of packageDirs) {
      const packageMetadata = readPackageMetadata(packageDir);
      const result = skills.find((skill) => skill.packageName === packageMetadata.packageName);
      if (!result?.valid) continue;

      const { packageName, record } = buildStateRecordForPackageDir(repoRoot, packageDir, {
        parseSkillFrontmatterFile,
        readPackageMetadata,
        normalizeDisplayPath,
      });
      if (!packageName) continue;
      buildState.skills[packageName] = record;
    }

    writeBuildState(repoRoot, buildState);
  }

  return {
    valid: invalidCount === 0,
    count: skills.length,
    validCount,
    invalidCount,
    skills,
  };
}
function normalizeRelativePath(pathValue) {
  return pathValue.split('\\').join('/');
}

function normalizeRequestedTarget(target, cwd = process.cwd()) {
  if (typeof target !== 'string') return target;
  if (target.startsWith('@')) return target;
  return normalizeRelativePath(resolve(cwd, target));
}

function listPackagedSkillDirs(repoRoot) {
  const stack = [repoRoot];
  const results = [];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasSkillFile = false;
    let hasPackageFile = false;

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agentpack') continue;
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.name === 'SKILL.md') hasSkillFile = true;
      if (entry.name === 'package.json') hasPackageFile = true;
    }

    if (hasSkillFile && hasPackageFile) {
      results.push(current);
    }
  }

  return results.sort();
}

function listAuthoredPackagedSkills(repoRoot) {
  return listPackagedSkillDirs(repoRoot)
    .map((packageDir) => {
      const skillFile = join(packageDir, 'SKILL.md');
      const metadata = parseSkillFrontmatterFile(skillFile);
      const packageMetadata = readPackageMetadata(packageDir);

      if (!packageMetadata.packageName || !packageMetadata.packageVersion) {
        return null;
      }

      return {
        name: metadata.name,
        description: metadata.description,
        packageName: packageMetadata.packageName,
        packageVersion: packageMetadata.packageVersion,
        skillPath: normalizeDisplayPath(repoRoot, packageDir),
        skillFile: normalizeDisplayPath(repoRoot, skillFile),
        sources: metadata.sources,
        requires: metadata.requires,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function generateSkillsCatalog({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const skills = {};

  for (const skill of listAuthoredPackagedSkills(repoRoot)) {
    skills[skill.packageName] = {
      name: skill.name,
      description: skill.description,
      path: skill.skillPath,
      skill_file: skill.skillFile,
      package_name: skill.packageName,
      package_version: skill.packageVersion,
      sources: skill.sources,
      requires: skill.requires,
    };
  }

  return {
    version: 1,
    skills,
  };
}

export function generateBuildState({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const skills = {};

  for (const skill of listAuthoredPackagedSkills(repoRoot)) {
    const sources = {};
    for (const sourcePath of skill.sources) {
      sources[sourcePath] = {
        hash: hashFile(join(repoRoot, sourcePath)),
      };
    }

    skills[skill.packageName] = {
      package_version: skill.packageVersion,
      skill_path: skill.skillPath,
      skill_file: skill.skillFile,
      sources,
      requires: skill.requires,
    };
  }

  return {
    version: 1,
    skills,
  };
}

export function listStaleSkills({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const buildState = readBuildState(repoRoot);
  const staleSkills = [];

  for (const packageDir of listPackagedSkillDirs(repoRoot)) {
    const packageMetadata = readPackageMetadata(packageDir);
    if (!packageMetadata.packageName) continue;

    const record = buildState.skills?.[packageMetadata.packageName];
    if (!record) continue;

    const changedSources = compareRecordedSources(repoRoot, record);
    if (changedSources.length === 0) continue;

    staleSkills.push({
      packageName: packageMetadata.packageName,
      skillPath: normalizeDisplayPath(repoRoot, packageDir),
      skillFile: normalizeDisplayPath(repoRoot, join(packageDir, 'SKILL.md')),
      changedSources,
    });
  }

  return staleSkills.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function inspectStaleSkill(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const staleSkills = listStaleSkills({ cwd });

  let match = null;

  if (target.startsWith('@')) {
    match = staleSkills.find((skill) => skill.packageName === target) || null;
  } else {
    const skillFile = resolveSkillFileTarget(repoRoot, target);
    if (skillFile) {
      const displayPath = normalizeDisplayPath(repoRoot, skillFile);
      match = staleSkills.find((skill) => skill.skillFile === displayPath) || null;
    }
  }

  if (!match) {
    throw new NotFoundError('stale skill not found', {
      code: 'stale_skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  return match;
}

function listInstalledPackageDirs(nodeModulesDir) {
  if (!existsSync(nodeModulesDir)) return [];

  const packageDirs = [];
  const entries = readdirSync(nodeModulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    if (entry.name.startsWith('@')) {
      const scopeDir = join(nodeModulesDir, entry.name);
      const scopedEntries = readdirSync(scopeDir, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;
        packageDirs.push(join(scopeDir, scopedEntry.name));
      }
      continue;
    }

    packageDirs.push(join(nodeModulesDir, entry.name));
  }

  return packageDirs;
}

function collectLocalInstallTargets(initialTarget) {
  const resolvedTarget = resolve(initialTarget);
  const queue = [resolvedTarget];
  const visited = new Set();
  const installTargets = [];

  while (queue.length > 0) {
    const packageDir = queue.shift();
    if (visited.has(packageDir)) continue;
    visited.add(packageDir);
    installTargets.push(packageDir);

    const packageJsonPath = join(packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) continue;

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const dependencies = pkg.dependencies || {};

    for (const spec of Object.values(dependencies)) {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
      queue.push(resolve(packageDir, spec.slice(5)));
    }
  }

  return installTargets;
}

function resolveNpmInstallTargets(directTargetMap) {
  const npmInstallTargets = [];

  for (const requestedTarget of directTargetMap.values()) {
    if (typeof requestedTarget === 'string' && requestedTarget.startsWith('@')) {
      npmInstallTargets.push(requestedTarget);
      continue;
    }

    npmInstallTargets.push(...collectLocalInstallTargets(requestedTarget));
  }

  return [...new Set(npmInstallTargets)];
}

export function installSkills(targets, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const previousState = readInstallState(repoRoot);
  const requestedTargets = Array.isArray(targets) ? targets : [targets];
  const directTargetMap = new Map(
    Object.entries(previousState.installs || {})
      .filter(([, install]) => install.direct && install.requested_target)
      .map(([packageName, install]) => [packageName, install.requested_target])
  );

  for (const target of requestedTargets) {
    if (typeof target === 'string' && target.startsWith('@')) {
      directTargetMap.set(target, normalizeRequestedTarget(target, cwd));
      continue;
    }

    const skillFile = resolveSkillFileTarget(repoRoot, target)
      || (existsSync(target) ? resolveSkillFileTarget(repoRoot, target) : null);
    const packageDir = skillFile ? dirname(skillFile) : resolve(target);
    const packageMetadata = readPackageMetadata(packageDir);

    if (!packageMetadata.packageName) {
      throw new NotFoundError('install target is not a packaged skill', {
        code: 'invalid_install_target',
        suggestion: `Target: ${target}`,
      });
    }

    directTargetMap.set(packageMetadata.packageName, normalizeRequestedTarget(target, cwd));
  }

  const uniqueInstallTargets = resolveNpmInstallTargets(directTargetMap);

  execFileSync('npm', ['install', '--no-save', ...uniqueInstallTargets], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return rebuildInstallState(repoRoot, directTargetMap, {
    listInstalledPackageDirs,
    parseSkillFrontmatterFile,
    readPackageMetadata,
    normalizeRelativePath,
  });
}

export function inspectSkillsEnv({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const state = readInstallState(repoRoot);
  const installs = Object.entries(state.installs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packageName, install]) => ({
      ...readInstalledSkillLifecycle(repoRoot, install.source_package_path),
      packageName,
      direct: install.direct,
      packageVersion: install.package_version,
      sourcePackagePath: install.source_package_path,
      materializations: install.materializations || [],
    }));

  return {
    repoRoot,
    installs,
  };
}

function readInstalledSkillLifecycle(repoRoot, sourcePackagePath) {
  if (!sourcePackagePath) {
    return {
      requires: [],
      status: null,
      replacement: null,
      message: null,
    };
  }

  const skillFile = join(repoRoot, sourcePackagePath, 'SKILL.md');
  if (!existsSync(skillFile)) {
    return {
      requires: [],
      status: null,
      replacement: null,
      message: null,
    };
  }

  const metadata = parseSkillFrontmatterFile(skillFile);
  return {
    requires: metadata.requires,
    status: metadata.status,
    replacement: metadata.replacement,
    message: metadata.message,
  };
}

function buildInstallCommand(packageName) {
  return `agentpack skills install ${packageName}`;
}

function listLocalWorkbenchSkillRecords(repoRoot) {
  const records = [];

  for (const workbench of findAllWorkbenches(repoRoot)) {
    const skillsDir = join(workbench.path, 'skills');
    if (!existsSync(skillsDir)) continue;

    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(skillsDir, entry.name);
      const skillFile = join(skillDir, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      if (existsSync(join(skillDir, 'package.json'))) continue;

      const metadata = parseSkillFrontmatterFile(skillFile);
      records.push({
        packageName: null,
        name: metadata.name,
        skillFile: normalizeDisplayPath(repoRoot, skillFile),
        direct: true,
        requires: metadata.requires,
      });
    }
  }

  return records.sort((a, b) => a.skillFile.localeCompare(b.skillFile));
}

function buildMissingRecordForRequirements(subject, installed) {
  const missing = (subject.requires || [])
    .filter((requirement) => !installed.has(requirement))
    .sort((a, b) => a.localeCompare(b))
    .map((packageName) => ({
      packageName,
      recommendedCommand: buildInstallCommand(packageName),
    }));

  if (missing.length === 0) return null;

  return {
    packageName: subject.packageName || null,
    name: subject.name || null,
    skillFile: subject.skillFile || null,
    direct: Boolean(subject.direct),
    missing,
  };
}

function parseSimpleSemver(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSimpleSemver(left, right) {
  const a = parseSimpleSemver(left);
  const b = parseSimpleSemver(right);
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function classifyUpdateType(currentVersion, availableVersion) {
  const current = parseSimpleSemver(currentVersion);
  const next = parseSimpleSemver(availableVersion);
  if (!current || !next) return 'unknown';
  if (next.major !== current.major) return 'major';
  if (next.minor !== current.minor) return 'minor';
  if (next.patch !== current.patch) return 'patch';
  return 'none';
}

export function inspectMissingSkillDependencies({
  target = null,
  cwd = process.cwd(),
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const env = inspectSkillsEnv({ cwd });
  const installed = new Set(env.installs.map((install) => install.packageName));
  const installedRecords = env.installs.map((install) => ({
    packageName: install.packageName,
    name: null,
    skillFile: install.sourcePackagePath ? `${install.sourcePackagePath}/SKILL.md` : null,
    direct: install.direct,
    requires: install.requires,
  }));
  const localWorkbenchRecords = listLocalWorkbenchSkillRecords(repoRoot);

  let records = [...installedRecords, ...localWorkbenchRecords];
  if (target) {
    if (target.startsWith('@')) {
      records = installedRecords.filter((install) => install.packageName === target);
    } else {
      const skillFile = resolveSkillFileTarget(repoRoot, target);
      if (!skillFile) {
        throw new NotFoundError('skill not found', {
          code: 'skill_not_found',
          suggestion: `Target: ${target}`,
        });
      }

      const packageMetadata = readPackageMetadata(dirname(skillFile));
      if (packageMetadata.packageName) {
        records = installedRecords.filter((install) => install.packageName === packageMetadata.packageName);
      } else {
        const metadata = parseSkillFrontmatterFile(skillFile);
        records = [{
          packageName: null,
          name: metadata.name,
          skillFile: normalizeDisplayPath(repoRoot, skillFile),
          direct: true,
          requires: metadata.requires,
        }];
      }
    }
  }

  const skills = records
    .map((record) => buildMissingRecordForRequirements(record, installed))
    .filter(Boolean)
    .sort((a, b) => {
      const left = a.packageName || a.skillFile || a.name || '';
      const right = b.packageName || b.skillFile || b.name || '';
      return left.localeCompare(right);
    });

  return {
    count: skills.length,
    skills,
  };
}

export async function listOutdatedSkills({
  cwd = process.cwd(),
  discoveryRoot = process.env.AGENTPACK_DISCOVERY_ROOT,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const state = readInstallState(repoRoot);
  const authoredRoot = discoveryRoot ? resolve(discoveryRoot) : repoRoot;
  const registryConfig = readRepoNpmRegistryConfig(repoRoot);
  const skills = [];

  for (const [packageName, install] of Object.entries(state.installs || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const currentVersion = install.package_version;
    let availableVersion = null;
    let availablePackagePath = null;
    let source = 'none';

    if (isManagedPackageName(packageName) && registryConfig.registry) {
      availableVersion = await fetchRegistryLatestVersion(packageName, registryConfig);
      source = availableVersion ? 'registry' : 'none';
    }

    if (!availableVersion) {
      const availableDir = findPackageDirByName(authoredRoot, packageName);
      if (availableDir) {
        const availableMeta = readPackageMetadata(availableDir);
        availableVersion = availableMeta.packageVersion;
        availablePackagePath = normalizeRelativePath(relative(authoredRoot, availableDir));
        source = 'local';
      }
    }

    if (!currentVersion || !availableVersion) continue;
    if (compareSimpleSemver(availableVersion, currentVersion) <= 0) continue;

    skills.push({
      packageName,
      currentVersion,
      availableVersion,
      updateType: classifyUpdateType(currentVersion, availableVersion),
      currentSourcePackagePath: install.source_package_path,
      availablePackagePath,
      source,
      recommendedCommand: buildInstallCommand(packageName),
    });
  }

  return {
    count: skills.length,
    skills,
  };
}

export async function inspectSkillsStatus({ cwd = process.cwd() } = {}) {
  const env = inspectSkillsEnv({ cwd });
  const registry = inspectRegistryConfig({ cwd });
  const outdatedResult = await listOutdatedSkills({ cwd });
  const missingResult = inspectMissingSkillDependencies({ cwd });

  const installedCount = env.installs.length;
  const directCount = env.installs.filter((install) => install.direct).length;
  const transitiveCount = installedCount - directCount;
  const outdatedCount = outdatedResult.count;
  const deprecated = env.installs
    .filter((install) => install.status === 'deprecated' || install.status === 'retired')
    .map((install) => ({
      packageName: install.packageName,
      status: install.status,
      replacement: install.replacement,
      message: install.message,
    }));
  const deprecatedCount = deprecated.length;
  const incomplete = missingResult.skills;
  const incompleteCount = missingResult.count;

  let health = 'healthy';
  if (!registry.configured) {
    health = installedCount > 0 || outdatedCount > 0 ? 'attention-needed' : 'needs-config';
  } else if (outdatedCount > 0 || deprecatedCount > 0 || incompleteCount > 0) {
    health = 'attention-needed';
  } else if (incompleteCount > 0) {
    health = 'attention-needed';
  }

  return {
    repoRoot: env.repoRoot,
    installedCount,
    directCount,
    transitiveCount,
    outdatedCount,
    deprecatedCount,
    incompleteCount,
    registry,
    outdated: outdatedResult.skills,
    deprecated,
    incomplete,
    installs: env.installs,
    health,
  };
}

export function uninstallSkills(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const previousState = readInstallState(repoRoot);

  const nextDirectTargetMap = new Map(
    Object.entries(previousState.installs || {})
      .filter(([packageName, install]) => install.direct && packageName !== target)
      .map(([packageName, install]) => [packageName, install.requested_target])
  );

  removePathIfExists(join(repoRoot, 'node_modules'));

  const nextInstallTargets = resolveNpmInstallTargets(nextDirectTargetMap);
  if (nextInstallTargets.length > 0) {
    execFileSync('npm', ['install', '--no-save', ...nextInstallTargets], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  const nextState = rebuildInstallState(repoRoot, nextDirectTargetMap, {
    listInstalledPackageDirs,
    parseSkillFrontmatterFile,
    readPackageMetadata,
    normalizeRelativePath,
  });
  const remainingTargets = new Set(
    Object.values(nextState.installs)
      .flatMap((install) => (install.materializations || []).map((entry) => entry.target))
  );

  const removedPackages = [];

  for (const [packageName, install] of Object.entries(previousState.installs || {})) {
    if (nextState.installs[packageName]) continue;
    removedPackages.push(packageName);

    for (const materialization of install.materializations || []) {
      const absTarget = join(repoRoot, materialization.target);
      if (!remainingTargets.has(materialization.target)) {
        removePathIfExists(absTarget);
      }
    }
  }

  return {
    version: nextState.version,
    installs: nextState.installs,
    removed: removedPackages.sort(),
  };
}

function resolvePackageDirsFromWorkbench(workbench, repoRoot) {
  const skillsDir = join(workbench.path, 'skills');
  if (!existsSync(skillsDir)) {
    return [];
  }

  const packageDirs = [];
  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const metadata = parseSkillFrontmatterFile(skillFile);
    for (const requirement of metadata.requires) {
      const packageDir = findPackageDirByName(repoRoot, requirement);
      if (packageDir) {
        packageDirs.push(packageDir);
      }
    }
  }

  return [...new Set(packageDirs)].sort();
}

export function resolveInstallTargets({
  target,
  workbench: workbenchArg,
  cwd = process.cwd(),
} = {}) {
  if (target) {
    return Array.isArray(target) ? target : [target];
  }

  const repoRoot = findRepoRoot(cwd);
  let workbench = null;

  if (workbenchArg) {
    workbench = resolveWorkbenchFlag(workbenchArg, cwd);
  } else {
    workbench = findWorkbenchContext(cwd);
  }

  if (!workbench) {
    throw new NotFoundError('no install target provided and no workbench context found', {
      code: 'missing_install_target',
      suggestion: 'Pass a packaged skill target or use --workbench <path>',
    });
  }

  const targets = resolvePackageDirsFromWorkbench(workbench, repoRoot);
  if (targets.length === 0) {
    throw new NotFoundError('no external skill dependencies found for workbench', {
      code: 'no_workbench_skill_roots',
      suggestion: `Workbench: ${workbench.relativePath}`,
    });
  }

  return targets;
}
