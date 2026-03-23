import { findRepoRoot } from '../../lib/context.js';
import { computeRuntimeSelectionUseCase } from './compute-runtime-selection.js';
import { buildAuthoredRuntimeBundle } from './build-authored-runtime-bundle.js';
import { materializeRuntimeSelectionUseCase } from './materialize-runtime-selection.js';
import { readAuthoredRuntimeBundleUseCase } from './read-authored-runtime-bundle.js';

export function materializeCompiledStateUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const selection = computeRuntimeSelectionUseCase({ cwd, mode: 'closure' });
  const bundle = buildAuthoredRuntimeBundle(repoRoot, selection);
  const bundledSelection = readAuthoredRuntimeBundleUseCase({
    cwd,
    packagePath: bundle.targetPackagePath,
  });
  return materializeRuntimeSelectionUseCase(repoRoot, bundledSelection);
}
