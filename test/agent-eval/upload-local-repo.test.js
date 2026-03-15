import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uploadLocalRepoToSandbox } from '../../scripts/agent-eval/upload-local-repo.mjs';

describe('uploadLocalRepoToSandbox', () => {
  it('writes repo files into the sandbox and skips ignored directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-eval-upload-'));
    const uploadedBatches = [];

    try {
      mkdirSync(join(root, '.git'), { recursive: true });
      mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
      mkdirSync(join(root, 'skills', 'prd-agent'), { recursive: true });

      writeFileSync(join(root, 'README.md'), '# Repo\n');
      writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      writeFileSync(join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
      writeFileSync(join(root, 'skills', 'prd-agent', 'SKILL.md'), '# PRD Agent\n');

      await uploadLocalRepoToSandbox({
        localRoot: root,
        remoteRoot: '/workspace/task-repo',
        sandbox: {
          files: {
            async write(files) {
              uploadedBatches.push(files);
            },
          },
        },
      });

      const uploadedPaths = uploadedBatches.flat().map((entry) => entry.path).sort();
      assert.deepEqual(uploadedPaths, [
        '/workspace/task-repo/README.md',
        '/workspace/task-repo/skills/prd-agent/SKILL.md',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
