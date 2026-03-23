import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { inferPackageRuntimeNamespace } from '../../domain/skills/skill-model.js';
import { NotFoundError } from '../../utils/errors.js';
import { writeRuntimeArtifacts } from './build-runtime-artifacts.js';

function buildCompiledRecord(packageState, skillState) {
  return {
    skillImports: Object.fromEntries(
      (skillState.skillImports || []).map((entry) => [entry.localName, { ...entry }])
    ),
    sourceBindings: Object.fromEntries(
      (skillState.sourceBindings || []).map((entry) => [entry.localName, { ...entry }])
    ),
    occurrences: (packageState.occurrences || [])
      .filter((entry) => entry.source === skillState.exportId)
      .map(({ source: _source, ...entry }) => ({ ...entry })),
    edges: (packageState.edges || [])
      .filter((entry) => entry.source === skillState.exportId)
      .map(({ source: _source, ...entry }) => ({ ...entry })),
  };
}

function inferModuleName(packageName, runtimeName) {
  const namespace = inferPackageRuntimeNamespace(packageName);
  if (!namespace) return runtimeName;
  if (runtimeName === namespace) return namespace;
  if (runtimeName.startsWith(`${namespace}:`)) {
    return runtimeName.slice(namespace.length + 1);
  }
  return runtimeName;
}

function toRuntimeExport(repoRoot, packageState, skillState) {
  return {
    exportId: skillState.exportId,
    declaredName: skillState.declaredName,
    moduleName: skillState.moduleName || inferModuleName(packageState.packageName, skillState.name),
    runtimeName: skillState.name,
    description: skillState.description,
    status: skillState.status || null,
    replacement: skillState.replacement || null,
    message: skillState.message || null,
    wraps: skillState.wraps || null,
    overrides: skillState.overrides || [],
    isPrimary: skillState.exportId === packageState.root_export,
    skillFilePath: join(repoRoot, skillState.skillFile),
    compiled: buildCompiledRecord(packageState, skillState),
    sourceSkillPath: skillState.skillPath,
    sourceSkillFile: skillState.skillFile,
    packageName: packageState.packageName,
  };
}

export function buildAuthoredRuntimeBundle(repoRoot, selection) {
  const compiledState = readCompiledState(repoRoot);
  const targetPackageState = compiledState?.packages?.[selection.packageName];
  if (!compiledState || !targetPackageState) {
    throw new NotFoundError('compiled state not found', {
      code: 'compiled_state_not_found',
      suggestion: 'Run `agentpack author build <target>` first.',
    });
  }

  const targetPackageDir = join(repoRoot, targetPackageState.packagePath);
  const distRoot = join(targetPackageDir, 'dist');
  const runtimeExports = (selection.exports || []).map((selectionSkill) => {
    const packageState = compiledState.packages?.[selectionSkill.packageName];
    const skillState = packageState?.skills?.find((entry) => entry.exportId === selectionSkill.exportId);
    if (!packageState || !skillState) {
      throw new NotFoundError(`compiled export not found: ${selectionSkill.exportId}`, {
        code: 'compiled_export_not_found',
      });
    }
    return toRuntimeExport(repoRoot, packageState, skillState);
  });

  const targetRuntimeNames = new Set(
    (targetPackageState.skills || []).map((entry) => entry.name)
  );

  const { runtimeEntries } = writeRuntimeArtifacts(repoRoot, {
    distRoot,
    packagePath: targetPackageState.packagePath,
    runtimeExports,
    packageInfo: targetPackageState,
    manifestRuntimeNames: [...targetRuntimeNames],
    clear: true,
  });

  const bundleManifest = {
    version: 1,
    targetPackageName: targetPackageState.packageName,
    targetPackagePath: targetPackageState.packagePath,
    rootSkill: selection.rootSkill,
    selectedExportId: selection.selectedExportId,
    mode: selection.mode,
    exports: runtimeExports
      .map((runtimeExport) => ({
        exportId: runtimeExport.exportId,
        packageName: runtimeExport.packageName,
        runtimeName: runtimeExport.runtimeName,
        runtimeDir: `dist/${runtimeExport.runtimeName}`,
        runtimeFile: `dist/${runtimeExport.runtimeName}/SKILL.md`,
        sourceSkillPath: runtimeExport.sourceSkillPath,
        sourceSkillFile: runtimeExport.sourceSkillFile,
      }))
      .sort((a, b) => a.runtimeName.localeCompare(b.runtimeName)),
  };

  const bundleManifestPath = join(distRoot, '.agentpack-bundle.json');
  writeFileSync(bundleManifestPath, `${JSON.stringify(bundleManifest, null, 2)}\n`);

  return {
    distRoot,
    targetPackageDir,
    targetPackagePath: targetPackageState.packagePath,
    bundleManifestPath,
    entries: bundleManifest.exports.map((entry) => ({
      ...entry,
      runtimePath: `${targetPackageState.packagePath}/${entry.runtimeDir}`.replace(/\/+/g, '/'),
      runtimeFilePath: join(repoRoot, targetPackageState.packagePath, entry.runtimeFile),
    })),
    runtimeEntries,
  };
}
