import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { ensureResolvedExportIsValid, resolveSingleSkillTarget, resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { readCompiledState, writeCompiledPackageState } from '../../infrastructure/fs/compiled-state-repository.js';
import { hashFile } from '../../domain/compiler/source-hash.js';
import { ValidationError } from '../../utils/errors.js';
import { buildInvalidExportError, buildInvalidPackageError } from '../../domain/skills/workspace-graph.js';
import { buildRuntimeArtifacts } from './build-runtime-artifacts.js';
import { collectAuthoredDependencyPackageDirs } from './collect-authored-dependency-package-dirs.js';
import { computeRuntimeSelectionFromCompiledState } from './compute-runtime-selection.js';
import { buildAuthoredRuntimeBundle } from './build-authored-runtime-bundle.js';

function normalizeDistPath(packagePath) {
  if (!packagePath || packagePath === '.' || packagePath === '/') return './dist';
  return `${packagePath.replace(/\/+$/, '')}/dist`;
}

function buildSourceFileRecord(repoRoot, entry) {
  const absolutePath = join(repoRoot, entry.sourcePath);
  if (!existsSync(absolutePath)) {
    throw new ValidationError(`bound source file not found: ${entry.sourcePath}`, {
      code: 'bound_source_not_found',
      path: absolutePath,
    });
  }

  return {
    id: `source:${entry.sourcePath}`,
    localName: entry.localName,
    path: entry.sourcePath,
    hash: hashFile(absolutePath),
  };
}

function dedupeSourceFiles(sourceFiles) {
  const byPath = new Map();

  for (const entry of sourceFiles) {
    if (!byPath.has(entry.path)) {
      byPath.set(entry.path, entry);
    }
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function buildCompiledPackageArtifact(repoRoot, resolved, { emitRuntime = false } = {}) {
  const pkg = resolved.package;
  if (!pkg || pkg.status === 'invalid') {
    throw buildInvalidPackageError(pkg);
  }

  const exportNodes = (pkg.exports || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const exportNode of exportNodes) {
    if (exportNode.status === 'invalid' || !exportNode.compiled) {
      throw buildInvalidExportError(exportNode);
    }
  }

  const rootExport = exportNodes.find((entry) => entry.id === pkg.primaryExport) || exportNodes[0] || null;
  const sourceFiles = dedupeSourceFiles(exportNodes.flatMap((exportNode) =>
    Object.values(exportNode.compiled.sourceBindings).map((entry) => buildSourceFileRecord(repoRoot, entry))
  ));
  const runtimeArtifacts = emitRuntime ? buildRuntimeArtifacts(repoRoot, resolved) : new Map();

  const skills = exportNodes.map((exportNode) => ({
    id: `skill:${exportNode.runtimeName || exportNode.declaredName || exportNode.name}`,
    exportId: exportNode.id,
    name: exportNode.runtimeName || exportNode.declaredName || exportNode.name,
    declaredName: exportNode.declaredName,
    moduleName: exportNode.moduleName,
    description: exportNode.description,
    packageName: pkg.packageName,
    packageVersion: pkg.packageVersion,
    packagePath: pkg.packagePath,
    skillPath: exportNode.skillPath,
    skillFile: exportNode.skillFile,
    runtimePath: runtimeArtifacts.get(exportNode.id)?.runtimePath || null,
    runtimeFile: runtimeArtifacts.get(exportNode.id)?.runtimeFile || null,
    isPrimary: Boolean(exportNode.isPrimary),
    status: exportNode.lifecycleStatus || null,
    replacement: exportNode.replacement || null,
    message: exportNode.message || null,
    wraps: exportNode.wraps || null,
    overrides: exportNode.overrides || [],
    skillImports: Object.values(exportNode.compiled.skillImports),
    sourceBindings: Object.values(exportNode.compiled.sourceBindings),
  }));

  const occurrences = exportNodes.flatMap((exportNode) =>
    exportNode.compiled.occurrences.map((entry) => ({
      source: exportNode.id,
      ...entry,
    }))
  );

  const edges = exportNodes.flatMap((exportNode) =>
    exportNode.compiled.edges.map((edge) => ({
      ...edge,
      source: exportNode.id,
    }))
  );

  return {
    packageName: pkg.packageName,
    packageVersion: pkg.packageVersion,
    packagePath: pkg.packagePath,
    packageRoot: pkg.packagePath,
    packageFiles: pkg.packageMetadata?.files || null,
    agentpackRoot: pkg.packageMetadata?.agentpackRoot || null,
    generated_at: new Date().toISOString(),
    root_skill: rootExport ? `skill:${rootExport.runtimeName || rootExport.declaredName || rootExport.name}` : null,
    root_export: rootExport?.id || null,
    skills,
    sourceFiles,
    occurrences,
    edges,
  };
}

function countPackageEntries(packageArtifact) {
  return {
    skillCount: packageArtifact.skills.length,
    sourceCount: packageArtifact.sourceFiles.length,
    occurrenceCount: packageArtifact.occurrences.length,
    edgeCount: packageArtifact.edges.length,
  };
}

export function buildCompiledStateUseCase(target, {
  cwd = process.cwd(),
  persist = true,
  includeDependencies = true,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveSkillTarget(repoRoot, target, { includeInstalled: false, cwd });
  const resolvedExport = ensureResolvedExportIsValid(
    resolveSingleSkillTarget(repoRoot, target, { includeInstalled: false, cwd })
  );

  if (persist && includeDependencies) {
    for (const packageDir of collectAuthoredDependencyPackageDirs(repoRoot, resolvedExport, { cwd })) {
      buildCompiledStateUseCase(packageDir, { cwd, persist: true, includeDependencies: false });
    }
  }

  const artifact = buildCompiledPackageArtifact(repoRoot, resolved, { emitRuntime: persist });

  if (persist) {
    writeCompiledPackageState(repoRoot, artifact);
    const compiledState = readCompiledState(repoRoot);
    const selection = computeRuntimeSelectionFromCompiledState(compiledState, {
      mode: 'closure',
      packageName: artifact.packageName,
      exportId: artifact.root_export,
    });
    const bundle = buildAuthoredRuntimeBundle(repoRoot, selection);
    const counts = countPackageEntries(artifact);

    return {
      repoRoot,
      rootSkill: artifact.root_skill,
      compiledPath: '.agentpack/compiled.json',
      distPath: normalizeDistPath(artifact.packagePath),
      bundleManifestPath: bundle.bundleManifestPath,
      runtimeManifestPath: `${normalizeDistPath(artifact.packagePath)}/agentpack.json`.replace(/\/+/g, '/'),
      packageName: artifact.packageName,
      artifact,
      ...counts,
    };
  }

  const counts = countPackageEntries(artifact);

  return {
    repoRoot,
    rootSkill: artifact.root_skill,
    compiledPath: '.agentpack/compiled.json',
    packageName: artifact.packageName,
    artifact,
    ...counts,
  };
}
