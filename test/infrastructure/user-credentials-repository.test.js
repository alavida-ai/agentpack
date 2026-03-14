import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  deleteUserCredentials,
  getUserCredentialsPath,
  readUserCredentials,
  writeUserCredentials,
} from '../../packages/agentpack/src/infrastructure/fs/user-credentials-repository.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-creds-home-'));
  cleanupPaths.push(home);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
  };
}

describe('user credentials repository', () => {
  it('stores credentials under the agentpack config dir', () => {
    const env = createEnv();

    assert.equal(
      getUserCredentialsPath({ env }),
      join(env.XDG_CONFIG_HOME, 'agentpack', 'credentials.json')
    );
  });

  it('saves and reads credentials', () => {
    const env = createEnv();

    writeUserCredentials({ token: 'secret-token' }, { env });

    assert.deepEqual(readUserCredentials({ env }), { token: 'secret-token' });
  });

  it('creates a file with strict permissions', () => {
    const env = createEnv();

    writeUserCredentials({ token: 'secret-token' }, { env });

    const mode = statSync(getUserCredentialsPath({ env })).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.doesNotMatch(readFileSync(getUserCredentialsPath({ env }), 'utf-8'), /\n\n/);
  });

  it('deletes credentials cleanly', () => {
    const env = createEnv();

    writeUserCredentials({ token: 'secret-token' }, { env });
    deleteUserCredentials({ env });

    assert.equal(readUserCredentials({ env }), null);
  });
});
