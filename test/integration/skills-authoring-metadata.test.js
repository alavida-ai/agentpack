import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture } from './fixtures.js';
import { generateBuildState, generateSkillsCatalog } from '../../src/lib/skills.js';

describe('agentpack skills authoring metadata generation', () => {
  it('generates skills catalog deterministically from the fixture monorepo', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-catalog-generation');

    try {
      const generated = generateSkillsCatalog({ cwd: repo.root });
      const expected = JSON.parse(
        readFileSync(join(repo.root, '.agentpack', 'catalog.json'), 'utf-8')
      );

      assert.deepEqual(generated, expected);
    } finally {
      repo.cleanup();
    }
  });

  it('generates build-state deterministically from the fixture monorepo', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-build-state-generation');

    try {
      const generated = generateBuildState({ cwd: repo.root });
      const expected = JSON.parse(
        readFileSync(join(repo.root, '.agentpack', 'build-state.json'), 'utf-8')
      );

      assert.deepEqual(generated, expected);
    } finally {
      repo.cleanup();
    }
  });
});
