import { getRuntimeAdapters } from '../../infrastructure/runtime/adapters/adapter-registry.js';
import { applyRuntimeMaterializationPlanUseCase } from './apply-runtime-materialization.js';

export function materializeRuntimeSelectionUseCase(repoRoot, selection) {
  const adapters = getRuntimeAdapters();
  const adapterOutputs = Object.fromEntries(
    adapters.map((adapter) => [adapter.name, adapter.materialize(repoRoot, selection)])
  );
  const materializationState = applyRuntimeMaterializationPlanUseCase(repoRoot, adapterOutputs);

  return {
    rootSkill: selection.rootSkill,
    adapterCount: adapters.length,
    outputs: adapterOutputs,
    materializationPath: '.agentpack/materialization-state.json',
    materializationState,
  };
}
