import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { listAuthoredSkillPackages, listInstalledSkillPackages } from './skill-catalog.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  buildAuthoredWorkspaceGraph,
  buildInvalidExportError,
  buildInvalidPackageError,
} from './workspace-graph.js';

function dedupePackages(authoredPackages, installedPackages) {
  const seen = new Set(authoredPackages.map((pkg) => pkg.packageName));
  return [
    ...authoredPackages,
    ...installedPackages.filter((pkg) => !seen.has(pkg.packageName)),
  ];
}

export function loadSkillTargetContext(repoRoot, {
  includeAuthored = true,
  includeInstalled = true,
} = {}) {
  const authoredGraph = includeAuthored ? buildAuthoredWorkspaceGraph(repoRoot) : null;
  const authoredPackages = authoredGraph ? listAuthoredSkillPackages(repoRoot) : [];
  const installedPackages = includeInstalled ? listInstalledSkillPackages(repoRoot) : [];

  return {
    authoredGraph,
    authoredPackages,
    installedPackages,
    packages: dedupePackages(authoredPackages, installedPackages),
  };
}

function buildPackageResolution(pkg, source) {
  return {
    kind: 'package',
    source,
    package: pkg,
    exports: pkg.exports,
  };
}

function hydrateAuthoredPackage(graph, packageName) {
  const pkg = graph.packages[packageName];
  if (!pkg) return null;
  return {
    ...pkg,
    exports: pkg.exports.map((exportId) => graph.exports[exportId]).filter(Boolean),
  };
}

function buildExportResolution(pkg, skillExport, source) {
  return {
    kind: 'export',
    source,
    package: pkg,
    export: skillExport,
    exports: [skillExport],
  };
}

export function resolveSkillTarget(repoRoot, target, options = {}) {
  const context = loadSkillTargetContext(repoRoot, options);
  const { packages, authoredGraph } = context;

  if (typeof target !== 'string' || target.length === 0) {
    throw new NotFoundError('skill not found', {
      code: 'skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  const absoluteTarget = isAbsolute(target) ? target : resolve(repoRoot, target);

  if (authoredGraph?.targets[target]) {
    const ref = authoredGraph.targets[target];
    const pkg = hydrateAuthoredPackage(authoredGraph, ref.packageName);
    if (ref.kind === 'package') {
      return buildPackageResolution(pkg, target === pkg.packageName ? 'package_name' : 'package_path');
    }
    const skillExport = authoredGraph.exports[ref.exportId];
    return buildExportResolution(pkg, skillExport, skillExport.id === target ? 'canonical_export_id' : 'skill_path');
  }

  if (authoredGraph?.targets[absoluteTarget]) {
    const ref = authoredGraph.targets[absoluteTarget];
    const pkg = hydrateAuthoredPackage(authoredGraph, ref.packageName);
    if (ref.kind === 'package') {
      return buildPackageResolution(pkg, 'package_path');
    }
    return buildExportResolution(pkg, authoredGraph.exports[ref.exportId], 'skill_path');
  }

  if (existsSync(absoluteTarget)) {
    for (const pkg of packages) {
      if (pkg.packageDir === absoluteTarget) {
        return buildPackageResolution(pkg, 'package_path');
      }

      for (const skillExport of pkg.exports) {
        if (skillExport.skillDirPath === absoluteTarget) {
          return buildExportResolution(pkg, skillExport, 'skill_path');
        }
        if (skillExport.skillFilePath === absoluteTarget) {
          return buildExportResolution(pkg, skillExport, 'skill_file');
        }
      }
    }
  }

  const pkg = packages.find((entry) => entry.packageName === target);
  if (pkg) {
    return buildPackageResolution(pkg, 'package_name');
  }

  throw new NotFoundError('skill not found', {
    code: 'skill_not_found',
    suggestion: `Target: ${target}`,
  });
}

export function resolveSingleSkillTarget(repoRoot, target, options = {}) {
  const resolved = resolveSkillTarget(repoRoot, target, options);

  if (resolved.kind === 'export') return resolved;
  if (resolved.exports.length === 0 && resolved.package?.diagnostics?.length > 0) {
    throw buildInvalidPackageError(resolved.package);
  }
  if (resolved.package.primaryExport) {
    const primaryExport = resolved.exports.find((entry) => entry.id === resolved.package.primaryExport);
    if (primaryExport) {
      return buildExportResolution(resolved.package, primaryExport, resolved.source);
    }
  }
  if (resolved.exports.length === 1) {
    return buildExportResolution(resolved.package, resolved.exports[0], resolved.source);
  }

  throw new ValidationError('ambiguous skill target', {
    code: 'ambiguous_skill_target',
    suggestion: resolved.exports.map((entry) => entry.skillPath).join(', '),
  });
}

export function ensureResolvedExportIsValid(resolved) {
  if (resolved?.export?.status !== 'invalid') return resolved;
  throw buildInvalidExportError(resolved.export);
}
