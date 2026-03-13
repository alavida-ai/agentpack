import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readUserConfig, writeUserConfig } from '../../infrastructure/fs/user-config-repository.js';
import { writeUserCredentials } from '../../infrastructure/fs/user-credentials-repository.js';
import { writeManagedNpmrcEntries } from '../../infrastructure/fs/user-npmrc-repository.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { verifyAuth } from './verify-auth.js';
import { AgentpackError, EXIT_CODES } from '../../utils/errors.js';

const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens';

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
      throw new AgentpackError('The saved credential was rejected by the configured registry', {
        code: 'auth_verification_failed',
        exitCode: EXIT_CODES.GENERAL,
      });
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
