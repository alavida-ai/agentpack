import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { resolveSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { writeCompiledPackageState } from '../../infrastructure/fs/compiled-state-repository.js';
import { hashFile } from '../../domain/compiler/source-hash.js';
import { ValidationError } from '../../utils/errors.js';
import { buildInvalidExportError, buildInvalidPackageError } from '../../domain/skills/workspace-graph.js';
import { buildRuntimeArtifacts } from './build-runtime-artifacts.js';

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
    description: exportNode.description,
    packageName: pkg.packageName,
    packageVersion: pkg.packageVersion,
    packagePath: pkg.packagePath,
    skillPath: exportNode.skillPath,
    skillFile: exportNode.skillFile,
    runtimePath: runtimeArtifacts.get(exportNode.id)?.runtimePath || null,
    runtimeFile: runtimeArtifacts.get(exportNode.id)?.runtimeFile || null,
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

export function buildCompiledStateUseCase(target, { cwd = process.cwd(), persist = true } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const resolved = resolveSkillTarget(repoRoot, target, { includeInstalled: false, cwd });
  const artifact = buildCompiledPackageArtifact(repoRoot, resolved, { emitRuntime: persist });

  if (persist) {
    writeCompiledPackageState(repoRoot, artifact);
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
