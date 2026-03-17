import { findRepoRoot } from '../../lib/context.js';
import { computeRuntimeSelectionUseCase } from './compute-runtime-selection.js';
import { materializeRuntimeSelectionUseCase } from './materialize-runtime-selection.js';

export function materializeCompiledStateUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const selection = computeRuntimeSelectionUseCase({ cwd, mode: 'package' });
  return materializeRuntimeSelectionUseCase(repoRoot, selection);
}
