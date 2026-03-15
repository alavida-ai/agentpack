import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo } from '../integration/fixtures.js';
import {
  readMaterializationState,
  writeMaterializationState,
} from '../../packages/agentpack/src/infrastructure/fs/materialization-state-repository.js';

describe('materialization state repository', () => {
  it('returns null when materialization state does not exist', () => {
    const repo = createTempRepo('materialization-state-missing');

    try {
      assert.equal(readMaterializationState(repo.root), null);
    } finally {
      repo.cleanup();
    }
  });

  it('writes and reads materialization state from .agentpack/materialization-state.json', () => {
    const repo = createTempRepo('materialization-state-roundtrip');

    try {
      const state = {
        version: 1,
        adapters: {
          claude: [
            {
              target: '.claude/skills/prd-agent',
            },
          ],
        },
      };

      writeMaterializationState(repo.root, state);

      assert.equal(existsSync(join(repo.root, '.agentpack', 'materialization-state.json')), true);
      assert.deepEqual(readMaterializationState(repo.root), state);
    } finally {
      repo.cleanup();
    }
  });
});
