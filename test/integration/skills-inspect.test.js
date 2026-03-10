import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addPackagedSkill, createTempRepo, runCLI } from './fixtures.js';

function createSkillFixture() {
  const repo = createTempRepo('skills-inspect');

  mkdirSync(join(repo.root, 'domains', 'value', 'knowledge'), { recursive: true });
  writeFileSync(
    join(repo.root, 'domains', 'value', 'knowledge', 'selling-points.md'),
    '# Selling Points\n'
  );
  writeFileSync(
    join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'),
    '# Tone Of Voice\n'
  );

  addPackagedSkill(repo.root, 'domains/value/skills/copywriting', {
    skillMd: `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
sources:
  - domains/value/knowledge/selling-points.md
  - domains/value/knowledge/tone-of-voice.md
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`,
    packageJson: {
      name: '@alavida/value-copywriting',
      version: '1.2.0',
      description: "Write copy aligned with Alavida's value messaging and tone.",
      files: ['SKILL.md'],
      dependencies: {
        '@alavida/methodology-gary-provost': '^1.0.0',
      },
    },
  });

  return repo;
}

describe('agentpack skills inspect', () => {
  it('inspects a packaged skill by directory path', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['skills', 'inspect', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: value-copywriting/);
      assert.match(result.stdout, /Package: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Version: 1\.2\.0/);
      assert.match(result.stdout, /Path: domains\/value\/skills\/copywriting\/SKILL\.md/);
      assert.match(result.stdout, /Sources:/);
      assert.match(result.stdout, /domains\/value\/knowledge\/selling-points\.md/);
      assert.match(result.stdout, /Requires:/);
      assert.match(result.stdout, /@alavida\/methodology-gary-provost/);
    } finally {
      repo.cleanup();
    }
  });

  it('inspects a packaged skill by package name', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['skills', 'inspect', '@alavida/value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Package: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Path: domains\/value\/skills\/copywriting\/SKILL\.md/);
    } finally {
      repo.cleanup();
    }
  });

  it('shows deprecation metadata when present', () => {
    const repo = createSkillFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
    - domains/value/knowledge/tone-of-voice.md
  status: deprecated
  replacement: @alavida/value-research
  message: Use the newer research-backed writing workflow.
requires:
  - @alavida/methodology-gary-provost
---

# Value Copywriting
`
      );

      const result = runCLI(['skills', 'inspect', '@alavida/value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Status: deprecated/);
      assert.match(result.stdout, /Replacement: @alavida\/value-research/);
      assert.match(result.stdout, /Message: Use the newer research-backed writing workflow\./);
    } finally {
      repo.cleanup();
    }
  });

  it('parses folded multiline descriptions from frontmatter', () => {
    const repo = createTempRepo('skills-inspect-folded-description');

    try {
      addPackagedSkill(repo.root, 'skills/digest-book', {
        skillMd: `---
name: digest-book
description: >
  Convert a PDF book into structured markdown.
  Keep the concept index navigable.
requires: []
---

# Digest Book
`,
        packageJson: {
          name: '@alavida/digest-book',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const result = runCLI(['skills', 'inspect', 'skills/digest-book'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(
        result.stdout,
        /Description: Convert a PDF book into structured markdown\. Keep the concept index navigable\./
      );
    } finally {
      repo.cleanup();
    }
  });

  it('returns a not found error for an unknown skill target', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['skills', 'inspect', '@alavida/unknown-skill'], { cwd: repo.root });

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, /Error: skill not found/i);
    } finally {
      repo.cleanup();
    }
  });
});
