function normalizeRelativePath(pathValue) {
  return String(pathValue || '').replaceAll('\\', '/').replace(/^\.\/+/, '');
}

export function isGeneratedPackagePath(pathValue) {
  const normalized = normalizeRelativePath(pathValue);
  if (!normalized) return false;

  return normalized === 'dist'
    || normalized.startsWith('dist/')
    || normalized === '.agentpack'
    || normalized.startsWith('.agentpack/');
}
