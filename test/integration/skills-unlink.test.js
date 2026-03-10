import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createTempRepo, runCLI, runCLIJson } from './fixtures.js';

function createLinkedSkill(repoRoot, name, targetDirName) {
  const targetDir = join(repoRoot, 'skills', targetDirName);
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(join(repoRoot, '.claude', 'skills'), { recursive: true });
  mkdirSync(join(repoRoot, '.agents', 'skills'), { recursive: true });
  symlinkSync(targetDir, join(repoRoot, '.claude', 'skills', name), 'dir');
  symlinkSync(targetDir, join(repoRoot, '.agents', 'skills', name), 'dir');
}

describe('agentpack skills unlink', () => {
  it('removes linked skill symlinks', () => {
    const repo = createTempRepo('skills-unlink-basic');

    try {
      createLinkedSkill(repo.root, 'value-copywriting', 'copywriting');
      const result = runCLI(['skills', 'unlink', 'value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /value-copywriting/);
      assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(repo.root, '.agents', 'skills', 'value-copywriting')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('returns an error when the named skill is not linked', () => {
    const repo = createTempRepo('skills-unlink-missing');

    try {
      const result = runCLI(['skills', 'unlink', 'nonexistent-skill'], { cwd: repo.root });

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /not found|not linked/i);
    } finally {
      repo.cleanup();
    }
  });

  it('supports json output and leaves other links untouched', () => {
    const repo = createTempRepo('skills-unlink-json');

    try {
      createLinkedSkill(repo.root, 'value-copywriting', 'copywriting');
      createLinkedSkill(repo.root, 'value-research', 'research');

      const result = runCLIJson(['skills', 'unlink', 'value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.name, 'value-copywriting');
      assert.equal(result.json.unlinked, true);
      assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')), false);
      assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-research')));
      assert.ok(existsSync(join(repo.root, '.agents', 'skills', 'value-research')));
    } finally {
      repo.cleanup();
    }
  });
});
