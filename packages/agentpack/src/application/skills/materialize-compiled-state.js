import { findRepoRoot } from '../../lib/context.js';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { writeMaterializationState } from '../../infrastructure/fs/materialization-state-repository.js';
import { getRuntimeAdapters } from '../../infrastructure/runtime/adapters/adapter-registry.js';
import { NotFoundError } from '../../utils/errors.js';

export function materializeCompiledStateUseCase({ cwd = process.cwd() } = {}) {
  const repoRoot = findRepoRoot(cwd);
  const compiledState = readCompiledState(repoRoot);

  if (!compiledState) {
    throw new NotFoundError('compiled state not found', {
      code: 'compiled_state_not_found',
      suggestion: 'Run `agentpack skills build <target>` first.',
    });
  }

  const adapters = getRuntimeAdapters();
  const adapterOutputs = Object.fromEntries(
    adapters.map((adapter) => [adapter.name, adapter.materialize(repoRoot, compiledState)])
  );
  const materializationState = {
    version: 1,
    generated_at: new Date().toISOString(),
    adapters: adapterOutputs,
  };

  writeMaterializationState(repoRoot, materializationState);

  return {
    rootSkill: compiledState.root_skill,
    adapterCount: adapters.length,
    outputs: adapterOutputs,
    materializationPath: '.agentpack/materialization-state.json',
  };
}
