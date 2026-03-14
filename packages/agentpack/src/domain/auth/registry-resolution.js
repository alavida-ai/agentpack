function getScopedRegistry(config, scope) {
  return config?.[`${scope}:registry`] || null;
}

function getRegistryHostKey(registry) {
  if (!registry) return null;
  try {
    const url = new URL(registry);
    return `//${url.host}/:_authToken`;
  } catch {
    return null;
  }
}

function getAuthToken(config, registry) {
  const hostKey = getRegistryHostKey(registry);
  return hostKey ? (config?.[hostKey] || null) : null;
}

export function resolveRegistryConfig({
  scope,
  defaults = {},
  userNpmrc = {},
  repoNpmrc = {},
} = {}) {
  const repoRegistry = getScopedRegistry(repoNpmrc, scope);
  if (repoRegistry) {
    return {
      scope,
      registry: repoRegistry,
      authToken: getAuthToken(repoNpmrc, repoRegistry),
      verificationPackage: defaults.verificationPackage || null,
      source: 'repo',
    };
  }

  const userRegistry = getScopedRegistry(userNpmrc, scope);
  if (userRegistry) {
    return {
      scope,
      registry: userRegistry,
      authToken: getAuthToken(userNpmrc, userRegistry),
      verificationPackage: defaults.verificationPackage || null,
      source: 'user',
    };
  }

  return {
    scope,
    registry: defaults.registry || null,
    authToken: null,
    verificationPackage: defaults.verificationPackage || null,
    source: 'default',
  };
}
