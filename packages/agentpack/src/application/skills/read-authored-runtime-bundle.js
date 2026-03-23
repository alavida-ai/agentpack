import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../../lib/context.js';
import { NotFoundError } from '../../utils/errors.js';

function buildBundleManifestPath(repoRoot, packagePath) {
  return join(repoRoot, packagePath, 'dist', '.agentpack-bundle.json');
}

export function readAuthoredRuntimeBundleUseCase({
  cwd = process.cwd(),
  packagePath,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const bundleManifestPath = buildBundleManifestPath(repoRoot, packagePath);
  if (!existsSync(bundleManifestPath)) {
    throw new NotFoundError(`authored runtime bundle not found: ${bundleManifestPath}`, {
      code: 'authored_runtime_bundle_not_found',
      suggestion: 'Run `agentpack author build <target>` first.',
    });
  }

  const manifest = JSON.parse(readFileSync(bundleManifestPath, 'utf-8'));
  return {
    rootSkill: manifest.rootSkill,
    selectedExportId: manifest.selectedExportId,
    mode: manifest.mode,
    targetPackageName: manifest.targetPackageName,
    targetPackagePath: manifest.targetPackagePath,
    exports: (manifest.exports || []).map((entry) => ({
      id: `skill:${entry.runtimeName}`,
      exportId: entry.exportId,
      name: entry.runtimeName,
      packageName: entry.packageName,
      skillPath: entry.sourceSkillPath,
      skillFile: entry.sourceSkillFile,
      runtimePath: `${manifest.targetPackagePath}/${entry.runtimeDir}`.replace(/\/+/g, '/'),
      runtimeFile: `${manifest.targetPackagePath}/${entry.runtimeFile}`.replace(/\/+/g, '/'),
    })),
  };
}
