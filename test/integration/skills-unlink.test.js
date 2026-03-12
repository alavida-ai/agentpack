import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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

function writeDevSession(repoRoot, session) {
  mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });
  writeFileSync(join(repoRoot, '.agentpack', 'dev-session.json'), JSON.stringify(session, null, 2) + '\n');
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

  it('supports recursive unlink for the active dev-session root', () => {
    const repo = createTempRepo('skills-unlink-recursive');

    try {
      createLinkedSkill(repo.root, 'prd-development', 'prd-development');
      createLinkedSkill(repo.root, 'problem-statement', 'problem-statement');
      createLinkedSkill(repo.root, 'proto-persona', 'proto-persona');
      writeDevSession(repo.root, {
        version: 1,
        session_id: 'active-root',
        status: 'active',
        pid: 999999,
        repo_root: repo.root,
        target: 'skills/prd-development',
        root_skill: {
          name: 'prd-development',
          package_name: '@alavida/prd-development',
          path: 'skills/prd-development',
        },
        linked_skills: [
          { name: 'prd-development', package_name: '@alavida/prd-development', path: 'skills/prd-development' },
          { name: 'problem-statement', package_name: '@alavida/problem-statement', path: 'skills/problem-statement' },
          { name: 'proto-persona', package_name: '@alavida/proto-persona', path: 'skills/proto-persona' },
        ],
        links: [
          '.claude/skills/prd-development',
          '.agents/skills/prd-development',
          '.claude/skills/problem-statement',
          '.agents/skills/problem-statement',
          '.claude/skills/proto-persona',
          '.agents/skills/proto-persona',
        ],
        started_at: '2026-03-12T12:00:00.000Z',
        updated_at: '2026-03-12T12:00:00.000Z',
      });

      const result = runCLIJson(['skills', 'unlink', 'prd-development', '--recursive'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.unlinked, true);
      assert.deepEqual(result.json.removed.sort(), [
        '.agents/skills/prd-development',
        '.agents/skills/problem-statement',
        '.agents/skills/proto-persona',
        '.claude/skills/prd-development',
        '.claude/skills/problem-statement',
        '.claude/skills/proto-persona',
      ]);
      assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'problem-statement')), false);
      assert.equal(existsSync(join(repo.root, '.agents', 'skills', 'proto-persona')), false);
      assert.equal(existsSync(join(repo.root, '.agentpack', 'dev-session.json')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('returns a structured error when recursive unlink targets a non-root linked skill', () => {
    const repo = createTempRepo('skills-unlink-recursive-non-root');

    try {
      createLinkedSkill(repo.root, 'prd-development', 'prd-development');
      createLinkedSkill(repo.root, 'problem-statement', 'problem-statement');
      writeDevSession(repo.root, {
        version: 1,
        session_id: 'active-root',
        status: 'active',
        pid: 999999,
        repo_root: repo.root,
        target: 'skills/prd-development',
        root_skill: {
          name: 'prd-development',
          package_name: '@alavida/prd-development',
          path: 'skills/prd-development',
        },
        linked_skills: [
          { name: 'prd-development', package_name: '@alavida/prd-development', path: 'skills/prd-development' },
          { name: 'problem-statement', package_name: '@alavida/problem-statement', path: 'skills/problem-statement' },
        ],
        links: [
          '.claude/skills/prd-development',
          '.agents/skills/prd-development',
          '.claude/skills/problem-statement',
          '.agents/skills/problem-statement',
        ],
        started_at: '2026-03-12T12:00:00.000Z',
        updated_at: '2026-03-12T12:00:00.000Z',
      });

      const result = runCLIJson(['skills', 'unlink', 'problem-statement', '--recursive'], { cwd: repo.root });

      assert.equal(result.exitCode, 1);
      assert.equal(result.json.error, 'linked_skill_recursive_unlink_requires_root');
      assert.equal(result.json.details.rootSkill, 'prd-development');
      assert.equal(result.json.nextSteps[0].command, 'agentpack skills unlink prd-development --recursive');
    } finally {
      repo.cleanup();
    }
  });

  it('suggests forced cleanup when recursive unlink has no matching root session', () => {
    const repo = createTempRepo('skills-unlink-recursive-no-root');

    try {
      createLinkedSkill(repo.root, 'problem-statement', 'problem-statement');

      const result = runCLIJson(['skills', 'unlink', 'problem-statement', '--recursive'], { cwd: repo.root });

      assert.equal(result.exitCode, 1);
      assert.equal(result.json.error, 'linked_skill_recursive_unlink_requires_root');
      assert.equal(result.json.nextSteps[0].command, 'agentpack skills dev cleanup --force');
    } finally {
      repo.cleanup();
    }
  });
});
