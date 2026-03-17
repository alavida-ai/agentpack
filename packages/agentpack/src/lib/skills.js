import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCompiledStateUseCase } from '../application/skills/build-compiled-state.js';
import { findAllWorkbenches, findRepoRoot } from './context.js';
import { findPackageDirByName } from '../domain/skills/package-discovery.js';
import {
  buildSkillGraph,
} from '../domain/skills/skill-graph.js';
import { readCompiledState } from '../infrastructure/fs/compiled-state-repository.js';
import { readDevSession, writeDevSession, removeDevSession } from '../infrastructure/fs/dev-session-repository.js';
import {
  ensureSkillLink,
  removePathIfExists,
  removeSkillLinks,
  removeSkillLinksByPaths,
  removeSkillLinksByNames,
} from '../infrastructure/runtime/materialize-skills.js';
import {
  normalizeDisplayPath,
  normalizeRepoPath,
  readInstalledSkillExports,
  readPackageMetadata,
} from '../domain/skills/skill-model.js';
import { isGeneratedPackagePath } from '../domain/skills/generated-package-paths.js';
import { extractFrontmatter, hasLegacyFrontmatterFields } from '../domain/compiler/skill-document-parser.js';
import { listAuthoredSkillPackages } from '../domain/skills/skill-catalog.js';
import {
  ensureResolvedExportIsValid,
  resolveSingleSkillTarget,
  resolveSkillTarget,
  loadSkillTargetContext,
} from '../domain/skills/skill-target-resolution.js';
import { compileSkillDocument } from '../domain/compiler/skill-compiler.js';
import { hashFile } from '../domain/compiler/source-hash.js';
import { startSkillDevWorkbench } from '../application/skills/start-skill-dev-workbench.js';
import { computeRuntimeSelectionUseCase } from '../application/skills/compute-runtime-selection.js';
import { materializeRuntimeSelectionUseCase } from '../application/skills/materialize-runtime-selection.js';
import { AgentpackError, EXIT_CODES, NotFoundError, ValidationError } from '../utils/errors.js';

const MANAGED_PACKAGE_SCOPES = ['@alavida', '@alavida-ai'];

function readCompilerSkillDocument(skillFilePath) {
  const content = readFileSync(skillFilePath, 'utf-8');
  const { frontmatterText } = extractFrontmatter(content);
  if (!content.includes('```agentpack') && hasLegacyFrontmatterFields(frontmatterText)) {
    throw new ValidationError(
      'Legacy SKILL.md authoring is not supported. Use an `agentpack` declaration block and explicit body references.',
      {
        code: 'legacy_authoring_not_supported',
        path: skillFilePath,
      }
    );
  }

  return compileSkillDocument(content);
}

function listCompilerSkillRequirements(compiledDocument) {
  return [...new Set(
    Object.values(compiledDocument.skillImports).map((entry) => entry.target)
  )].sort((a, b) => a.localeCompare(b));
}

function listCompilerPackageDependencies(compiledDocument) {
  return [...new Set(
    Object.values(compiledDocument.skillImports).map((entry) => entry.packageSpecifier)
  )].sort((a, b) => a.localeCompare(b));
}

function isManagedPackageName(packageName) {
  return typeof packageName === 'string'
    && MANAGED_PACKAGE_SCOPES.some((scope) => packageName.startsWith(`${scope}/`));
}

function inferManagedScope(packageName) {
  return MANAGED_PACKAGE_SCOPES.find((scope) => packageName?.startsWith(`${scope}/`)) || null;
}

function collectUnresolvedSelectionRequirements(repoRoot, selection, { cwd = repoRoot } = {}) {
  const unresolved = new Set();

  for (const selectedExport of selection.exports || []) {
    for (const requirement of selectedExport.skillImports?.map((entry) => entry.target) || []) {
      let dependency;
      try {
        dependency = ensureResolvedExportIsValid(
          resolveSingleSkillTarget(repoRoot, requirement, { includeInstalled: false, cwd })
        );
      } catch {
        unresolved.add(requirement);
        continue;
      }
      void dependency;
    }
  }

  return [...unresolved].sort((a, b) => a.localeCompare(b));
}

function resolveLocalPackagedSkillDir(repoRoot, target) {
  const resolved = ensureResolvedExportIsValid(
    resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false })
  );
  return {
    skillDir: resolved.export.skillDirPath,
    skillFile: resolved.export.skillFilePath,
    packageDir: resolved.package.packageDir,
    packageJsonPath: join(resolved.package.packageDir, 'package.json'),
    packageName: resolved.package.packageName,
    skillName: resolved.export.name,
  };
}

function buildLocalDependencyPackages(repoRoot, rootResolved, { cwd }) {
  const context = loadSkillTargetContext(repoRoot, { includeInstalled: false });
  const authoredGraph = context.authoredGraph;
  if (!authoredGraph || !rootResolved?.export) return;

  const queue = [rootResolved.export.id];
  const seenExports = new Set();
  const builtPackages = new Set([rootResolved.package.packageName]);

  while (queue.length > 0) {
    const exportId = queue.shift();
    if (seenExports.has(exportId)) continue;
    seenExports.add(exportId);

    const exportNode = authoredGraph.exports?.[exportId];
    if (!exportNode?.compiled) continue;

    for (const skillImport of Object.values(exportNode.compiled.skillImports || {})) {
      let dependency;
      try {
        dependency = ensureResolvedExportIsValid(
          resolveSingleSkillTarget(repoRoot, skillImport.target, { includeInstalled: false, cwd })
        );
      } catch {
        continue;
      }

      queue.push(dependency.export.id);
      if (builtPackages.has(dependency.package.packageName)) continue;
      buildCompiledStateUseCase(dependency.package.packageDir, { cwd });
      builtPackages.add(dependency.package.packageName);
    }
  }
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

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'EPERM') return true;
    if (error.code === 'ESRCH') return false;
    return false;
  }
}

function buildDevSessionNextSteps(command) {
  return [{
    action: 'run_command',
    command,
    reason: 'Use the dev session cleanup flow to remove recorded linked skills for this repo',
  }];
}

function toDevSessionRecord(repoRoot, target, result, existing = null) {
  const now = new Date().toISOString();
  const rootSkill = result.linkedSkills.find((entry) => entry.name === result.name) || result.linkedSkills[0] || null;
  return {
    version: 1,
    session_id: existing?.session_id || `dev-${now.replaceAll(':', '-').replaceAll('.', '-')}`,
    status: 'active',
    pid: process.pid,
    repo_root: repoRoot,
    target,
    root_skill: rootSkill
      ? {
        name: rootSkill.name,
        package_name: rootSkill.packageName,
        path: rootSkill.path,
      }
      : null,
    linked_skills: result.linkedSkills.map((entry) => ({
      name: entry.name,
      package_name: entry.packageName,
      path: entry.path,
    })),
    links: result.links,
    started_at: existing?.started_at || now,
    updated_at: now,
  };
}

function cleanupRecordedDevSession(repoRoot, session, status = 'stale') {
  if (!session) {
    return {
      cleaned: false,
      removed: [],
      session: null,
    };
  }

  writeDevSession(repoRoot, {
    ...session,
    status,
    updated_at: new Date().toISOString(),
  });
  const removed = removeSkillLinksByPaths(repoRoot, session.links || [], normalizeDisplayPath);
  removeDevSession(repoRoot);
  return {
    cleaned: removed.length > 0 || Boolean(session),
    removed,
    session,
  };
}

function reconcileDevSession(repoRoot) {
  const session = readDevSession(repoRoot);
  if (!session) return null;

  if (session.status === 'active' && isProcessAlive(session.pid)) {
    throw new AgentpackError('An author dev session is already active in this repo', {
      code: 'skills_dev_session_active',
      exitCode: EXIT_CODES.GENERAL,
      nextSteps: [
        ...buildDevSessionNextSteps('agentpack author dev cleanup'),
        ...buildDevSessionNextSteps('agentpack author dev cleanup --force'),
      ],
      details: {
        rootSkill: session.root_skill?.name || null,
        pid: session.pid,
        startedAt: session.started_at || null,
      },
    });
  }

  return cleanupRecordedDevSession(repoRoot, session, 'stale');
}

export function syncSkillDependencies(skillDir) {
  const { packageJsonPath, packageJson } = readPackageJson(skillDir);
  const currentPackageName = packageJson.name || null;
  const required = [...new Set(
    readInstalledSkillExports(skillDir).flatMap((entry) => {
      const compiled = readCompilerSkillDocument(entry.skillFile);
      return listCompilerPackageDependencies(compiled)
        .map((dependency) => packageNameForRequirement(dependency))
        .filter((dependency) => dependency && dependency !== currentPackageName);
    })
  )].sort((a, b) => a.localeCompare(b));
  const nextDependencies = { ...(packageJson.dependencies || {}) };
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
    const { skillDir, packageDir } = resolveLocalPackagedSkillDir(repoRoot, target);
    const resolved = ensureResolvedExportIsValid(
      resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false, cwd })
    );
    const buildResult = buildCompiledStateUseCase(target, { cwd });
    buildLocalDependencyPackages(repoRoot, resolved, { cwd });
    const selection = computeRuntimeSelectionUseCase({
      cwd,
      mode: 'closure',
      packageName: buildResult.packageName,
      exportId: resolved.export.id,
    });
    const materialization = materializeRuntimeSelectionUseCase(repoRoot, selection);
    const synced = sync
      ? syncSkillDependencies(packageDir)
      : {
        skillDir: packageDir,
        packageJsonPath: join(packageDir, 'package.json'),
        added: [],
        removed: [],
        unchanged: true,
      };
    const linkedSkills = selection.exports.map((entry) => ({
      name: entry.name,
      path: entry.runtimePath || entry.skillPath,
      packageName: entry.packageName,
    }));
    const rootSkill = linkedSkills.find((entry) => entry.name === resolved.export.name) || linkedSkills[0];
    const links = Object.values(materialization.outputs).flatMap((entries) => entries.map((entry) => entry.target));
    const unresolved = collectUnresolvedSelectionRequirements(repoRoot, selection, { cwd });

    return {
      name: rootSkill.name,
      path: normalizeDisplayPath(repoRoot, skillDir),
      linked: true,
      links,
      linkedSkills,
      unresolved,
      synced,
    };
  } catch (error) {
    if (error instanceof AgentpackError) {
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
  let skillDir;
  let packageDir;
  try {
    ({ skillDir, packageDir } = resolveLocalPackagedSkillDir(outerRepoRoot, target));
  } catch (error) {
    if (error instanceof AgentpackError) {
      throw error;
    }

    throw new AgentpackError(error.message, {
      code: error.code || 'skill_dev_failed',
      exitCode: EXIT_CODES.GENERAL,
      suggestion: error.suggestion,
    });
  }
  const repoRoot = findRepoRoot(skillDir);
  reconcileDevSession(repoRoot);
  let closed = false;
  let timer = null;
  let currentNames = [];
  let watcher = null;
  let workbench = null;
  let initialResult = null;
  let sessionRecord = null;

  const cleanup = () => {
    if (closed) return { name: currentNames[0] || null, unlinked: false, removed: [] };
    closed = true;
    clearTimeout(timer);
    if (watcher) watcher.close();
    if (workbench) workbench.close();
    if (sessionRecord) {
      writeDevSession(repoRoot, {
        ...sessionRecord,
        status: 'cleaning',
        updated_at: new Date().toISOString(),
      });
    }
    const removed = sessionRecord
      ? removeSkillLinksByPaths(repoRoot, sessionRecord.links || [], normalizeDisplayPath)
      : removeSkillLinksByNames(repoRoot, currentNames, normalizeDisplayPath);
    removeDevSession(repoRoot);
    detachProcessCleanup();
    return {
      name: sessionRecord?.root_skill?.name || currentNames[0] || null,
      unlinked: removed.length > 0,
      removed,
    };
  };

  const processCleanupHandlers = new Map();
  const attachProcessCleanup = () => {
    const exitHandler = () => cleanup();
    processCleanupHandlers.set('exit', exitHandler);
    process.once('exit', exitHandler);

    for (const eventName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => {
        cleanup();
        process.exit(0);
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
    sessionRecord = toDevSessionRecord(repoRoot, target, result, sessionRecord);
    writeDevSession(repoRoot, sessionRecord);
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

  watcher = watch(packageDir, { recursive: true }, (_eventType, filename) => {
    if (closed) return;
    if (filename && isGeneratedPackagePath(String(filename))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      Promise.resolve()
        .then(() => {
          return applyDevResult(devSkill(target, { cwd, sync }));
        })
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

export function unlinkSkill(name, { cwd = process.cwd(), recursive = false } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const session = readDevSession(repoRoot);

  if (recursive) {
    if (!session || session.root_skill?.name !== name) {
      throw new AgentpackError('Recursive unlink requires the active dev-session root skill', {
        code: 'linked_skill_recursive_unlink_requires_root',
        exitCode: EXIT_CODES.GENERAL,
        nextSteps: session?.root_skill?.name
          ? [{
            action: 'run_command',
            command: `agentpack author unlink ${session.root_skill.name} --recursive`,
            reason: 'Recursive unlink in v1 only works for the recorded dev-session root skill',
          }]
          : buildDevSessionNextSteps('agentpack author dev cleanup --force'),
        details: {
          rootSkill: session?.root_skill?.name || null,
        },
      });
    }

    const removed = removeSkillLinksByPaths(repoRoot, session.links || [], normalizeDisplayPath);
    removeDevSession(repoRoot);
    return {
      name,
      unlinked: removed.length > 0,
      removed,
    };
  }

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

export function cleanupSkillDevSession({ cwd = process.cwd(), force = false } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const session = readDevSession(repoRoot);
  if (!session) {
    return {
      cleaned: false,
      active: false,
      removed: [],
    };
  }

  if (!force && session.status === 'active' && isProcessAlive(session.pid)) {
    throw new AgentpackError('An author dev session is still active in this repo', {
      code: 'skills_dev_session_active',
      exitCode: EXIT_CODES.GENERAL,
      nextSteps: [
        ...buildDevSessionNextSteps('agentpack author dev cleanup'),
        ...buildDevSessionNextSteps('agentpack author dev cleanup --force'),
      ],
      details: {
        rootSkill: session.root_skill?.name || null,
        pid: session.pid,
        startedAt: session.started_at || null,
      },
    });
  }

  const result = cleanupRecordedDevSession(repoRoot, session, 'stale');
  return {
    cleaned: true,
    active: false,
    forced: force,
    name: session.root_skill?.name || null,
    removed: result.removed,
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
      reason: 'publish the versioned package with npm',
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

function isPublishedSkillFile(files, relativeSkillFile) {
  if (!files) return true;
  const normalizedSkillFile = normalizeFilesFieldEntry(relativeSkillFile);
  return files.some((entry) => {
    const normalizedEntry = normalizeFilesFieldEntry(entry);
    return normalizedEntry === normalizedSkillFile || normalizedSkillFile.startsWith(`${normalizedEntry}/`);
  });
}

function packageNameForRequirement(requirement) {
  if (typeof requirement !== 'string') return null;
  const colonIndex = requirement.indexOf(':');
  return colonIndex === -1 ? requirement : requirement.slice(0, colonIndex);
}

function normalizeFilesFieldEntry(entry) {
  if (typeof entry !== 'string') return '';
  return entry
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function isInvalidDependencyName(dependency) {
  return typeof dependency === 'string' && dependency.includes(':');
}

function buildSourceValidationDetails(repoRoot, skillExport) {
  const compiledState = readCompiledState(repoRoot);
  const previousHashes = new Map(
    (compiledState?.sourceFiles || []).map((entry) => [entry.path, entry.hash])
  );

  return (skillExport.sources || []).map((sourcePath) => {
    const absolutePath = join(repoRoot, sourcePath);
    const exists = existsSync(absolutePath);
    const currentHash = exists ? hashFile(absolutePath) : null;
    const previousHash = previousHashes.get(sourcePath) || null;

    return {
      path: sourcePath,
      absolutePath,
      exists,
      currentHash,
      previousHash,
      status: previousHash === null
        ? 'new'
        : previousHash === currentHash
          ? 'unchanged'
          : 'changed',
    };
  });
}

function buildDependencyValidationDetails(skillExport, packageMetadata) {
  return (skillExport.requires || []).map((requirement) => {
    const dependency = packageNameForRequirement(requirement);
    return {
      requirement,
      dependency,
      samePackage: dependency === packageMetadata.packageName,
      declared: Boolean(dependency && packageMetadata.dependencies[dependency]),
    };
  });
}

export function validatePackagedSkillExport(repoRoot, pkg, skillExport, options = {}) {
  const packageMetadata = readPackageMetadata(pkg.packageDir);
  const issues = [];
  const metadataStatus = skillExport.lifecycleStatus || null;
  const rootSkillFilePath = join(pkg.packageDir, 'SKILL.md');

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

  if (!isPublishedSkillFile(packageMetadata.files, skillExport.relativeSkillFile)) {
    issues.push({
      code: 'skill_not_published',
      message: `package.json files does not include ${skillExport.relativeSkillFile}`,
    });
  }

  if (
    packageMetadata.skillRoot
    && packageMetadata.files?.some((entry) => normalizeFilesFieldEntry(entry) === 'SKILL.md')
    && !existsSync(rootSkillFilePath)
  ) {
    issues.push({
      code: 'missing_root_skill_file',
      message: 'package.json files includes SKILL.md but the root SKILL.md is missing',
      path: normalizeDisplayPath(repoRoot, rootSkillFilePath),
    });
  }

  if (isManagedPackageName(packageMetadata.packageName)) {
    if (!packageMetadata.repository) {
      issues.push({
        code: 'missing_repository',
        message: 'package.json missing repository for private registry publishing',
      });
    }
  }

  if (metadataStatus && !['deprecated', 'retired'].includes(metadataStatus)) {
    issues.push({
      code: 'invalid_skill_status',
      message: 'metadata.status must be "deprecated" or "retired"',
    });
  }

  if (skillExport.replacement && !skillExport.replacement.startsWith('@')) {
    issues.push({
      code: 'invalid_replacement',
      message: 'metadata.replacement must be a package name',
    });
  }

  for (const sourcePath of skillExport.sources || []) {
    if (!existsSync(join(repoRoot, sourcePath))) {
      issues.push({
        code: 'missing_source',
        message: 'declared source file does not exist',
        path: sourcePath,
      });
    }
  }

  for (const dependency of Object.keys(packageMetadata.dependencies || {}).sort((a, b) => a.localeCompare(b))) {
    if (!isInvalidDependencyName(dependency)) continue;
    issues.push({
      code: 'invalid_dependency_name',
      message: 'package.json dependency name is not a valid npm package name',
      dependency,
    });
  }

  for (const requirement of skillExport.requires || []) {
    const dependencyName = packageNameForRequirement(requirement);
    if (dependencyName === packageMetadata.packageName) {
      continue;
    }
    if (!packageMetadata.dependencies[dependencyName]) {
      issues.push({
        code: 'missing_dependency_declaration',
        message: 'required skill package is not declared in package dependencies',
        dependency: dependencyName,
      });
    }
  }

  const details = options.verbose
    ? {
        sources: buildSourceValidationDetails(repoRoot, skillExport),
        dependencies: buildDependencyValidationDetails(skillExport, packageMetadata),
      }
    : null;

  return {
    valid: issues.length === 0,
    key: skillExport.key,
    name: skillExport.name || null,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    skillFile: skillExport.skillFile,
    packagePath: pkg.packagePath,
    status: metadataStatus,
    replacement: skillExport.replacement || null,
    nextSteps: buildValidateNextSteps(packageMetadata, issues.length === 0),
    ...(details ? { details } : {}),
    issues,
  };
}

export function validateSkills(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  let targets = [];

  if (target) {
    const resolved = resolveSkillTarget(repoRoot, target, { includeInstalled: false });
    targets = resolved.kind === 'export'
      ? [{ package: resolved.package, export: resolved.export }]
      : resolved.exports.map((entry) => ({ package: resolved.package, export: entry }));
  } else {
    targets = listAuthoredSkillPackages(repoRoot)
      .flatMap((pkg) => pkg.exports.map((entry) => ({ package: pkg, export: entry })));
  }

  for (const packageDir of [...new Set(targets.map((entry) => entry.package.packageDir))]) {
    syncSkillDependencies(packageDir);
  }

  const skills = targets
    .map((entry) => validatePackagedSkillExport(repoRoot, entry.package, entry.export))
    .sort((a, b) => (a.key || a.packageName || a.packagePath).localeCompare(b.key || b.packageName || b.packagePath));

  const validCount = skills.filter((skill) => skill.valid).length;
  const invalidCount = skills.length - validCount;

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
  return listAuthoredSkillPackages(repoRoot)
    .flatMap((pkg) => pkg.exports.map((entry) => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      packageName: entry.packageName,
      packageVersion: entry.packageVersion,
      skillPath: entry.skillPath,
      skillFile: entry.skillFile,
      sources: entry.sources,
      requires: entry.requires,
      wraps: entry.wraps,
      overrides: entry.overrides,
      declaredName: entry.declaredName,
      packagePath: pkg.packagePath,
    })))
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export function generateSkillsCatalog({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const skills = {};

  for (const skill of listAuthoredPackagedSkills(repoRoot)) {
    skills[skill.key] = {
      name: skill.name,
      description: skill.description,
      path: skill.skillPath,
      skill_file: skill.skillFile,
      package_name: skill.packageName,
      package_version: skill.packageVersion,
      sources: skill.sources,
      requires: skill.requires,
      ...(skill.wraps ? { wraps: skill.wraps } : {}),
      ...(skill.overrides?.length ? { overrides: skill.overrides } : {}),
    };
  }

  return {
    version: 1,
    skills,
  };
}
