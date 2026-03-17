import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { normalizeDisplayPath, readPackageMetadata } from '../../domain/skills/skill-model.js';
import { findPackageDirByName } from '../../domain/skills/package-discovery.js';
import {
  buildInstalledWorkspaceGraph,
  resolveInstalledSkillTarget,
} from '../../domain/skills/installed-workspace-graph.js';
import { readInstallState, writeInstallState } from '../../infrastructure/fs/install-state-repository.js';
import {
  readMaterializationState,
} from '../../infrastructure/fs/materialization-state-repository.js';
import { inspectMaterializedSkills } from '../../infrastructure/runtime/inspect-materialized-skills.js';
import {
  removePathIfExists,
} from '../../infrastructure/runtime/materialize-skills.js';
import { applyRuntimeMaterializationPlanUseCase } from './apply-runtime-materialization.js';
import { ValidationError } from '../../utils/errors.js';

const SUPPORTED_RUNTIMES = ['agents', 'claude'];
const RUNTIME_DIRS = {
  agents: '.agents',
  claude: '.claude',
};

function normalizeRuntimeSelection(runtimes) {
  const values = runtimes == null
    ? []
    : Array.isArray(runtimes)
      ? runtimes
      : [runtimes];

  if (values.length === 0) return [...SUPPORTED_RUNTIMES];

  const normalized = [...new Set(values)]
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const unsupported = normalized.filter((value) => !SUPPORTED_RUNTIMES.includes(value));
  if (unsupported.length > 0) {
    throw new ValidationError(`unsupported runtime selection: ${unsupported.join(', ')}`, {
      code: 'unsupported_runtime',
      suggestion: `Supported runtimes: ${SUPPORTED_RUNTIMES.join(', ')}`,
    });
  }

  return normalized;
}

function cloneSelections(selections) {
  return Object.fromEntries(
    Object.entries(selections || {}).map(([target, runtimes]) => [
      target,
      [...new Set(runtimes || [])].sort((a, b) => a.localeCompare(b)),
    ])
  );
}

function inferLegacySelections(state) {
  const selections = {};

  for (const [packageName, install] of Object.entries(state?.installs || {})) {
    if (!install?.direct) continue;
    const runtimes = new Set();

    for (const materialization of install.materializations || []) {
      if (typeof materialization?.target !== 'string') continue;
      if (materialization.target.startsWith('.claude/')) runtimes.add('claude');
      if (materialization.target.startsWith('.agents/')) runtimes.add('agents');
    }

    selections[packageName] = [...(runtimes.size > 0 ? runtimes : new Set(SUPPORTED_RUNTIMES))]
      .sort((a, b) => a.localeCompare(b));
  }

  return selections;
}

function readDirectSelections(repoRoot) {
  const state = readInstallState(repoRoot);
  if (state?.enabled_targets && typeof state.enabled_targets === 'object' && !Array.isArray(state.enabled_targets)) {
    return cloneSelections(state.enabled_targets);
  }
  return inferLegacySelections(state);
}

function writeDirectSelections(repoRoot, selections) {
  writeInstallState(repoRoot, {
    version: 2,
    enabled_targets: cloneSelections(selections),
  });
}

function selectionKeyForResolvedTarget(resolved) {
  return resolved.kind === 'package'
    ? resolved.package.packageName
    : resolved.export.id;
}

function listInitialExportIds(graph, selectionKey) {
  if (graph.packages[selectionKey]) {
    return [...graph.packages[selectionKey].exports];
  }

  if (graph.exports[selectionKey]) {
    return [selectionKey];
  }

  return [];
}

function resolveRequirementExportId(graph, requirement) {
  if (!requirement) return null;
  if (graph.exports[requirement]) return requirement;

  const pkg = graph.packages[requirement];
  if (!pkg) return null;
  if (pkg.primaryExport) return pkg.primaryExport;
  if (pkg.exports.length === 1) return pkg.exports[0];
  return null;
}

function buildMissingDependencyError(requirement, exportNode, runtime) {
  const packageName = requirement.includes(':')
    ? requirement.slice(0, requirement.indexOf(':'))
    : requirement;

  throw new ValidationError(`installed dependency not found: ${requirement}`, {
    code: 'installed_dependency_not_found',
    suggestion: `Enable could not resolve ${requirement} from ${exportNode.id}`,
    nextSteps: packageName
      ? [{
          action: 'run_command',
          reason: 'Install the missing package with npm, then rerun the enable command.',
          example: {
            command: `npm install ${packageName}`,
          },
        }]
      : [],
    details: {
      requirement,
      exportId: exportNode.id,
      runtime,
    },
  });
}

function buildRuntimeNameConflictError(runtime, existingExport, nextExport) {
  throw new ValidationError(`runtime name conflict for ${runtime}: ${nextExport.runtimeName}`, {
    code: 'runtime_name_conflict',
    suggestion: `${existingExport.id} and ${nextExport.id} would both materialize to ${nextExport.runtimeName}`,
    details: {
      runtime,
      runtimeName: nextExport.runtimeName,
      exports: [existingExport.id, nextExport.id],
    },
  });
}

function resolveRuntimeClosure(graph, directSelections, runtime) {
  const queue = [];
  const seen = new Set();

  for (const [target, runtimes] of Object.entries(directSelections)) {
    if (!(runtimes || []).includes(runtime)) continue;
    for (const exportId of listInitialExportIds(graph, target)) {
      if (seen.has(exportId)) continue;
      seen.add(exportId);
      queue.push(exportId);
    }
  }

  while (queue.length > 0) {
    const exportId = queue.shift();
    const exportNode = graph.exports[exportId];
    if (!exportNode) continue;

    for (const requirement of exportNode.requires || []) {
      const dependencyId = resolveRequirementExportId(graph, requirement);
      if (!dependencyId) {
        buildMissingDependencyError(requirement, exportNode, runtime);
      }
      if (seen.has(dependencyId)) continue;
      seen.add(dependencyId);
      queue.push(dependencyId);
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}

function buildMaterializationEntry(repoRoot, runtime, exportNode) {
  const runtimeDir = RUNTIME_DIRS[runtime];
  const target = normalizeDisplayPath(
    repoRoot,
    join(repoRoot, runtimeDir, 'skills', exportNode.runtimeName)
  );

  return {
    exportId: exportNode.id,
    packageName: exportNode.packageName,
    skillName: exportNode.name,
    runtimeName: exportNode.runtimeName,
    skillDirPath: exportNode.skillDirPath,
    sourceSkillPath: exportNode.skillPath,
    sourceSkillFile: exportNode.skillFile,
    target,
    mode: 'symlink',
  };
}

function buildDesiredMaterializations(repoRoot, directSelections) {
  const graph = buildInstalledWorkspaceGraph(repoRoot);
  const adapters = {
    agents: [],
    claude: [],
  };

  for (const runtime of SUPPORTED_RUNTIMES) {
    const seenRuntimeNames = new Map();

    for (const exportId of resolveRuntimeClosure(graph, directSelections, runtime)) {
      const exportNode = graph.exports[exportId];
      if (!exportNode) continue;

      const existing = seenRuntimeNames.get(exportNode.runtimeName);
      if (existing && existing.id !== exportNode.id) {
        buildRuntimeNameConflictError(runtime, existing, exportNode);
      }

      seenRuntimeNames.set(exportNode.runtimeName, exportNode);
      adapters[runtime].push(buildMaterializationEntry(repoRoot, runtime, exportNode));
    }

    adapters[runtime].sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
  }

  return {
    graph,
    adapters,
  };
}

function mutateSelections(currentSelections, targetKey, runtimes, mode) {
  const nextSelections = cloneSelections(currentSelections);

  const matchingKeys = targetKey.includes(':')
    ? [targetKey]
    : Object.keys(nextSelections).filter((key) => key === targetKey || key.startsWith(`${targetKey}:`));

  if (mode === 'enable') {
    const current = new Set(nextSelections[targetKey] || []);
    for (const runtime of runtimes) current.add(runtime);
    nextSelections[targetKey] = [...current].sort((a, b) => a.localeCompare(b));
    return nextSelections;
  }

  for (const key of matchingKeys) {
    const current = new Set(nextSelections[key] || []);
    for (const runtime of runtimes) current.delete(runtime);
    if (current.size === 0) {
      delete nextSelections[key];
      continue;
    }
    nextSelections[key] = [...current].sort((a, b) => a.localeCompare(b));
  }

  return nextSelections;
}

function sortPackages(packages) {
  return packages.sort((a, b) => a.packageName.localeCompare(b.packageName));
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

function resolveAvailablePackageVersion(repoRoot, packageName, discoveryRoot = process.env.AGENTPACK_DISCOVERY_ROOT) {
  const root = discoveryRoot || repoRoot;
  const availableDir = findPackageDirByName(root, packageName);
  if (!availableDir) return null;
  return readPackageMetadata(availableDir).packageVersion;
}

export function listInstalledSkillsUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const graph = buildInstalledWorkspaceGraph(repoRoot);
  const packages = sortPackages(
    Object.values(graph.packages).map((pkg) => ({
      availableVersion: resolveAvailablePackageVersion(repoRoot, pkg.packageName),
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      packagePath: pkg.packagePath,
      primaryExport: pkg.primaryExport,
      updateAvailable: false,
      updateType: null,
      exports: pkg.exports
        .map((id) => graph.exports[id])
        .filter(Boolean)
        .sort((a, b) => a.runtimeName.localeCompare(b.runtimeName))
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          runtimeName: entry.runtimeName,
          enabled: entry.enabled,
          isPrimary: entry.isPrimary,
        })),
    })).map((pkg) => {
      const updateAvailable = Boolean(
        pkg.packageVersion
        && pkg.availableVersion
        && compareSimpleSemver(pkg.availableVersion, pkg.packageVersion) > 0
      );

      return {
        ...pkg,
        updateAvailable,
        updateType: updateAvailable
          ? classifyUpdateType(pkg.packageVersion, pkg.availableVersion)
          : null,
      };
    })
  );

  return {
    repoRoot,
    packageCount: packages.length,
    exportCount: packages.reduce((sum, pkg) => sum + pkg.exports.length, 0),
    packages,
  };
}

export function enableInstalledSkillsUseCase(target, {
  cwd = process.cwd(),
  runtimes,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveInstalledSkillTarget(repoRoot, target);
  const runtimeSelection = normalizeRuntimeSelection(runtimes);
  const selectionKey = selectionKeyForResolvedTarget(resolved);
  const nextSelections = mutateSelections(readDirectSelections(repoRoot), selectionKey, runtimeSelection, 'enable');
  const { adapters } = buildDesiredMaterializations(repoRoot, nextSelections);

  applyRuntimeMaterializationPlanUseCase(repoRoot, adapters);
  writeDirectSelections(repoRoot, nextSelections);

  return {
    action: 'enable',
    target: selectionKey,
    runtimes: runtimeSelection,
    exports: resolved.exports.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)),
    enabledTargets: Object.keys(nextSelections).sort((a, b) => a.localeCompare(b)),
  };
}

export function disableInstalledSkillsUseCase(target, {
  cwd = process.cwd(),
  runtimes,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveInstalledSkillTarget(repoRoot, target);
  const runtimeSelection = normalizeRuntimeSelection(runtimes);
  const selectionKey = selectionKeyForResolvedTarget(resolved);
  const nextSelections = mutateSelections(readDirectSelections(repoRoot), selectionKey, runtimeSelection, 'disable');
  const { adapters } = buildDesiredMaterializations(repoRoot, nextSelections);

  applyRuntimeMaterializationPlanUseCase(repoRoot, adapters);
  writeDirectSelections(repoRoot, nextSelections);

  return {
    action: 'disable',
    target: selectionKey,
    runtimes: runtimeSelection,
    exports: resolved.exports.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)),
    enabledTargets: Object.keys(nextSelections).sort((a, b) => a.localeCompare(b)),
  };
}

export function inspectInstalledSkillsStatusUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const listing = listInstalledSkillsUseCase({ cwd });
  const graph = buildInstalledWorkspaceGraph(repoRoot);
  const selectionIssues = Object.entries(readDirectSelections(repoRoot))
    .filter(([target]) => !graph.packages[target] && !graph.exports[target])
    .map(([target, runtimes]) => ({
      code: 'enabled_target_not_installed',
      target,
      runtimes,
    }));
  const runtimeInspection = inspectMaterializedSkills(repoRoot, { installs: {} });
  const enabledExportCount = listing.packages
    .flatMap((pkg) => pkg.exports)
    .filter((entry) => entry.enabled.length > 0)
    .length;
  const enabledPackageCount = listing.packages
    .filter((pkg) => pkg.exports.some((entry) => entry.enabled.length > 0))
    .length;
  const health = runtimeInspection.runtimeDriftCount > 0
    || runtimeInspection.orphanedMaterializationCount > 0
    || selectionIssues.length > 0
    ? 'attention-needed'
    : 'healthy';

  return {
    repoRoot,
    installedPackageCount: listing.packageCount,
    installedExportCount: listing.exportCount,
    enabledPackageCount,
    enabledExportCount,
    selectionIssueCount: selectionIssues.length,
    runtimeDriftCount: runtimeInspection.runtimeDriftCount,
    orphanedMaterializationCount: runtimeInspection.orphanedMaterializationCount,
    selectionIssues,
    runtimeDrift: runtimeInspection.runtimeDrift,
    orphanedMaterializations: runtimeInspection.orphanedMaterializations,
    packages: listing.packages,
    health,
  };
}
