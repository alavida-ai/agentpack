import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { listAuthoredSkillPackages, listInstalledSkillPackages } from './skill-catalog.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

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
  const authoredPackages = includeAuthored ? listAuthoredSkillPackages(repoRoot) : [];
  const installedPackages = includeInstalled ? listInstalledSkillPackages(repoRoot) : [];

  return {
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
  const { packages } = context;

  if (typeof target !== 'string' || target.length === 0) {
    throw new NotFoundError('skill not found', {
      code: 'skill_not_found',
      suggestion: `Target: ${target}`,
    });
  }

  const absoluteTarget = isAbsolute(target) ? target : resolve(repoRoot, target);

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
  if (resolved.exports.length === 1) {
    return buildExportResolution(resolved.package, resolved.exports[0], resolved.source);
  }

  throw new ValidationError('ambiguous skill target', {
    code: 'ambiguous_skill_target',
    suggestion: resolved.exports.map((entry) => entry.skillPath).join(', '),
  });
}
