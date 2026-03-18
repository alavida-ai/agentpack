import { join } from 'node:path';
import { hashFile } from '../../domain/compiler/source-hash.js';
import { readCompiledState } from '../../infrastructure/fs/compiled-state-repository.js';
import { writeCompiledPackageState } from '../../infrastructure/fs/compiled-state-repository.js';
import { startSkillDevWorkbenchServer } from '../../infrastructure/runtime/skill-dev-workbench-server.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { watchSkillWorkbench } from '../../infrastructure/runtime/watch-skill-workbench.js';
import { runSkillWorkbenchAction } from './run-skill-workbench-action.js';
import { resolveSingleSkillTarget } from '../../domain/skills/skill-target-resolution.js';
import { computeRuntimeSelectionUseCase } from './compute-runtime-selection.js';
import { buildCompiledPackageArtifact } from './build-compiled-state.js';

function explainCompiledSourceStatus(status) {
  if (status === 'changed') return 'Changed since compiled state was built';
  return 'Current against compiled state';
}

function inferDependencyName(target) {
  const [packageName, exportedName] = target.split(':');
  if (exportedName) return exportedName;
  return packageName.split('/').pop();
}

function inferDependencyType(selectedSkill, target, selection) {
  const dependencySkill = selection.exports.find((skill) => skill.exportId === target) || null;
  if (dependencySkill && dependencySkill.packageName === selectedSkill.packageName) {
    return 'internal-skill';
  }
  return 'external-package';
}

function buildStatusMaps(selection, sourceNodes, selectedSkill) {
  const staleExports = new Set();

  for (const sourceNode of sourceNodes) {
    if (sourceNode.status !== 'changed') continue;
    for (const exportId of sourceNode.usedBy || []) {
      staleExports.add(exportId);
    }
  }

  const affectedExports = new Set();
  const queue = [...staleExports];

  while (queue.length > 0) {
    const staleExportId = queue.shift();
    for (const skill of selection.exports || []) {
      const imports = skill.skillImports || [];
      if (!imports.some((entry) => entry.target === staleExportId)) continue;
      if (staleExports.has(skill.exportId) || affectedExports.has(skill.exportId)) continue;
      affectedExports.add(skill.exportId);
      queue.push(skill.exportId);
    }
  }

  const selectedStatus = staleExports.has(selectedSkill.exportId)
    ? 'stale'
    : (affectedExports.has(selectedSkill.exportId) ? 'affected' : 'current');

  return {
    staleExports,
    affectedExports,
    selectedStatus,
  };
}

function resolveDependencyMetadata(repoRoot, skillImport, selection) {
  const dependencySkill = selection.exports.find((skill) => skill.exportId === skillImport.target) || null;
  if (dependencySkill) {
    return {
      packageName: dependencySkill.packageName,
      name: dependencySkill.name,
      description: dependencySkill.description || null,
      version: dependencySkill.packageVersion || null,
      status: 'current',
      navigationTarget: dependencySkill.exportId,
    };
  }

  try {
    const resolved = resolveSingleSkillTarget(repoRoot, skillImport.target, { includeInstalled: true });
    return {
      packageName: resolved.package.packageName,
      name: resolved.export.runtimeName || resolved.export.declaredName || resolved.export.name,
      description: resolved.export.description || null,
      version: resolved.package.packageVersion || null,
      status: 'current',
      navigationTarget: resolved.export.id,
    };
  } catch {
    return {
      packageName: skillImport.target,
      name: inferDependencyName(skillImport.target),
      description: null,
      version: null,
      status: 'unknown',
      navigationTarget: skillImport.target,
    };
  }
}

function buildModelFromSelection(repoRoot, selection) {
  const selectedSkill = selection.exports.find((skill) => skill.exportId === selection.selectedExportId)
    || selection.exports[0]
    || null;
  if (!selectedSkill) return null;
  const visibleExportIds = new Set(selection.exports.map((skill) => skill.exportId));

  const changedSources = new Set();
  const compiledState = readCompiledState(repoRoot);
  const packageState = compiledState?.packages?.[selection.packageName] || null;
  const sourceFileRecords = new Map((packageState?.sourceFiles || []).map((entry) => [entry.path, entry]));
  const sourceNodes = (selection.sources || []).map((sourceFile) => {
    const recorded = sourceFileRecords.get(sourceFile.path) || null;
    const currentHash = hashFile(join(repoRoot, sourceFile.path));
    const changed = recorded ? currentHash !== recorded.hash : false;
    if (changed) changedSources.add(sourceFile.path);

    return {
      id: `source:${sourceFile.path}`,
      type: 'source',
      path: sourceFile.path,
      status: changed ? 'changed' : 'current',
      explanation: explainCompiledSourceStatus(changed ? 'changed' : 'current'),
      depth: 0,
      usedBy: sourceFile.usedBy,
    };
  });
  const statusMaps = buildStatusMaps(selection, sourceNodes, selectedSkill);

  // BFS from selected skill: compute depths for all transitive dependencies and collect all requires edges
  const skillByExportId = new Map(selection.exports.map((skill) => [skill.exportId, skill]));
  const depthMap = new Map();
  const primaryContext = new Map();
  const requiresEdges = [];
  depthMap.set(selectedSkill.exportId, 0);
  const bfsQueue = [selectedSkill];

  while (bfsQueue.length > 0) {
    const currentSkill = bfsQueue.shift();
    const currentDepth = depthMap.get(currentSkill.exportId);

    for (const skillImport of currentSkill.skillImports || []) {
      requiresEdges.push({
        source: currentSkill.exportId,
        target: skillImport.target,
        kind: 'requires',
        context: skillImport.context || null,
        targetType: inferDependencyType(selectedSkill, skillImport.target, selection),
      });

      if (depthMap.has(skillImport.target)) continue;
      depthMap.set(skillImport.target, currentDepth + 1);
      primaryContext.set(skillImport.target, skillImport.context || null);

      const depSkill = skillByExportId.get(skillImport.target);
      if (depSkill) {
        bfsQueue.push(depSkill);
      }
    }
  }

  const dependencyNodes = [];
  for (const [exportId, depth] of depthMap) {
    if (exportId === selectedSkill.exportId) continue;

    const dependencyMetadata = resolveDependencyMetadata(repoRoot, { target: exportId }, selection);
    const type = inferDependencyType(selectedSkill, exportId, selection);
    const dependencyStatus = statusMaps.staleExports.has(exportId)
      ? 'stale'
      : (statusMaps.affectedExports.has(exportId) ? 'affected' : dependencyMetadata.status);

    dependencyNodes.push({
      id: exportId,
      type,
      packageName: dependencyMetadata.packageName,
      navigationTarget: dependencyMetadata.navigationTarget,
      name: dependencyMetadata.name,
      context: primaryContext.get(exportId),
      description: dependencyMetadata.description,
      version: dependencyMetadata.version,
      status: dependencyStatus,
      explanation: dependencyStatus === 'stale'
        ? 'Directly impacted by one or more changed source files'
        : dependencyStatus === 'affected'
          ? 'Affected by upstream stale sub-skills'
          : type === 'internal-skill'
        ? 'Internal sub-skill in the same package'
        : 'External package dependency',
      depth,
    });
  }

  const { selectedStatus } = statusMaps;
  const selectedNode = {
    id: selectedSkill.exportId,
    type: 'skill',
    packageName: selectedSkill.packageName,
    name: selectedSkill.name,
    description: selectedSkill.description || null,
    version: selectedSkill.packageVersion || null,
    status: selectedStatus,
    explanation: selectedStatus === 'stale'
      ? `Stale because one or more compiled sources changed: ${[...changedSources].join(', ')}`
      : selectedStatus === 'affected'
        ? `Affected by stale dependencies triggered by changed sources: ${[...changedSources].join(', ')}`
      : 'Current against compiled state',
    depth: 0,
    sourceCount: sourceNodes.length,
    sourceSummary: sourceNodes.length > 0
      ? `${sourceNodes.length} bound source file${sourceNodes.length === 1 ? '' : 's'} in this graph`
      : 'No bound source material in this graph',
  };

  const edges = [
    ...sourceNodes.flatMap((node) => {
      const targets = (node.usedBy || []).filter((exportId) => visibleExportIds.has(exportId));
      if (targets.length === 0) {
        return [{
          source: node.id,
          target: selectedNode.id,
          kind: 'provenance',
        }];
      }

      return targets.map((exportId) => ({
        source: node.id,
        target: exportId,
        kind: 'provenance',
      }));
    }),
    ...requiresEdges,
  ];

  return {
    selected: selectedNode,
    nodes: [...sourceNodes, selectedNode, ...dependencyNodes],
    edges,
  };
}

function ensureWorkbenchPackageCompiled(repoRoot, target) {
  const resolved = resolveSingleSkillTarget(repoRoot, target, { includeInstalled: true, cwd: repoRoot });
  const compiledState = readCompiledState(repoRoot);
  if (!compiledState?.packages?.[resolved.package.packageName]) {
    const artifact = buildCompiledPackageArtifact(repoRoot, resolved, { emitRuntime: false });
    writeCompiledPackageState(repoRoot, artifact);
  }
  return resolved;
}

function resolveWorkbenchSelection(repoRoot, target) {
  const resolved = ensureWorkbenchPackageCompiled(repoRoot, target);
  return computeRuntimeSelectionUseCase({
    cwd: repoRoot,
    mode: 'closure',
    packageName: resolved.package.packageName,
    exportId: resolved.export.id,
  });
}

export function resolveSkillDevWorkbenchModel({
  repoRoot,
  defaultTarget,
  requestedTarget = null,
}) {
  const selection = resolveWorkbenchSelection(repoRoot, requestedTarget || defaultTarget);
  return buildModelFromSelection(repoRoot, selection);
}

export async function startSkillDevWorkbench({
  repoRoot,
  skillDir,
  open = true,
  disableBrowser = false,
}) {
  const resolved = resolveSingleSkillTarget(repoRoot, skillDir, { includeInstalled: false });
  const defaultSkill = resolved.package.packageName;
  const packageDir = resolved.package.packageDir;
  const defaultTarget = resolved.export.id;
  const getSelection = () => computeRuntimeSelectionUseCase({
    cwd: repoRoot,
    mode: 'closure',
    packageName: resolved.package.packageName,
    exportId: resolved.export.id,
  });

  const server = await startSkillDevWorkbenchServer({
    buildModel: (requestedTarget) => resolveSkillDevWorkbenchModel({
      repoRoot,
      defaultTarget,
      requestedTarget,
    }),
    defaultSkill,
    onAction(action) {
      return runSkillWorkbenchAction(action, {
        cwd: repoRoot,
        target: skillDir,
        packageName: defaultSkill,
      });
    },
  });

  const watcher = watchSkillWorkbench(repoRoot, {
    packageDir,
    getSelection,
    onRefresh: () => {
    // Model is rebuilt on each request, so no cache to invalidate
    },
  });

  if (open && !disableBrowser) {
    openBrowser(server.url);
  }

  return {
    url: server.url,
    port: server.port,
    refresh() {
      // no-op: models are built on demand per request
    },
    close() {
      watcher.close();
      server.close();
    },
  };
}
