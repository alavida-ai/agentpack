function explainNodeStatus(status) {
  if (status === 'affected') return 'Affected by upstream authored state changes';
  if (status === 'changed') return 'Changed since the recorded semantic state was captured';
  if (status === 'stale') return 'Stale against the recorded semantic state';
  return 'No current lifecycle issue detected';
}

export function buildSkillWorkbenchModel({
  repoRoot,
  selectedSkill,
  dependencyRecords = [],
  sourceStatuses = new Map(),
  selectedStatus = 'unknown',
}) {
  const selectedNode = {
    id: selectedSkill.packageName,
    type: 'skill',
    repoRoot,
    packageName: selectedSkill.packageName,
    name: selectedSkill.name,
    skillFile: selectedSkill.skillFile,
    status: selectedStatus,
    explanation: selectedStatus === 'stale'
      ? `Stale because one or more recorded sources changed: ${selectedSkill.sources.join(', ')}`
      : 'Current against the recorded semantic state',
  };

  const sourceNodes = selectedSkill.sources.map((source) => ({
    id: `source:${source}`,
    type: 'source',
    path: source,
    status: sourceStatuses.get(source) || 'unknown',
    explanation: explainNodeStatus(sourceStatuses.get(source) || 'unknown'),
  }));

  const dependencyNodes = dependencyRecords.map((dependency) => ({
    id: dependency.packageName,
    type: 'dependency',
    packageName: dependency.packageName,
    status: dependency.status || 'unknown',
    explanation: explainNodeStatus(dependency.status || 'unknown'),
  }));

  return {
    selected: selectedNode,
    nodes: [selectedNode, ...sourceNodes, ...dependencyNodes],
    edges: [
      ...sourceNodes.map((node) => ({
        source: node.id,
        target: selectedNode.id,
        kind: 'provenance',
      })),
      ...dependencyNodes.map((node) => ({
        source: selectedNode.id,
        target: node.id,
        kind: 'requires',
      })),
    ],
  };
}

export function buildTransitiveSkillWorkbenchModel({
  repoRoot,
  targetPackageName,
  skillGraph,
  statusMap,
  changedSources = new Set(),
  resolveSkillSources,
  resolveSkillRequires,
}) {
  const targetGraphNode = skillGraph.get(targetPackageName);
  if (!targetGraphNode) return null;

  const depthMap = new Map();
  const parentMap = new Map();
  const bfsOrder = [];
  const queue = [{ name: targetPackageName, depth: 0, parent: null }];

  while (queue.length > 0) {
    const { name, depth, parent } = queue.shift();
    if (depthMap.has(name)) continue;

    depthMap.set(name, depth);
    if (parent !== null) parentMap.set(name, parent);
    bfsOrder.push(name);

    const graphNode = skillGraph.get(name);

    // Use graph dependencies if available, fall back to declared requires
    const deps = graphNode
      ? graphNode.dependencies
      : [];

    // Also include declared requires that aren't in graph dependencies
    const declared = resolveSkillRequires ? resolveSkillRequires(name) : [];
    const allDeps = [...new Set([...deps, ...declared])];

    for (const dep of allDeps) {
      if (!depthMap.has(dep)) {
        queue.push({ name: dep, depth: depth + 1, parent: name });
      }
    }
  }

  const nodes = [];
  const edges = [];
  const sourceTracker = new Map();

  for (const packageName of bfsOrder) {
    const graphNode = skillGraph.get(packageName);
    if (!graphNode) {
      nodes.push({
        id: packageName,
        type: 'dependency',
        packageName,
        name: packageName.split('/').pop(),
        description: null,
        version: null,
        status: 'unknown',
        explanation: 'Package not found in skill graph',
        depth: depthMap.get(packageName),
      });
      continue;
    }

    const isTarget = packageName === targetPackageName;
    const status = statusMap?.get(packageName) || 'unknown';

    nodes.push({
      id: packageName,
      type: isTarget ? 'skill' : 'dependency',
      packageName,
      name: graphNode.name,
      description: graphNode.description || null,
      version: graphNode.packageVersion || null,
      status,
      explanation: explainNodeStatus(status),
      depth: depthMap.get(packageName),
    });

    const sources = resolveSkillSources(packageName);
    for (const sourcePath of sources) {
      const sourceId = `source:${sourcePath}`;
      if (!sourceTracker.has(sourceId)) {
        sourceTracker.set(sourceId, { path: sourcePath, usedBy: [] });
      }
      sourceTracker.get(sourceId).usedBy.push(packageName);
    }

    const deps = graphNode ? graphNode.dependencies : [];
    const declared = resolveSkillRequires ? resolveSkillRequires(packageName) : [];
    const allDeps = [...new Set([...deps, ...declared])];

    for (const dep of allDeps) {
      if (depthMap.has(dep)) {
        edges.push({
          source: packageName,
          target: dep,
          kind: 'requires',
        });
      }
    }
  }

  const sourceNodes = [];
  for (const [sourceId, sourceData] of sourceTracker) {
    const isChanged = changedSources.has(sourceData.path);
    sourceNodes.push({
      id: sourceId,
      type: 'source',
      path: sourceData.path,
      status: isChanged ? 'changed' : 'current',
      explanation: isChanged
        ? 'Changed since the recorded semantic state was captured'
        : 'No current lifecycle issue detected',
      depth: 0,
      usedBy: sourceData.usedBy,
    });

    for (const skillPackageName of sourceData.usedBy) {
      edges.push({
        source: sourceId,
        target: skillPackageName,
        kind: 'provenance',
      });
    }
  }

  const selectedNode = nodes.find((n) => n.id === targetPackageName);

  return {
    selected: selectedNode,
    nodes: [...sourceNodes, ...nodes],
    edges,
  };
}
