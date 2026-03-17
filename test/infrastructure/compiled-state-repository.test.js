import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo } from '../integration/fixtures.js';
import {
  readCompiledState,
  writeCompiledState,
  writeCompiledPackageState,
} from '../../packages/agentpack/src/infrastructure/fs/compiled-state-repository.js';

describe('compiled state repository', () => {
  it('returns null when compiled state does not exist', () => {
    const repo = createTempRepo('compiled-state-missing');

    try {
      assert.equal(readCompiledState(repo.root), null);
    } finally {
      repo.cleanup();
    }
  });

  it('writes and reads compiled state from .agentpack/compiled.json', () => {
    const repo = createTempRepo('compiled-state-roundtrip');

    try {
      const state = {
        version: 2,
        active_package: '@alavida/prd-agent',
        packages: {
          '@alavida/prd-agent': {
            packageName: '@alavida/prd-agent',
            root_skill: 'skill:prd-agent',
            skills: [
              {
                id: 'skill:prd-agent',
                name: 'prd-agent',
              },
            ],
            sourceFiles: [],
            occurrences: [],
            edges: [],
          },
        },
      };

      writeCompiledState(repo.root, state);

      assert.equal(existsSync(join(repo.root, '.agentpack', 'compiled.json')), true);
      assert.deepEqual(readCompiledState(repo.root), state);
    } finally {
      repo.cleanup();
    }
  });

  it('merges one package entry without clobbering existing compiled packages', () => {
    const repo = createTempRepo('compiled-state-merge');

    try {
      writeCompiledPackageState(repo.root, {
        packageName: '@alavida/package-a',
        root_skill: 'skill:package-a',
        skills: [{ id: 'skill:package-a', name: 'package-a' }],
        sourceFiles: [],
        occurrences: [],
        edges: [],
      });

      writeCompiledPackageState(repo.root, {
        packageName: '@alavida/package-b',
        root_skill: 'skill:package-b',
        skills: [{ id: 'skill:package-b', name: 'package-b' }],
        sourceFiles: [],
        occurrences: [],
        edges: [],
      });

      const compiled = readCompiledState(repo.root);
      assert.equal(compiled.version, 2);
      assert.equal(compiled.active_package, '@alavida/package-b');
      assert.deepEqual(Object.keys(compiled.packages).sort(), [
        '@alavida/package-a',
        '@alavida/package-b',
      ]);
      assert.equal(compiled.packages['@alavida/package-a'].root_skill, 'skill:package-a');
      assert.equal(compiled.packages['@alavida/package-b'].root_skill, 'skill:package-b');
    } finally {
      repo.cleanup();
    }
  });
});
