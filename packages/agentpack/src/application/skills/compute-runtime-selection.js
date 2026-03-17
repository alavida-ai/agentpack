import { findRepoRoot } from '../../lib/context.js';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

function buildCompiledStateMissingError() {
  return new NotFoundError('compiled state not found', {
    code: 'compiled_state_not_found',
    suggestion: 'Run `agentpack author build <target>` first.',
  });
}

function indexCompiledSkills(compiledState) {
  const skillsByExportId = new Map();
  const packageByExportId = new Map();

  for (const [packageName, packageState] of Object.entries(compiledState?.packages || {})) {
    for (const skill of packageState.skills || []) {
      skillsByExportId.set(skill.exportId, skill);
      packageByExportId.set(skill.exportId, packageName);
    }
  }

  return {
    skillsByExportId,
    packageByExportId,
  };
}

function resolveSelectedPackage(compiledState, packageName = null) {
  const resolvedPackageName = packageName
    || compiledState.active_package
    || Object.keys(compiledState.packages || {})[0]
    || null;
  const packageState = resolvedPackageName ? compiledState.packages?.[resolvedPackageName] : null;

  if (!packageState) {
    throw buildCompiledStateMissingError();
  }

  return packageState;
}

function resolveSelectedExportId(packageState, exportId = null) {
  const resolvedExportId = exportId || packageState.root_export || packageState.skills?.[0]?.exportId || null;
  if (!resolvedExportId) {
    throw new ValidationError('runtime selection could not resolve an export', {
      code: 'runtime_selection_missing_export',
    });
  }
  return resolvedExportId;
}

function dedupeSources(skills) {
  const byPath = new Map();

  for (const skill of skills) {
    for (const source of skill.sourceBindings || []) {
      const existing = byPath.get(source.sourcePath) || {
        path: source.sourcePath,
        usedBy: [],
      };

      if (!existing.usedBy.includes(skill.exportId)) {
        existing.usedBy.push(skill.exportId);
      }

      byPath.set(source.sourcePath, existing);
    }
  }

  return [...byPath.values()]
    .map((entry) => ({
      ...entry,
      usedBy: entry.usedBy.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function computeClosureSkills(compiledState, selectedExportId) {
  const { skillsByExportId, packageByExportId } = indexCompiledSkills(compiledState);
  const queue = [selectedExportId];
  const seen = new Set();
  const selectedSkills = [];

  while (queue.length > 0) {
    const exportId = queue.shift();
    if (seen.has(exportId)) continue;
    seen.add(exportId);

    const skill = skillsByExportId.get(exportId);
    if (!skill) continue;
    selectedSkills.push(skill);

    for (const skillImport of skill.skillImports || []) {
      if (!packageByExportId.has(skillImport.target)) continue;
      queue.push(skillImport.target);
    }
  }

  return selectedSkills.sort((a, b) => a.exportId.localeCompare(b.exportId));
}

export function computeRuntimeSelectionFromCompiledState(compiledState, {
  mode = 'package',
  packageName = null,
  exportId = null,
} = {}) {
  if (!compiledState || !compiledState.packages || Object.keys(compiledState.packages).length === 0) {
    throw buildCompiledStateMissingError();
  }

  if (!['package', 'closure'].includes(mode)) {
    throw new ValidationError(`unsupported runtime selection mode: ${mode}`, {
      code: 'unsupported_runtime_selection_mode',
    });
  }

  const packageState = resolveSelectedPackage(compiledState, packageName);
  const selectedExportId = resolveSelectedExportId(packageState, exportId);
  const exports = mode === 'package'
    ? (packageState.skills || []).slice().sort((a, b) => a.exportId.localeCompare(b.exportId))
    : computeClosureSkills(compiledState, selectedExportId);

  return {
    mode,
    packageName: packageState.packageName,
    selectedExportId,
    rootSkill: packageState.root_skill,
    rootExport: packageState.root_export,
    exports,
    sources: dedupeSources(exports),
    edges: (packageState.edges || []).filter((edge) => exports.some((skill) => skill.exportId === edge.source)),
    packages: [...new Set(exports.map((skill) => skill.packageName))].sort((a, b) => a.localeCompare(b)),
  };
}

export function computeRuntimeSelectionUseCase({
  cwd = process.cwd(),
  mode = 'package',
  packageName = null,
  exportId = null,
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  const compiledState = readCompiledState(repoRoot);
  const selection = computeRuntimeSelectionFromCompiledState(compiledState, {
    mode,
    packageName,
    exportId,
  });

  return {
    repoRoot,
    ...selection,
  };
}
