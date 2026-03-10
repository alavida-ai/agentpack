import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepoFromFixture, createTempRepo, createValidateFixture, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills validate', () => {
  it('validates one packaged skill successfully', () => {
    const repo = createValidateFixture();

    try {
      const result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Status: valid/);
      assert.match(result.stdout, /Issues: 0/);
      assert.match(result.stdout, /Next Steps:/);
      assert.match(result.stdout, /npm version patch/);
      assert.match(result.stdout, /npm publish/);
      assert.match(result.stdout, /https:\/\/npm\.pkg\.github\.com/);
    } finally {
      repo.cleanup();
    }
  });

  it('validates all authored packaged skills in a repo', () => {
    const repo = createRepoFromFixture('monorepo', 'skills-validate-all');

    try {
      const result = runCLI(['skills', 'validate'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Validated Skills: 3/);
      assert.match(result.stdout, /Valid Skills: 3/);
      assert.match(result.stdout, /Invalid Skills: 0/);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured release guidance for a valid packaged skill', () => {
    const repo = createValidateFixture();

    try {
      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.valid, true);
      assert.equal(result.json.nextSteps[0].command, 'npm version patch');
      assert.equal(result.json.nextSteps[1].command, 'npm publish');
      assert.equal(result.json.nextSteps[1].registry, 'https://npm.pkg.github.com');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when a declared source file does not exist', () => {
    const repo = createValidateFixture();

    try {
      rmSync(join(repo.root, 'domains', 'value', 'knowledge', 'selling-points.md'));

      const result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stdout, /Status: invalid/);
      assert.match(result.stdout, /missing_source/);
      assert.match(result.stdout, /domains\/value\/knowledge\/selling-points\.md/);
    } finally {
      repo.cleanup();
    }
  });

  it('auto-syncs managed requires into package dependencies before validation', () => {
    const repo = createValidateFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json'),
        JSON.stringify(
          {
            name: '@alavida/value-copywriting',
            version: '1.2.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida/knowledge-base.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {},
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      const packageJson = JSON.parse(
        readFileSync(join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json'), 'utf-8')
      );

      assert.equal(result.exitCode, 0);
      assert.equal(result.json.valid, true);
      assert.equal(result.json.packageName, '@alavida/value-copywriting');
      assert.equal(result.json.issues.length, 0);
      assert.equal(packageJson.dependencies['@alavida/methodology-gary-provost'], '*');
    } finally {
      repo.cleanup();
    }
  });

  it('syncs managed dependencies from metadata.requires before validation', () => {
    const repo = createTempRepo('skills-validate-metadata-requires');

    try {
      mkdirSync(join(repo.root, 'domains', 'operations', 'knowledge'), { recursive: true });
      mkdirSync(
        join(repo.root, 'domains', 'operations', 'workbenches', 'creator', 'execution-ops', 'skills', 'weekly-planner'),
        { recursive: true }
      );
      writeFileSync(join(repo.root, 'domains', 'operations', 'knowledge', 'plan.yaml'), 'goal: ship\n');
      writeFileSync(join(repo.root, 'domains', 'operations', 'knowledge', 'workspace-lifecycle.md'), '# Lifecycle\n');
      writeFileSync(
        join(repo.root, 'domains', 'operations', 'workbenches', 'creator', 'execution-ops', 'skills', 'weekly-planner', 'SKILL.md'),
        `---
name: weekly-planner
description: Plan the upcoming week against the current plan.
metadata:
  sources:
    - domains/operations/knowledge/plan.yaml
    - domains/operations/knowledge/workspace-lifecycle.md
  requires:
    - "@alavida-ai/agonda-prioritisation"
---

# Weekly Planner
`
      );
      writeFileSync(
        join(repo.root, 'domains', 'operations', 'workbenches', 'creator', 'execution-ops', 'skills', 'weekly-planner', 'package.json'),
        JSON.stringify(
          {
            name: '@alavida-ai/weekly-planner',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/alavida.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {},
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/operations/workbenches/creator/execution-ops/skills/weekly-planner'],
        { cwd: repo.root }
      );

      const packageJson = JSON.parse(
        readFileSync(
          join(repo.root, 'domains', 'operations', 'workbenches', 'creator', 'execution-ops', 'skills', 'weekly-planner', 'package.json'),
          'utf-8'
        )
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.valid, true);
      assert.equal(packageJson.dependencies['@alavida-ai/agonda-prioritisation'], '*');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when an @alavida package is missing repository metadata', () => {
    const repo = createValidateFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json'),
        JSON.stringify(
          {
            name: '@alavida/value-copywriting',
            version: '1.2.0',
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/methodology-gary-provost': '^1.0.0',
            },
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'missing_repository');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when an @alavida package does not target GitHub Packages', () => {
    const repo = createValidateFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'package.json'),
        JSON.stringify(
          {
            name: '@alavida/value-copywriting',
            version: '1.2.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida/knowledge-base.git',
            },
            publishConfig: {
              registry: 'https://registry.npmjs.org',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/methodology-gary-provost': '^1.0.0',
            },
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'invalid_publish_registry');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when metadata.status is not a supported lifecycle value', () => {
    const repo = createValidateFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
  status: active
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'invalid_skill_status');
    } finally {
      repo.cleanup();
    }
  });

  it('fails when metadata.replacement is not a package name', () => {
    const repo = createValidateFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
  status: deprecated
  replacement: value-research
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`
      );

      const result = runCLIJson(
        ['skills', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'invalid_replacement');
    } finally {
      repo.cleanup();
    }
  });
});
