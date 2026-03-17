export function resolveWorkbenchNodeInteraction(node, selectedId = null) {
  if (!node) {
    return {
      action: 'select',
      target: null,
    };
  }

  return {
    action: 'select',
    target: selectedId === node.id ? null : node.id,
  };
}
