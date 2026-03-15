import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMultiSkillPackage,
  addPackagedSkill,
  createRepoFromFixture,
  createTempRepo,
  readMaterializationState,
  runCLI,
} from './fixtures.js';

function buildCompilerSkill({ name, description, declarations = '', body = '# Skill\n' }) {
  return `---
name: ${name}
description: ${description}
---

\`\`\`agentpack
${declarations}
\`\`\`

${body}`;
}

describe('agentpack skills uninstall', () => {
  it('removes multi-skill materialized entries and orphaned dependencies', () => {
    const source = createTempRepo('skills-uninstall-multi-skill-source');
    const consumer = createRepoFromFixture('consumer', 'skills-uninstall-multi-skill-consumer');

    try {
      addPackagedSkill(source.root, 'packages/foundation-primer', {
        skillMd: buildCompilerSkill({
          name: 'foundation-primer',
          description: 'Foundation primer.',
          body: '# Foundation Primer\n',
        }),
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
            skillMd: buildCompilerSkill({
              name: 'prd-development',
              description: 'Root workflow.',
              body: '# PRD Development\n',
            }),
          },
          {
            path: 'skills/proto-persona',
            skillMd: buildCompilerSkill({
              name: 'proto-persona',
              description: 'Proto persona.',
              body: '# Proto Persona\n',
            }),
          },
          {
            path: 'skills/problem-statement',
            skillMd: buildCompilerSkill({
              name: 'problem-statement',
              description: 'Problem statement.',
              body: '# Problem Statement\n',
            }),
          },
        ],
      });

      const target = join(source.root, 'packages', 'prd-development');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const uninstall = runCLI(['skills', 'uninstall', '@alavida-ai/prd-development'], { cwd: consumer.root });

      assert.equal(uninstall.exitCode, 0, uninstall.stderr);
      assert.match(uninstall.stdout, /Removed Skills: 2/);
      assert.match(uninstall.stdout, /@alavida-ai\/prd-development/);
      assert.match(uninstall.stdout, /@alavida-ai\/foundation-primer/);

      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'prd-development')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'prd-development:proto-persona')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'prd-development:problem-statement')), false);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'prd-development:proto-persona')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'foundation-primer')), false);

      const state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));
      assert.deepEqual(state, { version: 1, installs: {} });
      assert.deepEqual(readMaterializationState(consumer.root)?.adapters, {
        claude: [],
        agents: [],
      });
    } finally {
      source.cleanup();
      consumer.cleanup();
    }
  });

  it('removes the direct skill, orphaned dependency, materialized links, and runtime state', () => {
    const monorepo = createRepoFromFixture('monorepo', 'skills-uninstall-source');
    const consumer = createRepoFromFixture('consumer', 'skills-uninstall-consumer');

    try {
      const target = join(monorepo.root, 'domains', 'value', 'skills', 'copywriting');
      const install = runCLI(['skills', 'install', target], { cwd: consumer.root });
      assert.equal(install.exitCode, 0, install.stderr);

      const uninstall = runCLI(['skills', 'uninstall', '@alavida/value-copywriting'], { cwd: consumer.root });

      assert.equal(uninstall.exitCode, 0, uninstall.stderr);
      assert.match(uninstall.stdout, /Removed Skills: 2/);
      assert.match(uninstall.stdout, /@alavida\/value-copywriting/);
      assert.match(uninstall.stdout, /@alavida\/methodology-gary-provost/);

      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(consumer.root, '.claude', 'skills', 'gary-provost')), false);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'value-copywriting')), false);
      assert.equal(existsSync(join(consumer.root, '.agents', 'skills', 'gary-provost')), false);

      const state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));
      assert.deepEqual(state, { version: 1, installs: {} });
      assert.deepEqual(readMaterializationState(consumer.root)?.adapters, {
        claude: [],
        agents: [],
      });
    } finally {
      monorepo.cleanup();
      consumer.cleanup();
    }
  });
});
