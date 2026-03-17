import { mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readMaterializationState, writeMaterializationState } from '../../infrastructure/fs/materialization-state-repository.js';
import { removePathIfExists } from '../../infrastructure/runtime/materialize-skills.js';
import { ValidationError } from '../../utils/errors.js';

function ensureMaterializationLink(repoRoot, entry) {
  const sourcePath = entry.source || entry.sourceSkillPath;
  if (!sourcePath) {
    throw new ValidationError('runtime materialization entry is missing a source path', {
      code: 'runtime_materialization_missing_source',
      details: {
        target: entry.target || null,
        runtimeName: entry.runtimeName || null,
      },
    });
  }

  const absoluteTarget = resolve(repoRoot, entry.target);
  const absoluteSource = resolve(repoRoot, sourcePath);
  removePathIfExists(absoluteTarget);
  mkdirSync(dirname(absoluteTarget), { recursive: true });
  symlinkSync(absoluteSource, absoluteTarget, 'dir');
}

function normalizeAdapterOutputs(adapterOutputs) {
  return Object.fromEntries(
    Object.entries(adapterOutputs || {}).map(([runtime, entries]) => [
      runtime,
      (entries || []).map((entry) => ({
        packageName: entry.packageName || null,
        skillName: entry.skillName || null,
        runtimeName: entry.runtimeName || null,
        sourceSkillPath: entry.sourceSkillPath || null,
        sourceSkillFile: entry.sourceSkillFile || null,
        source: entry.source || null,
        target: entry.target,
        mode: entry.mode || 'symlink',
        ...(entry.skill ? { skill: entry.skill } : {}),
        ...(entry.exportId ? { exportId: entry.exportId } : {}),
      })),
    ])
  );
}

export function applyRuntimeMaterializationPlanUseCase(repoRoot, adapterOutputs) {
  const normalizedOutputs = normalizeAdapterOutputs(adapterOutputs);
  const desiredTargets = new Set();
  const previousState = readMaterializationState(repoRoot);
  const previousTargets = new Set(
    Object.values(previousState?.adapters || {})
      .flatMap((entries) => entries || [])
      .map((entry) => entry.target)
      .filter(Boolean)
  );

  for (const entries of Object.values(normalizedOutputs)) {
    for (const entry of entries) {
      desiredTargets.add(entry.target);
      ensureMaterializationLink(repoRoot, entry);
    }
  }

  for (const target of previousTargets) {
    if (desiredTargets.has(target)) continue;
    removePathIfExists(join(repoRoot, target));
  }

  const materializationState = {
    version: 1,
    generated_at: new Date().toISOString(),
    adapters: normalizedOutputs,
  };

  writeMaterializationState(repoRoot, materializationState);
  return materializationState;
}
