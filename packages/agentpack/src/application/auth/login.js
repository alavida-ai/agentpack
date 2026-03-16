import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readUserConfig, writeUserConfig } from '../../infrastructure/fs/user-config-repository.js';
import { writeUserCredentials } from '../../infrastructure/fs/user-credentials-repository.js';
import { writeManagedNpmrcEntries } from '../../infrastructure/fs/user-npmrc-repository.js';
import { openBrowser } from '../../infrastructure/runtime/open-browser.js';
import { AgentpackError, EXIT_CODES } from '../../utils/errors.js';

const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens';

export async function login({
  env = process.env,
  scope = null,
  registry = null,
} = {}) {
  const current = readUserConfig({ env });
  const nextConfig = {
    ...current,
    scope: scope || current.scope,
    registry: registry || current.registry,
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
      storage: {
        mode: 'file',
      },
    };
  } finally {
    rl.close();
  }
}
