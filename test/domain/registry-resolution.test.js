import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegistryConfig } from '../../packages/agentpack/src/domain/auth/registry-resolution.js';

describe('registry resolution', () => {
  it('prefers repo-local npmrc over user npmrc and defaults', () => {
    const result = resolveRegistryConfig({
      scope: '@alavida',
      defaults: {
        registry: 'https://npm.pkg.github.com',
        verificationPackage: '@alavida/default-probe',
      },
      userNpmrc: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'user-token',
      },
      repoNpmrc: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'repo-token',
      },
    });

    assert.equal(result.scope, '@alavida');
    assert.equal(result.registry, 'https://npm.pkg.github.com');
    assert.equal(result.authToken, 'repo-token');
    assert.equal(result.source, 'repo');
    assert.equal(result.verificationPackage, '@alavida/default-probe');
  });

  it('falls back to user npmrc when repo config is missing', () => {
    const result = resolveRegistryConfig({
      scope: '@alavida',
      defaults: {
        registry: 'https://npm.pkg.github.com',
        verificationPackage: '@alavida/default-probe',
      },
      userNpmrc: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'user-token',
      },
      repoNpmrc: {},
    });

    assert.equal(result.registry, 'https://npm.pkg.github.com');
    assert.equal(result.authToken, 'user-token');
    assert.equal(result.source, 'user');
  });

  it('falls back to defaults when neither npmrc config is present', () => {
    const result = resolveRegistryConfig({
      scope: '@alavida',
      defaults: {
        registry: 'https://npm.pkg.github.com',
        verificationPackage: '@alavida/default-probe',
      },
      userNpmrc: {},
      repoNpmrc: {},
    });

    assert.equal(result.registry, 'https://npm.pkg.github.com');
    assert.equal(result.authToken, null);
    assert.equal(result.source, 'default');
    assert.equal(result.verificationPackage, '@alavida/default-probe');
  });

  it('does not depend on always-auth to resolve config', () => {
    const result = resolveRegistryConfig({
      scope: '@alavida',
      defaults: {
        registry: 'https://npm.pkg.github.com',
        verificationPackage: null,
      },
      userNpmrc: {
        '@alavida:registry': 'https://npm.pkg.github.com',
        '//npm.pkg.github.com/:_authToken': 'user-token',
        'always-auth': 'false',
      },
      repoNpmrc: {},
    });

    assert.equal(result.registry, 'https://npm.pkg.github.com');
    assert.equal(result.authToken, 'user-token');
    assert.equal(result.source, 'user');
  });
});
