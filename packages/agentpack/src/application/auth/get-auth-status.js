import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readUserConfig } from '../../infrastructure/fs/user-config-repository.js';
import { readUserCredentials } from '../../infrastructure/fs/user-credentials-repository.js';
import { getUserNpmrcPath, parseNpmrc, readUserNpmrc } from '../../infrastructure/fs/user-npmrc-repository.js';
import { resolveRegistryConfig } from '../../domain/auth/registry-resolution.js';
import { verifyAuth } from './verify-auth.js';

function findRepoNpmrc(cwd) {
  let current = cwd;

  while (true) {
    const npmrcPath = join(current, '.npmrc');
    if (existsSync(npmrcPath)) {
      return {
        path: npmrcPath,
        config: parseNpmrc(readFileSync(npmrcPath, 'utf-8')),
      };
    }

    const gitPath = join(current, '.git');
    if (existsSync(gitPath)) break;

    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }

  return {
    path: null,
    config: {},
  };
}

export async function getAuthStatus({
  cwd = process.cwd(),
  env = process.env,
  verify = false,
} = {}) {
  const config = readUserConfig({ env });
  const credentials = readUserCredentials({ env });
  const userNpmrc = readUserNpmrc({ env });
  const repoNpmrc = findRepoNpmrc(cwd);

  const resolved = resolveRegistryConfig({
    scope: config.scope,
    defaults: {
      registry: config.registry,
      verificationPackage: config.verificationPackage,
    },
    userNpmrc,
    repoNpmrc: repoNpmrc.config,
  });

  const userNpmrcPath = getUserNpmrcPath({ env });
  const requiredRegistryKey = `${config.scope}:registry`;
  const requiredTokenKey = resolved.registry
    ? `//${new URL(resolved.registry).host}/:_authToken`
    : null;

  const npmWired = Boolean(
    userNpmrc[requiredRegistryKey]
      && requiredTokenKey
      && userNpmrc[requiredTokenKey]
  );

  const result = {
    provider: config.provider,
    configured: Boolean(credentials?.token && npmWired),
    scope: config.scope,
    registry: resolved.registry,
    storage: {
      mode: credentials?.token ? 'file' : 'missing',
    },
    npmConfig: {
      path: userNpmrcPath,
      wired: npmWired,
      source: resolved.source,
      repoOverridePath: repoNpmrc.path,
    },
    verification: {
      status: 'not_checked',
    },
  };

  if (!verify) {
    return result;
  }

  result.verification = await verifyAuth({
    registry: resolved.registry,
    authToken: credentials?.token || null,
    verificationPackage: resolved.verificationPackage,
  });

  return result;
}
