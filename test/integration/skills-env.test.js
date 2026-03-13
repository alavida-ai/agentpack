import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { addMultiSkillPackage, addPackagedSkill, createRepoFromFixture, createTempRepo, runCLI } from './fixtures.js';

describe('agentpack skills env', () => {
  it('shows exported and materialized entries for a multi-skill package without ambient package noise', () => {
    const source = createTempRepo('skills-env-multi-skill-source');
    const consumer = createRepoFromFixture('consumer', 'skills-env-multi-skill-consumer');

    try {
      addPackagedSkill(source.root, 'packages/foundation-primer', {
        skillMd: `---
name: foundation-primer
description: Foundation primer.
metadata:
  sources: []
requires: []
---

# Foundation Primer
`,
        packageJson: {
          name: '@alavida-ai/foundation-primer',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      addMultiSkillPackage(source.root, 'packages/prd-development', {
        packageJson: {
          name: '@alavida-ai/prd-development',
          version: '0.1.1',
          files: ['skills'],
          agentpack: {
            skills: {
              'prd-development': { path: 'skills/prd-development/SKILL.md' },
              'proto-persona': { path: 'skills/proto-persona/SKILL.md' },
              'problem-statement': { path: 'skills/problem-statement/SKILL.md' },
            },
          },
          dependencies: {
            '@alavida-ai/foundation-primer': 'file:../foundation-primer',
          },
        },
        skills: [
          {
            path: 'skills/prd-development',
            skillMd: `---
name: prd-development
description: Root workflow.
metadata:
  sources: []
requires: []
---

# PRD Development
`,
          },
          {
            path: 'skills/proto-persona',
            skillMd: `---
name: proto-persona
description: Proto persona.
metadata:
  sources: []
requires: []
---

# Proto Persona
`,
          },
          {
            path: 'skills/problem-statement',
            skillMd: `---
name: problem-statement
description: Problem statement.
metadata:
  sources: []
requires: []
---

# Problem Statement
`,
          },
        ],
      });

      addPackagedSkill(consumer.root, 'node_modules/@alavida-ai/unrelated-skill', {
        skillMd: `---
name: unrelated-skill
description: Ambient unrelated package.
metadata:
  sources: []
requires: []
---

# Unrelated Skill
`,
        packageJson: {
          name: '@alavida-ai/unrelated-skill',
          version: '9.9.9',
          files: ['SKILL.md'],
        },
      });

      const target = join(source.root, 'packages', 'prd-development');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const env = runCLI(['skills', 'env'], { cwd: consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      assert.match(env.stdout, /Installed Skills: 2/);
      assert.match(env.stdout, /@alavida-ai\/prd-development/);
      assert.match(env.stdout, /direct: true/);
      assert.match(env.stdout, /skills: prd-development, problem-statement, proto-persona/);
      assert.match(env.stdout, /materialized: \.claude\/skills\/prd-development \(symlink\)/);
      assert.match(env.stdout, /materialized: \.claude\/skills\/prd-development:proto-persona \(symlink\)/);
      assert.match(env.stdout, /materialized: \.agents\/skills\/prd-development:proto-persona \(symlink\)/);
      assert.doesNotMatch(env.stdout, /@alavida-ai\/unrelated-skill/);
    } finally {
      source.cleanup();
      consumer.cleanup();
    }
  });

  it('shows visible installed skills after install', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-env-source');
    const consumer = createRepoFromFixture('consumer', 'skills-env-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const env = runCLI(['skills', 'env'], { cwd: consumer.root });

      assert.equal(env.exitCode, 0, env.stderr);
      assert.match(env.stdout, /Installed Skills: 2/);
      assert.match(env.stdout, /@alavida\/value-copywriting/);
      assert.match(env.stdout, /direct: true/);
      assert.match(env.stdout, /@alavida\/methodology-gary-provost/);
      assert.match(env.stdout, /direct: false/);
      assert.match(env.stdout, /\.claude\/skills\/value-copywriting/);
      assert.match(env.stdout, /\.agents\/skills\/value-copywriting/);
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
