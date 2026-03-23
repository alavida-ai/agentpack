import {
  ensureResolvedExportIsValid,
  loadSkillTargetContext,
  resolveSingleSkillTarget,
} from '../../domain/skills/skill-target-resolution.js';

export function collectAuthoredDependencyPackageDirs(repoRoot, rootResolved, { cwd = repoRoot } = {}) {
  const context = loadSkillTargetContext(repoRoot, { includeInstalled: false });
  const authoredGraph = context.authoredGraph;
  if (!authoredGraph || !rootResolved?.export) return [];

  const queue = [rootResolved.export.id];
  const seenExports = new Set();
  const seenPackages = new Set([rootResolved.package.packageName]);
  const packageDirs = [];

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
      if (seenPackages.has(dependency.package.packageName)) continue;
      seenPackages.add(dependency.package.packageName);
      packageDirs.push(dependency.package.packageDir);
    }
  }

  return packageDirs;
}
