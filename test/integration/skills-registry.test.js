import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills registry', () => {
  it('reports missing repo-local npm registry config clearly', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-missing');

    try {
      const result = runCLI(['skills', 'registry'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Scope: @alavida/);
      assert.match(result.stdout, /Configured: false/);
      assert.match(result.stdout, /Registry: missing/);
    } finally {
      consumer.cleanup();
    }
  });

  it('reports configured GitHub Packages routing from .npmrc', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-configured');

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
          + 'always-auth=true\n'
      );

      const result = runCLI(['skills', 'registry'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Configured: true/);
      assert.match(result.stdout, /Registry: https:\/\/npm\.pkg\.github\.com/);
      assert.match(result.stdout, /Auth: environment variable reference/);
      assert.match(result.stdout, /Always Auth: true/);
    } finally {
      consumer.cleanup();
    }
  });

  it('returns structured JSON for registry inspection', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-json');

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.scope, '@alavida');
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.auth.mode, 'env');
      assert.equal(result.json.auth.key, 'GITHUB_PACKAGES_TOKEN');
      assert.equal(result.json.alwaysAuth, false);
    } finally {
      consumer.cleanup();
    }
  });

  it('detects the real org scope when .npmrc routes @alavida-ai through GitHub Packages', () => {
    const consumer = createRepoFromFixture('consumer', 'skills-registry-alavida-ai');

    try {
      writeFileSync(
        join(consumer.root, '.npmrc'),
        '@alavida-ai:registry=https://npm.pkg.github.com\n'
          + '//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}\n'
          + 'always-auth=true\n'
      );

      const result = runCLIJson(['skills', 'registry'], { cwd: consumer.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.scope, '@alavida-ai');
      assert.equal(result.json.configured, true);
      assert.equal(result.json.registry, 'https://npm.pkg.github.com');
      assert.equal(result.json.auth.mode, 'env');
      assert.equal(result.json.auth.key, 'GITHUB_PACKAGES_TOKEN');
      assert.equal(result.json.alwaysAuth, true);
    } finally {
      consumer.cleanup();
    }
  });
});
