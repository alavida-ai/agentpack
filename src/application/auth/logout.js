import { deleteUserCredentials } from '../../infrastructure/fs/user-credentials-repository.js';
import { removeManagedNpmrcEntries } from '../../infrastructure/fs/user-npmrc-repository.js';
import { readUserConfig } from '../../infrastructure/fs/user-config-repository.js';

export function logout({ env = process.env } = {}) {
  const config = readUserConfig({ env });
  const keys = config.managedNpmKeys || [];

  deleteUserCredentials({ env });
  removeManagedNpmrcEntries({ keys, env });

  return {
    removedCredentials: true,
    removedNpmKeys: keys.length,
  };
}
