import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readUserConfig, writeUserConfig } from '../../infrastructure/fs/user-config-repository.js';
import { writeUserCredentials } from '../../infrastructure/fs/user-credentials-repository.js';
import { writeManagedNpmrcEntries } from '../../infrastructure/fs/user-npmrc-repository.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { verifyAuth } from './verify-auth.js';
import { AgentpackError, EXIT_CODES } from '../../utils/errors.js';

const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens';

function buildVerificationFailure(verification) {
  if (verification.status === 'invalid') {
    return new AgentpackError('The GitHub personal access token was rejected by GitHub Packages', {
      code: 'auth_verification_failed',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  if (verification.status === 'insufficient_permissions') {
    return new AgentpackError('The GitHub personal access token does not have package read access', {
      code: 'auth_verification_failed',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  if (verification.status === 'unreachable') {
    return new AgentpackError('GitHub Packages could not be reached during verification', {
      code: 'auth_verification_failed',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  if (verification.status === 'not_configured') {
    return new AgentpackError('Authentication verification is not configured for this machine', {
      code: 'auth_verification_not_configured',
      exitCode: EXIT_CODES.GENERAL,
    });
  }

  return new AgentpackError('The saved credential was rejected by the configured registry', {
    code: 'auth_verification_failed',
    exitCode: EXIT_CODES.GENERAL,
  });
}

export async function login({
  env = process.env,
  scope = null,
  registry = null,
  verificationPackage = null,
} = {}) {
  const current = readUserConfig({ env });
  const nextConfig = {
    ...current,
    scope: scope || current.scope,
    registry: registry || current.registry,
    verificationPackage: verificationPackage || current.verificationPackage,
  };

  openBrowser(GITHUB_TOKEN_URL);
  output.write(`Configuring GitHub Packages auth for ${nextConfig.scope}`);
  output.write('Use a GitHub personal access token with package read access.');

  const rl = readline.createInterface({ input, output });
  try {
    const token = (await rl.question('Token: ')).trim();
    if (!token) {
      throw new AgentpackError('A GitHub credential is required to continue', {
        code: 'auth_token_missing',
        exitCode: EXIT_CODES.GENERAL,
      });
    }

    const verification = await verifyAuth({
      registry: nextConfig.registry,
      authToken: token,
      verificationPackage: nextConfig.verificationPackage,
    });

    if (verification.status !== 'valid') {
      throw buildVerificationFailure(verification);
    }

    const managedEntries = {
      [`${nextConfig.scope}:registry`]: nextConfig.registry,
      [`//${new URL(nextConfig.registry).host}/:_authToken`]: token,
    };

    writeManagedNpmrcEntries({ entries: managedEntries, env });
    writeUserCredentials({ token }, { env });
    writeUserConfig({
      ...nextConfig,
      managedNpmKeys: Object.keys(managedEntries),
    }, { env });

    return {
      configured: true,
      provider: nextConfig.provider,
      scope: nextConfig.scope,
      registry: nextConfig.registry,
      verificationPackage: nextConfig.verificationPackage,
      storage: {
        mode: 'file',
      },
    };
  } finally {
    rl.close();
  }
}
