import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, runCLI, runCLIJson } from './fixtures.js';

describe('agentpack skills stale', () => {
  it('fails clearly when compiled state has not been built yet', () => {
    const repo = createScenario({
      name: 'skills-stale-missing-compiled',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 4);
      assert.equal(result.json.error, 'compiled_state_not_found');
      assert.match(result.json.message, /compiled state not found/i);
    } finally {
      repo.cleanup();
    }
  });

  it('reports no stale skills when compiled sources still match', () => {
    const repo = createScenario({
      name: 'skills-stale-current',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const buildResult = runCLIJson(['skills', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(buildResult.exitCode, 0, buildResult.stderr || buildResult.stdout);

      const result = runCLI(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Stale Skills: 0/);
    } finally {
      repo.cleanup();
    }
  });

  it('reports stale compiler-mode skills from compiled state', () => {
    const repo = createScenario({
      name: 'skills-stale-compiled-state',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const buildResult = runCLIJson(['skills', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(buildResult.exitCode, 0, buildResult.stderr || buildResult.stdout);

      writeFileSync(
        join(repo.root, 'domains', 'product', 'knowledge', 'prd-principles.md'),
        '# Principles\n\nUpdated.\n'
      );

      const result = runCLI(['skills', 'stale'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Stale Skills: 1/);
      assert.match(result.stdout, /@alavida\/prd-agent/);
      assert.match(result.stdout, /changed_sources: 1/);
    } finally {
      repo.cleanup();
    }
  });

  it('shows hash details for compiler-mode skills from compiled state', () => {
    const repo = createScenario({
      name: 'skills-stale-compiled-state-detail',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            files: ['SKILL.md'],
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const buildResult = runCLIJson(['skills', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(buildResult.exitCode, 0, buildResult.stderr || buildResult.stdout);

      writeFileSync(
        join(repo.root, 'domains', 'product', 'knowledge', 'prd-principles.md'),
        '# Principles\n\nUpdated.\n'
      );

      const result = runCLI(['skills', 'stale', '@alavida/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/prd-agent/);
      assert.match(result.stdout, /domains\/product\/knowledge\/prd-principles\.md/);
      assert.match(result.stdout, /Recorded: sha256:/);
      assert.match(result.stdout, /Current: sha256:/);
    } finally {
      repo.cleanup();
    }
  });
});
