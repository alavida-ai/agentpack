import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo } from '../integration/fixtures.js';
import {
  readCompiledState,
  writeCompiledState,
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
        version: 1,
        skills: [
          {
            id: 'skill:prd-agent',
            name: 'prd-agent',
          },
        ],
      };

      writeCompiledState(repo.root, state);

      assert.equal(existsSync(join(repo.root, '.agentpack', 'compiled.json')), true);
      assert.deepEqual(readCompiledState(repo.root), state);
    } finally {
      repo.cleanup();
    }
  });
});
