import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  buildStateRecordForPackageDir,
  compareRecordedSources,
  hashFile,
  readBuildState,
  writeBuildState,
} from '../../src/domain/skills/skill-provenance.js';
import { createTempRepo } from '../integration/fixtures.js';

describe('skill provenance', () => {
  it('hashes files with a sha256 prefix', () => {
    const repo = createTempRepo('skill-provenance-hash');

    try {
      const sourceFile = join(repo.root, 'source.md');
      writeFileSync(sourceFile, '# Source\n');

      const hash = hashFile(sourceFile);

      assert.match(hash, /^sha256:[a-f0-9]{64}$/);
    } finally {
      repo.cleanup();
    }
  });

  it('writes and reads build-state records', () => {
    const repo = createTempRepo('skill-provenance-state');

    try {
      const state = {
        version: 1,
        skills: {
          '@alavida-ai/example': {
            package_version: '1.0.0',
            skill_path: 'domains/example/skills/example',
            skill_file: 'domains/example/skills/example/SKILL.md',
            sources: {},
            requires: [],
          },
        },
      };

      writeBuildState(repo.root, state);

      assert.equal(existsSync(join(repo.root, '.agentpack', 'build-state.json')), true);
      assert.deepEqual(readBuildState(repo.root), state);
    } finally {
      repo.cleanup();
    }
  });

  it('builds a provenance record for a packaged skill dir and detects stale sources', () => {
    const repo = createTempRepo('skill-provenance-record');

    try {
      const packageDir = join(repo.root, 'domains', 'operations', 'skills', 'weekly-planner');
      const skillFile = join(packageDir, 'SKILL.md');
      mkdirSync(join(repo.root, 'domains', 'operations', 'knowledge'), { recursive: true });
      mkdirSync(packageDir, { recursive: true });

      writeFileSync(join(repo.root, 'domains', 'operations', 'knowledge', 'plan.yaml'), 'goal: ship\n');
      writeFileSync(skillFile, '# Weekly Planner\n');
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@alavida-ai/weekly-planner', version: '1.2.3' }, null, 2) + '\n'
      );

      const { packageName, record } = buildStateRecordForPackageDir(repo.root, packageDir, {
        parseSkillFrontmatterFile: () => ({
          sources: ['domains/operations/knowledge/plan.yaml'],
          requires: ['@alavida-ai/agonda-prioritisation'],
        }),
        readPackageMetadata: () => ({
          packageName: '@alavida-ai/weekly-planner',
          packageVersion: '1.2.3',
        }),
        normalizeDisplayPath: (repoRoot, pathValue) => relative(repoRoot, pathValue).split('\\').join('/'),
      });

      assert.equal(packageName, '@alavida-ai/weekly-planner');
      assert.equal(record.package_version, '1.2.3');
      assert.equal(record.skill_path, 'domains/operations/skills/weekly-planner');
      assert.equal(record.skill_file, 'domains/operations/skills/weekly-planner/SKILL.md');
      assert.deepEqual(record.requires, ['@alavida-ai/agonda-prioritisation']);
      assert.match(
        record.sources['domains/operations/knowledge/plan.yaml'].hash,
        /^sha256:[a-f0-9]{64}$/
      );

      writeFileSync(join(repo.root, 'domains', 'operations', 'knowledge', 'plan.yaml'), 'goal: changed\n');

      const changes = compareRecordedSources(repo.root, record);
      assert.equal(changes.length, 1);
      assert.equal(changes[0].path, 'domains/operations/knowledge/plan.yaml');
      assert.notEqual(changes[0].recorded, changes[0].current);
    } finally {
      repo.cleanup();
    }
  });
});
