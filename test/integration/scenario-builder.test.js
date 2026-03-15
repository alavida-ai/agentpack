import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertGraphEdge,
  createScenario,
  readCompiledState,
  readMaterializationState,
} from './scenario-builder.js';

describe('scenario builder', () => {
  it('creates a compiler-first repo with sources, package manifests, and runtime dirs', () => {
    const repo = createScenario({
      name: 'scenario-builder-basic',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      files: {
        '.agentpack/compiled.json': '{"version":1}\n',
      },
      packages: [
        {
          relPath: 'packages/prd-development',
          packageJson: {
            name: '@alavida/prd-development',
            version: '0.1.0',
            agentpack: {
              primarySkill: 'prd-development',
              skills: {
                'prd-development': { path: 'skills/prd-development/SKILL.md' },
                'proto-persona': { path: 'skills/proto-persona/SKILL.md' },
              },
            },
          },
          skills: [
            {
              path: 'skills/prd-development',
              skillMd: '# PRD Development\n',
            },
            {
              path: 'skills/proto-persona',
              skillMd: '# Proto Persona\n',
            },
          ],
        },
      ],
    });

    try {
      assert.equal(existsSync(join(repo.root, '.agentpack')), true);
      assert.equal(existsSync(join(repo.root, '.claude', 'skills')), true);
      assert.equal(existsSync(join(repo.root, '.agents', 'skills')), true);
      assert.equal(existsSync(join(repo.root, 'domains', 'product', 'knowledge', 'prd-principles.md')), true);
      assert.equal(existsSync(join(repo.root, '.agentpack', 'compiled.json')), true);
      assert.equal(existsSync(join(repo.root, 'packages', 'prd-development', 'package.json')), true);
      assert.equal(existsSync(join(repo.root, 'packages', 'prd-development', 'skills', 'proto-persona', 'SKILL.md')), true);
    } finally {
      repo.cleanup();
    }
  });

  it('reads compiled and materialization state files when present', () => {
    const repo = createScenario({ name: 'scenario-builder-state' });

    try {
      writeFileSync(
        join(repo.root, '.agentpack', 'compiled.json'),
        JSON.stringify({
          version: 1,
          edges: [{ source: 'skill:prd', target: 'source:principles', kind: 'source_usage' }],
        }, null, 2) + '\n'
      );
      writeFileSync(
        join(repo.root, '.agentpack', 'materialization-state.json'),
        JSON.stringify({
          adapters: {
            claude: [{ target: '.claude/skills/prd' }],
          },
        }, null, 2) + '\n'
      );

      const compiled = readCompiledState(repo.root);
      const materialization = readMaterializationState(repo.root);

      assert.equal(compiled.version, 1);
      assert.equal(materialization.adapters.claude[0].target, '.claude/skills/prd');
      assertGraphEdge(compiled, {
        source: 'skill:prd',
        target: 'source:principles',
        kind: 'source_usage',
      });
    } finally {
      repo.cleanup();
    }
  });
});
