export async function fetchWorkbenchModel(skillPackageName) {
  const params = skillPackageName ? `?skill=${encodeURIComponent(skillPackageName)}` : '';
  const response = await fetch(`/api/model${params}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load workbench model: ${response.status}`);
  }
  return response.json();
}

export async function runWorkbenchAction(action) {
  const response = await fetch(`/api/actions/${action}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Failed to run ${action}: ${response.status}`);
  }
  return response.json();
}
