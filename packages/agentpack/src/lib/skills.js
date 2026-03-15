import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCompiledStateUseCase } from '../application/skills/build-compiled-state.js';
import { findAllWorkbenches, findRepoRoot, findWorkbenchContext, resolveWorkbenchFlag } from './context.js';
import {
  buildSkillGraph,
} from '../domain/skills/skill-graph.js';
import { readInstallState } from '../infrastructure/fs/install-state-repository.js';
import { readCompiledState } from '../infrastructure/fs/compiled-state-repository.js';
import { readMaterializationState } from '../infrastructure/fs/materialization-state-repository.js';
import { readDevSession, writeDevSession, removeDevSession } from '../infrastructure/fs/dev-session-repository.js';
import {
  ensureSkillLink,
  rebuildInstallState,
  removePathIfExists,
  removeSkillLinks,
  removeSkillLinksByPaths,
  removeSkillLinksByNames,
} from '../infrastructure/runtime/materialize-skills.js';
import {
  buildCanonicalSkillRequirement,
  normalizeDisplayPath,
  normalizeRepoPath,
  parseSkillFrontmatterFile,
  readInstalledSkillExports,
  readPackageMetadata,
} from '../domain/skills/skill-model.js';
import { listAuthoredSkillPackages } from '../domain/skills/skill-catalog.js';
import { resolveSingleSkillTarget, resolveSkillTarget } from '../domain/skills/skill-target-resolution.js';
import { inspectMaterializedSkills } from '../infrastructure/runtime/inspect-materialized-skills.js';
import { compileSkillDocument } from '../domain/compiler/skill-compiler.js';
import { hashFile } from '../domain/compiler/source-hash.js';
import { readUserConfig } from '../infrastructure/fs/user-config-repository.js';
import { readUserCredentials } from '../infrastructure/fs/user-credentials-repository.js';
import { getUserNpmrcPath, readUserNpmrc } from '../infrastructure/fs/user-npmrc-repository.js';
import { resolveRegistryConfig } from '../domain/auth/registry-resolution.js';
import { startSkillDevWorkbench } from '../application/skills/start-skill-dev-workbench.js';
import { AgentpackError, EXIT_CODES, NetworkError, NotFoundError, ValidationError } from '../utils/errors.js';

const GITHUB_PACKAGES_REGISTRY = 'https://npm.pkg.github.com';
const MANAGED_PACKAGE_SCOPES = ['@alavida', '@alavida-ai'];

function isCompilerModeDocument(content) {
  return content.includes('```agentpack');
}

function readCompilerSkillDocument(skillFilePath) {
  const content = readFileSync(skillFilePath, 'utf-8');
  if (!isCompilerModeDocument(content)) {
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
    const compiled = readCompilerSkillDocument(skillFile);
    const packageMetadata = readPackageMetadata(skillDir);
    const requirements = listCompilerSkillRequirements(compiled);

    linkedSkills.push({
      name: compiled.metadata.name,
      skillDir,
      requires: requirements,
      packageName: packageMetadata.packageName,
    });

    for (const requirement of requirements) {
      let dependency;
      try {
        dependency = resolveSingleSkillTarget(repoRoot, requirement);
      } catch {
        unresolved.add(requirement);
        continue;
      }
      queue.push(dependency.export.skillDirPath);
    }
  }

  linkedSkills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    linkedSkills,
    unresolved: [...unresolved].sort((a, b) => a.localeCompare(b)),
  };
}

function resolveLocalPackagedSkillDir(repoRoot, target) {
  const resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false });
  return {
    skillDir: resolved.export.skillDirPath,
    skillFile: resolved.export.skillFilePath,
    packageDir: resolved.package.packageDir,
    packageJsonPath: join(resolved.package.packageDir, 'package.json'),
    packageName: resolved.package.packageName,
    skillName: resolved.export.name,
  };
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

function maybeBuildCompiledState(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  let resolved;
  try {
    resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false });
  } catch {
    return null;
  }

  const content = readFileSync(resolved.export.skillFilePath, 'utf-8');
  if (!content.includes('```agentpack')) return null;

  return buildCompiledStateUseCase(target, { cwd });
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
    throw new AgentpackError('A skills dev session is already active in this repo', {
      code: 'skills_dev_session_active',
      exitCode: EXIT_CODES.GENERAL,
      nextSteps: [
        ...buildDevSessionNextSteps('agentpack skills dev cleanup'),
        ...buildDevSessionNextSteps('agentpack skills dev cleanup --force'),
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
  const required = [...new Set(
    readInstalledSkillExports(skillDir).flatMap((entry) => {
      const compiled = readCompilerSkillDocument(entry.skillFile);
      return listCompilerPackageDependencies(compiled);
    })
  )].sort((a, b) => a.localeCompare(b));
  const { packageJsonPath, packageJson } = readPackageJson(skillDir);
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
    const { linkedSkills, unresolved } = resolveDevLinkedSkills(repoRoot, skillDir);
    const rootSkill = linkedSkills.find((entry) => entry.skillDir === skillDir);
    const synced = sync
      ? syncSkillDependencies(packageDir)
      : {
        skillDir: packageDir,
        packageJsonPath: join(packageDir, 'package.json'),
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
  let skillDir;
  try {
    ({ skillDir } = resolveLocalPackagedSkillDir(outerRepoRoot, target));
  } catch (error) {
    if (error instanceof AgentpackError && error.exitCode === EXIT_CODES.GENERAL) {
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

  maybeBuildCompiledState(target, { cwd });
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
        .then(() => {
          maybeBuildCompiledState(target, { cwd });
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
            command: `agentpack skills unlink ${session.root_skill.name} --recursive`,
            reason: 'Recursive unlink in v1 only works for the recorded dev-session root skill',
          }]
          : buildDevSessionNextSteps('agentpack skills dev cleanup --force'),
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
    throw new AgentpackError('A skills dev session is still active in this repo', {
      code: 'skills_dev_session_active',
      exitCode: EXIT_CODES.GENERAL,
      nextSteps: [
        ...buildDevSessionNextSteps('agentpack skills dev cleanup'),
        ...buildDevSessionNextSteps('agentpack skills dev cleanup --force'),
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
  const registry = matchedScope ? (config[`${matchedScope}:registry`] || null) : null;
  const authKey = registry ? `//${new URL(registry).host}/:_authToken` : null;

  return {
    npmrcPath: existsSync(npmrcPath) ? npmrcPath : null,
    scope: matchedScope,
    registry,
    authToken: authKey ? (config[authKey] || null) : null,
    alwaysAuth: String(config['always-auth'] || '').toLowerCase() === 'true',
  };
}

function readEffectiveRegistryConfig(repoRoot, scope = null, env = process.env) {
  const userConfig = readUserConfig({ env });
  const userNpmrc = readUserNpmrc({ env });
  const repoConfig = readRepoNpmRegistryConfig(repoRoot, scope);
  const userScope = MANAGED_PACKAGE_SCOPES.find((candidate) => userNpmrc[`${candidate}:registry`]) || null;
  const resolvedScope = scope
    || (repoConfig.registry ? repoConfig.scope : null)
    || userScope
    || userConfig.scope
    || repoConfig.scope
    || MANAGED_PACKAGE_SCOPES[0]
    || null;
  const resolved = resolveRegistryConfig({
    scope: resolvedScope,
    defaults: {
      registry: userConfig.registry,
      verificationPackage: userConfig.verificationPackage,
    },
    userNpmrc,
    repoNpmrc: repoConfig.registry ? {
      [`${repoConfig.scope}:registry`]: repoConfig.registry,
      ...(repoConfig.authToken ? { [`//${new URL(repoConfig.registry).host}/:_authToken`]: repoConfig.authToken } : {}),
    } : {},
  });

  let npmrcPath = null;
  if (resolved.source === 'repo') {
    npmrcPath = repoConfig.npmrcPath;
  } else if (resolved.source === 'user') {
    npmrcPath = getUserNpmrcPath({ env });
  }

  const alwaysAuth = resolved.source === 'repo'
    ? repoConfig.alwaysAuth
    : String(userNpmrc['always-auth'] || '').toLowerCase() === 'true';

  return {
    scope: resolved.scope,
    npmrcPath,
    registry: resolved.registry,
    authToken: resolved.authToken,
    alwaysAuth,
    source: resolved.source,
    configured: resolved.source !== 'default' && Boolean(resolved.registry),
  };
}

export function inspectRegistryConfig({
  cwd = process.cwd(),
  scope = null,
  env = process.env,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const { npmrcPath, scope: resolvedScope, registry, authToken, alwaysAuth, source, configured } = readEffectiveRegistryConfig(
    repoRoot,
    scope,
    env
  );

  let auth = {
    configured: false,
    mode: 'missing',
    key: null,
    value: null,
    redacted: false,
  };

  if (authToken) {
    const envMatch = authToken.match(/^\$\{([^}]+)\}$/);
    if (envMatch) {
      auth = {
        configured: true,
        mode: 'env',
        key: envMatch[1],
        value: null,
        redacted: false,
      };
    } else {
      auth = {
        configured: true,
        mode: 'literal',
        key: null,
        value: null,
        redacted: true,
      };
    }
  }

  return {
    scope: resolvedScope,
    repoRoot,
    npmrcPath: npmrcPath ? normalizeDisplayPath(repoRoot, npmrcPath) : null,
    configured,
    registry: configured ? registry : null,
    auth,
    alwaysAuth,
    source,
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

function buildNpmRegistryEnv(repoRoot, env = process.env) {
  const effective = readEffectiveRegistryConfig(repoRoot, null, env);
  const authToken = effective.authToken || null;
  const envMatch = authToken?.match(/^\$\{([^}]+)\}$/) || null;
  if (!envMatch) return env;
  if (env[envMatch[1]]) return env;

  const credentials = readUserCredentials({ env });
  if (!credentials?.token) return env;

  return {
    ...env,
    [envMatch[1]]: credentials.token,
  };
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
  const resolved = resolveSkillTarget(repoRoot, target);

  if (resolved.kind === 'package' && resolved.exports.length > 1) {
    return {
      kind: 'package',
      packageName: resolved.package.packageName,
      packageVersion: resolved.package.packageVersion,
      packagePath: resolved.package.packagePath,
      exports: resolved.exports.map((entry) => ({
        name: entry.name,
        declaredName: entry.declaredName,
        skillFile: entry.skillFile,
        skillPath: entry.skillPath,
        requires: entry.requires,
      })),
    };
  }

  const entry = resolved.kind === 'export' ? resolved.export : resolved.exports[0];

  return {
    kind: 'export',
    name: entry.name,
    description: entry.description,
    packageName: resolved.package.packageName,
    packageVersion: resolved.package.packageVersion,
    skillFile: entry.skillFile,
    sources: entry.sources,
    requires: entry.requires,
    status: entry.status,
    replacement: entry.replacement,
    message: entry.message,
    wraps: entry.wraps,
    overrides: entry.overrides,
  };
}

function isPublishedSkillFile(files, relativeSkillFile) {
  if (!files) return true;
  return files.some((entry) => entry === relativeSkillFile || relativeSkillFile.startsWith(`${entry}/`));
}

export function validatePackagedSkillExport(repoRoot, pkg, skillExport) {
  const packageMetadata = readPackageMetadata(pkg.packageDir);
  const issues = [];

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

  if (skillExport.status && !['deprecated', 'retired'].includes(skillExport.status)) {
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

  for (const requirement of skillExport.requires || []) {
    if (!packageMetadata.dependencies[requirement]) {
      issues.push({
        code: 'missing_dependency_declaration',
        message: 'required skill is not declared in package dependencies',
        dependency: requirement,
      });
    }
  }

  return {
    valid: issues.length === 0,
    key: skillExport.key,
    name: skillExport.name || null,
    packageName: packageMetadata.packageName,
    packageVersion: packageMetadata.packageVersion,
    skillFile: skillExport.skillFile,
    packagePath: pkg.packagePath,
    status: skillExport.status || null,
    replacement: skillExport.replacement || null,
    nextSteps: buildValidateNextSteps(packageMetadata, issues.length === 0),
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

export function listStaleSkills({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const compiledState = readCompiledState(repoRoot);
  if (!compiledState) {
    throw new NotFoundError('compiled state not found', {
      code: 'compiled_state_not_found',
      suggestion: 'Run `agentpack skills build <target>` first.',
    });
  }

  return (compiledState.skills || [])
    .map((skill) => {
      const changedSources = (compiledState.sourceFiles || [])
        .map((sourceFile) => ({
          path: sourceFile.path,
          recorded: sourceFile.hash,
          current: hashFile(join(repoRoot, sourceFile.path)),
        }))
        .filter((entry) => entry.recorded !== entry.current);

      return {
        packageName: skill.packageName,
        skillPath: skill.skillPath,
        skillFile: skill.skillFile,
        changedSources,
      };
    })
    .filter((skill) => skill.changedSources.length > 0)
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
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

function findInstalledPackageDir(nodeModulesDir, packageName) {
  if (!packageName) return null;
  const packageDir = join(nodeModulesDir, ...packageName.split('/'));
  return existsSync(packageDir) ? packageDir : null;
}

function resolveInstalledPackageClosure(repoRoot, directTargetMap) {
  const nodeModulesDir = join(repoRoot, 'node_modules');
  const queue = [...directTargetMap.keys()];
  const seen = new Set();
  const packageDirs = [];

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (seen.has(packageName)) continue;
    seen.add(packageName);

    const packageDir = findInstalledPackageDir(nodeModulesDir, packageName);
    if (!packageDir) continue;

    packageDirs.push(packageDir);
    const packageMetadata = readPackageMetadata(packageDir);
    for (const dependencyName of Object.keys(packageMetadata.dependencies || {})) {
      queue.push(dependencyName);
    }
  }

  return packageDirs.sort();
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
    env: buildNpmRegistryEnv(repoRoot, process.env),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const resolvedPackageDirs = resolveInstalledPackageClosure(repoRoot, directTargetMap);
  return rebuildInstallState(repoRoot, directTargetMap, {
    packageDirs: resolvedPackageDirs,
    readPackageMetadata,
    readInstalledSkillExports,
    normalizeRelativePath,
  });
}

export function inspectSkillsEnv({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const state = readInstallState(repoRoot);
  const materializationState = readMaterializationState(repoRoot);
  const materializationsByPackage = new Map();

  for (const entries of Object.values(materializationState?.adapters || {})) {
    for (const entry of entries || []) {
      if (!entry.packageName) continue;
      const current = materializationsByPackage.get(entry.packageName) || [];
      current.push({
        target: entry.target,
        mode: entry.mode,
      });
      materializationsByPackage.set(entry.packageName, current);
    }
  }

  const installs = Object.entries(state.installs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packageName, install]) => ({
      ...(install.skills?.length > 0
        ? readInstalledSkillLifecycleFromRecord(install)
        : readInstalledSkillLifecycle(repoRoot, install.source_package_path)),
      packageName,
      direct: install.direct,
      packageVersion: install.package_version,
      sourcePackagePath: install.source_package_path,
      skills: install.skills || [],
      materializations: materializationsByPackage.get(packageName) || install.materializations || [],
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

function readInstalledSkillLifecycleFromRecord(install) {
  const primarySkill = (install.skills || []).find((entry) => entry.runtime_name === entry.name)
    || (install.skills || [])[0]
    || null;

  if (!primarySkill) {
    return {
      requires: [],
      status: null,
      replacement: null,
      message: null,
    };
  }

  return {
    requires: primarySkill.requires || [],
    status: primarySkill.status || null,
    replacement: primarySkill.replacement || null,
    message: primarySkill.message || null,
  };
}

function buildInstallCommand(packageName) {
  return `agentpack skills install ${packageName}`;
}

function buildInstalledRequirementSet(installs) {
  const installed = new Set();

  for (const install of installs) {
    if (install.packageName) installed.add(install.packageName);
    for (const skill of install.skills || []) {
      const requirement = buildCanonicalSkillRequirement(install.packageName, skill.name);
      if (requirement) installed.add(requirement);
    }
  }

  return installed;
}

function buildInstalledRequirementRecords(installs) {
  return installs.map((install) => {
    const requires = new Set();

    for (const skill of install.skills || []) {
      for (const requirement of skill.requires || []) {
        requires.add(requirement);
      }
    }

    return {
      packageName: install.packageName,
      name: null,
      skillFile: install.sourcePackagePath ? `${install.sourcePackagePath}/SKILL.md` : null,
      direct: install.direct,
      requires: [...requires].sort((a, b) => a.localeCompare(b)),
    };
  });
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

      const compiled = readCompilerSkillDocument(skillFile);
      records.push({
        packageName: null,
        name: compiled.metadata.name,
        skillFile: normalizeDisplayPath(repoRoot, skillFile),
        direct: true,
        requires: listCompilerPackageDependencies(compiled),
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
  const installed = buildInstalledRequirementSet(env.installs);
  const installedRecords = buildInstalledRequirementRecords(env.installs);
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
        const compiled = readCompilerSkillDocument(skillFile);
        records = [{
          packageName: null,
          name: compiled.metadata.name,
          skillFile: normalizeDisplayPath(repoRoot, skillFile),
          direct: true,
          requires: listCompilerPackageDependencies(compiled),
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
  const state = readInstallState(env.repoRoot);
  const registry = inspectRegistryConfig({ cwd });
  const outdatedResult = await listOutdatedSkills({ cwd });
  const missingResult = inspectMissingSkillDependencies({ cwd });
  const runtimeInspection = inspectMaterializedSkills(env.repoRoot, state);

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
  const runtimeDrift = runtimeInspection.runtimeDrift;
  const runtimeDriftCount = runtimeInspection.runtimeDriftCount;
  const orphanedMaterializations = runtimeInspection.orphanedMaterializations;
  const orphanedMaterializationCount = runtimeInspection.orphanedMaterializationCount;

  let health = 'healthy';
  if (!registry.configured) {
    health = installedCount > 0 || outdatedCount > 0 ? 'attention-needed' : 'needs-config';
  } else if (
    outdatedCount > 0
    || deprecatedCount > 0
    || incompleteCount > 0
    || runtimeDriftCount > 0
    || orphanedMaterializationCount > 0
  ) {
    health = 'attention-needed';
  } else if (incompleteCount > 0 || runtimeDriftCount > 0 || orphanedMaterializationCount > 0) {
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
    runtimeDriftCount,
    orphanedMaterializationCount,
    registry,
    outdated: outdatedResult.skills,
    deprecated,
    incomplete,
    runtimeDrift,
    orphanedMaterializations,
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
      env: buildNpmRegistryEnv(repoRoot, process.env),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  const resolvedPackageDirs = resolveInstalledPackageClosure(repoRoot, nextDirectTargetMap);
  const nextState = rebuildInstallState(repoRoot, nextDirectTargetMap, {
    packageDirs: resolvedPackageDirs,
    readPackageMetadata,
    readInstalledSkillExports,
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

    const compiled = readCompilerSkillDocument(skillFile);
    for (const requirement of listCompilerPackageDependencies(compiled)) {
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
