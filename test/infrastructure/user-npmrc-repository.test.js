import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getUserNpmrcPath,
  readUserNpmrc,
  removeManagedNpmrcEntries,
  writeManagedNpmrcEntries,
} from '../../src/infrastructure/fs/user-npmrc-repository.js';

const cleanupPaths = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    rmSync(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

function createEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-npmrc-home-'));
  cleanupPaths.push(home);
  return { HOME: home };
}

describe('user npmrc repository', () => {
  it('resolves the user npmrc path in the home directory', () => {
    const env = createEnv();

    assert.equal(getUserNpmrcPath({ env }), join(env.HOME, '.npmrc'));
  });

  it('preserves unrelated keys and comments while adding managed entries', () => {
    const env = createEnv();
    const npmrcPath = getUserNpmrcPath({ env });

    writeFileSync(
      npmrcPath,
      '# existing comment\nregistry=https://registry.npmjs.org/\n@other:registry=https://example.com\n'
    );

    writeManagedNpmrcEntries({
      entries: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'secret-token',
      },
      env,
    });

    const content = readFileSync(npmrcPath, 'utf-8');
    assert.match(content, /# existing comment/);
    assert.match(content, /registry=https:\/\/registry\.npmjs\.org\//);
    assert.match(content, /@other:registry=https:\/\/example\.com/);
    assert.match(content, /@alavida:registry=https:\/\/npm\.pkg\.github\.com/);
    assert.match(content, /\/\/npm\.pkg\.github\.com\/:_authToken=secret-token/);
  });

  it('updates only the managed keys when writing again', () => {
    const env = createEnv();

    writeManagedNpmrcEntries({
      entries: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'old-token',
      },
      env,
    });

    writeManagedNpmrcEntries({
      entries: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'new-token',
      },
      env,
    });

    const parsed = readUserNpmrc({ env });
    assert.equal(parsed['@alavida:registry'], 'https://npm.pkg.github.com');
    assert.equal(parsed['//npm.pkg.github.com/:_authToken'], 'new-token');
  });

  it('removes only the managed entries during cleanup', () => {
    const env = createEnv();
    const npmrcPath = getUserNpmrcPath({ env });

    writeFileSync(
      npmrcPath,
      '# existing comment\nregistry=https://registry.npmjs.org/\n@other:registry=https://example.com\n@alavida:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=secret-token\n'
    );

    removeManagedNpmrcEntries({
      keys: ['@alavida:registry', '//npm.pkg.github.com/:_authToken'],
      env,
    });

    const content = readFileSync(npmrcPath, 'utf-8');
    assert.match(content, /# existing comment/);
    assert.match(content, /registry=https:\/\/registry\.npmjs\.org\//);
    assert.match(content, /@other:registry=https:\/\/example\.com/);
    assert.doesNotMatch(content, /@alavida:registry=/);
    assert.doesNotMatch(content, /npm\.pkg\.github\.com\/:_authToken/);
  });
});
