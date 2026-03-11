function explainNodeStatus(status) {
  if (status === 'affected') return 'Affected by upstream authored state changes';
  if (status === 'changed') return 'Changed since recorded build-state';
  if (status === 'stale') return 'Stale against recorded build-state';
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
      : 'Current against recorded build-state',
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
