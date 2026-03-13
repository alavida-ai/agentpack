import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

function createHomeEnv() {
  const home = mkdtempSync(join(tmpdir(), 'agentpack-skills-registry-home-'));
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config-root'),
  };

  return {
    env,
    cleanup() {
      rmSync(home, { recursive: true, force: true });
    },
  };
}

describe('agentpack skills registry', () => {
  it('reports missing repo-local npm registry config clearly', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-missing');
    const home = createHomeEnv();

    try {
      const result = runCLI(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Scope: @alavida/);
      assert.match(result.stdout, /Configured: false/);
      assert.match(result.stdout, /Registry: missing/);
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });

  it('reports configured GitHub Packages routing from .npmrc', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-configured');
    const home = createHomeEnv();

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
          + 'always-auth=true\n'
      );

      const result = runCLI(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Configured: true/);
      assert.match(result.stdout, /Registry: https:\/\/npm\.pkg\.github\.com/);
      assert.match(result.stdout, /Auth: environment variable reference/);
      assert.match(result.stdout, /Always Auth: true/);
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });

  it('returns structured JSON for registry inspection', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-json');
    const home = createHomeEnv();

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.scope, '@alavida');
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.auth.mode, 'env');
      assert.equal(result.json.auth.key, 'GITHUB_PACKAGES_TOKEN');
      assert.equal(result.json.alwaysAuth, false);
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });

  it('detects the real org scope when .npmrc routes @alavida-ai through GitHub Packages', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-alavida-ai');
    const home = createHomeEnv();

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida-ai:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
          + 'always-auth=true\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.scope, '@alavida-ai');
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.auth.mode, 'env');
      assert.equal(result.json.auth.key, 'GITHUB_PACKAGES_TOKEN');
      assert.equal(result.json.alwaysAuth, true);
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });

  it('falls back to the machine-level npm config when repo-local wiring is absent', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-user-level');
    const home = createHomeEnv();

    try {
      writeFileSync(
        join(home.env.HOME, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=secret-token\n'
      );
      mkdirSync(join(home.env.XDG_CONFIG_HOME, 'agentpack'), { recursive: true });
      writeFileSync(
        join(home.env.XDG_CONFIG_HOME, 'agentpack', 'config.json'),
        JSON.stringify({
          version: 1,
          provider: 'github-packages',
          scope: '@alavida',
          registry: 'https://npm.pkg.github.com',
          verificationPackage: '@alavida/registry-probe',
          managedNpmKeys: ['@alavida:registry', '//npm.pkg.github.com/:_authToken'],
        }, null, 2) + '\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.source, 'user');
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });

  it('prefers repo-local npm wiring over the machine-level defaults', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-repo-override');
    const home = createHomeEnv();

    try {
      writeFileSync(
        join(home.env.HOME, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=user-token\n'
      );
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida:registry=http://127.0.0.1:4873\n'
          + '//127.0.0.1:4873/:_authToken=repo-token\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root, env: home.env });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'http://127.0.0.1:4873');
      assert.equal(result.json.source, 'repo');
    } finally {
      home.cleanup();
      consumer.cleanup();
    }
  });
});
