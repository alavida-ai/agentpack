export async function fetchWorkbenchModel() {
  const response = await fetch('/api/model');
  if (!response.ok) {
    throw new Error(`Failed to load workbench model: ${response.status}`);
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
