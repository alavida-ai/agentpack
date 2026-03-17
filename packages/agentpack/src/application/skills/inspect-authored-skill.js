import { findRepoRoot } from '../../lib/context.js';
import { resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';

export function inspectAuthoredSkillUseCase(target, { cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveSkillTarget(repoRoot, target);

  if (resolved.kind === 'package' && resolved.exports.length > 1) {
    return {
      kind: 'package',
      packageName: resolved.package.packageName,
      packageVersion: resolved.package.packageVersion,
      packagePath: resolved.package.packagePath,
      exports: resolved.exports.map((entry) => ({
        name: entry.runtimeName || entry.name,
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
    name: entry.runtimeName || entry.name,
    declaredName: entry.declaredName || null,
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
