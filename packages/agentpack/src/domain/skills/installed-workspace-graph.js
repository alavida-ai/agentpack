import { isAbsolute, resolve } from 'node:path';
import { listInstalledSkillPackages } from './skill-catalog.js';
import { readMaterializationState } from '../../infrastructure/fs/materialization-state-repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

export function buildRuntimeName(packageName, skillExport) {
  if (skillExport?.runtimeName) return skillExport.runtimeName;
  const namespace = packageName?.split('/').pop() || null;
  if (!namespace) return skillExport.name;
  if (skillExport.isPrimary) return namespace;
  return `${namespace}:${skillExport.name}`;
}

function registerTarget(targets, key, value) {
  if (!key) return;
  targets[key] = value;
}

function collectEnabledRuntimes(repoRoot) {
  const materializationState = readMaterializationState(repoRoot);
  const enabled = new Map();

  for (const [runtime, entries] of Object.entries(materializationState?.adapters || {})) {
    for (const entry of entries || []) {
      if (!entry.packageName || !entry.runtimeName) continue;
      const key = `${entry.packageName}::${entry.runtimeName}`;
      const current = enabled.get(key) || new Set();
      current.add(runtime);
      enabled.set(key, current);
    }
  }

  return enabled;
}

export function buildInstalledWorkspaceGraph(repoRoot) {
  const packages = {};
  const exports = {};
  const targets = {};
  const enabledByRuntime = collectEnabledRuntimes(repoRoot);

  for (const pkg of listInstalledSkillPackages(repoRoot)) {
    const packageNode = {
      packageName: pkg.packageName,
      packageVersion: pkg.packageVersion,
      packageDir: pkg.packageDir,
      packagePath: pkg.packagePath,
      packageMetadata: pkg.packageMetadata,
      primaryExport: null,
      exports: [],
    };

    for (const entry of pkg.exports) {
      const id = entry.id || (entry.isPrimary ? pkg.packageName : `${pkg.packageName}:${entry.name}`);
      const runtimeName = entry.runtimeName || buildRuntimeName(pkg.packageName, entry);
      const exportNode = {
        ...entry,
        id,
        key: id,
        packageName: pkg.packageName,
        packageVersion: pkg.packageVersion,
        packageDir: pkg.packageDir,
        packagePath: pkg.packagePath,
        runtimeName,
        enabled: [...(enabledByRuntime.get(`${pkg.packageName}::${runtimeName}`) || new Set())].sort(),
      };

      exports[id] = exportNode;
      packageNode.exports.push(id);
      if (entry.isPrimary) packageNode.primaryExport = id;

      registerTarget(targets, id, { kind: 'export', packageName: pkg.packageName, exportId: id });
      registerTarget(targets, entry.skillPath, { kind: 'export', packageName: pkg.packageName, exportId: id });
      registerTarget(targets, entry.skillFile, { kind: 'export', packageName: pkg.packageName, exportId: id });
      registerTarget(targets, entry.skillDirPath, { kind: 'export', packageName: pkg.packageName, exportId: id });
      registerTarget(targets, entry.skillFilePath, { kind: 'export', packageName: pkg.packageName, exportId: id });
    }

    packageNode.exports.sort((a, b) => a.localeCompare(b));
    packages[pkg.packageName] = packageNode;
    registerTarget(targets, pkg.packageName, { kind: 'package', packageName: pkg.packageName });
    registerTarget(targets, pkg.packagePath, { kind: 'package', packageName: pkg.packageName });
    registerTarget(targets, pkg.packageDir, { kind: 'package', packageName: pkg.packageName });
  }

  return {
    packages,
    exports,
    targets,
  };
}

export function resolveInstalledSkillTarget(repoRoot, target) {
  const graph = buildInstalledWorkspaceGraph(repoRoot);
  const absoluteTarget = typeof target === 'string' && !target.startsWith('@') && !isAbsolute(target)
    ? resolve(repoRoot, target)
    : target;
  const ref = graph.targets[target] || graph.targets[absoluteTarget];

  if (!ref) {
    throw new NotFoundError('installed skill not found', {
      code: 'installed_skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  const pkg = graph.packages[ref.packageName];
  if (ref.kind === 'package') {
    return {
      graph,
      kind: 'package',
      package: pkg,
      exports: pkg.exports.map((id) => graph.exports[id]),
    };
  }

  return {
    graph,
    kind: 'export',
    package: pkg,
    export: graph.exports[ref.exportId],
    exports: [graph.exports[ref.exportId]],
  };
}

export function resolveSingleInstalledSkillTarget(repoRoot, target) {
  const resolved = resolveInstalledSkillTarget(repoRoot, target);
  if (resolved.kind === 'export') return resolved;
  if (resolved.package.primaryExport) {
    return {
      ...resolved,
      kind: 'export',
      export: resolved.graph.exports[resolved.package.primaryExport],
      exports: [resolved.graph.exports[resolved.package.primaryExport]],
    };
  }
  if (resolved.exports.length === 1) {
    return {
      ...resolved,
      kind: 'export',
      export: resolved.exports[0],
      exports: [resolved.exports[0]],
    };
  }
  throw new ValidationError('ambiguous installed skill target', {
    code: 'ambiguous_installed_skill_target',
    suggestion: resolved.exports.map((entry) => entry.id).join(', '),
  });
}
