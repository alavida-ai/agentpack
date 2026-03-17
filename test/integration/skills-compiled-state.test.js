import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, readCompiledState, runCLIJson } from './fixtures.js';

describe('agentpack compiled state', () => {
  it('builds compiled state deterministically for the same compiler-mode skill', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-deterministic',
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
      let result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      const first = readCompiledState(repo.root);

      result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      const second = readCompiledState(repo.root);

      delete first.generated_at;
      delete second.generated_at;
      delete first.packages['@alavida/prd-agent'].generated_at;
      delete second.packages['@alavida/prd-agent'].generated_at;

      assert.deepEqual(second, first);
    } finally {
      repo.cleanup();
    }
  });

  it('captures named skill imports, source bindings, and contextual edges in compiled state', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-shape',
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
import prd, { proto-persona as persona } from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Use [the proto persona workflow](skill:persona){context="for shaping the target user profile"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const compiled = readCompiledState(repo.root);
      const packageState = compiled.packages['@alavida/prd-agent'];
      assert.equal(packageState.skills[0].packageName, '@alavida/prd-agent');
      assert.deepEqual(
        packageState.skills[0].skillImports.map((entry) => entry.target).sort(),
        ['@alavida/prd-development', '@alavida/prd-development:proto-persona']
      );
      assert.deepEqual(
        packageState.skills[0].sourceBindings.map((entry) => entry.sourcePath),
        ['domains/product/knowledge/prd-principles.md']
      );
      assert.deepEqual(
        packageState.edges.map((edge) => ({ kind: edge.kind, target: edge.target, occurrenceCount: edge.occurrenceCount })),
        [
          {
            kind: 'skill_usage',
            target: '@alavida/prd-development',
            occurrenceCount: 1,
          },
          {
            kind: 'skill_usage',
            target: '@alavida/prd-development:proto-persona',
            occurrenceCount: 1,
          },
          {
            kind: 'source_usage',
            target: 'domains/product/knowledge/prd-principles.md',
            occurrenceCount: 1,
          },
        ]
      );
    } finally {
      repo.cleanup();
    }
  });

  it('stores compiled package state under the package key instead of one flat top-level graph', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-package-index',
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
      const result = runCLIJson(['author', 'build', 'skills/prd-agent'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const compiled = readCompiledState(repo.root);
      assert.equal(compiled.version, 2);
      assert.equal(compiled.active_package, '@alavida/prd-agent');
      assert.deepEqual(Object.keys(compiled.packages), ['@alavida/prd-agent']);
      assert.equal(compiled.root_skill, undefined);
      assert.equal(compiled.skills, undefined);
      assert.equal(compiled.sourceFiles, undefined);
      assert.equal(compiled.occurrences, undefined);
      assert.equal(compiled.edges, undefined);
    } finally {
      repo.cleanup();
    }
  });

  it('captures all exports and source bindings for a multi-skill package', () => {
    const repo = createScenario({
      name: 'skills-compiled-state-multi-skill-package',
      sources: {
        'domains/platform/knowledge/thesis.md': '# Thesis\n',
        'domains/platform/knowledge/overview.md': '# Overview\n',
      },
      packages: [
        {
          relPath: 'skills/monorepo-architecture',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '1.0.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: monorepo-architecture
description: Root architecture workflow.
---

\`\`\`agentpack
import overview from skill "@alavida/monorepo-architecture:overview"
source thesis = "domains/platform/knowledge/thesis.md"
\`\`\`

Use [overview](skill:overview){context="package entrypoint"}.
Ground this in [thesis](source:thesis){context="root thesis"}.
`,
            'skills/overview/SKILL.md': `---
name: monorepo-architecture:overview
description: Overview workflow.
---

\`\`\`agentpack
source overviewDoc = "domains/platform/knowledge/overview.md"
\`\`\`

Ground this in [overview doc](source:overviewDoc){context="overview source"}.
`,
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'build', 'skills/monorepo-architecture'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);

      const compiled = readCompiledState(repo.root);
      const packageState = compiled.packages['@alavida/monorepo-architecture'];

      assert.equal(packageState.skills.length, 2);
      assert.deepEqual(
        packageState.skills.map((entry) => entry.skillFile).sort(),
        [
          'skills/monorepo-architecture/SKILL.md',
          'skills/monorepo-architecture/skills/overview/SKILL.md',
        ]
      );
      assert.deepEqual(
        packageState.sourceFiles.map((entry) => entry.path).sort(),
        [
          'domains/platform/knowledge/overview.md',
          'domains/platform/knowledge/thesis.md',
        ]
      );
      assert.deepEqual(
        packageState.occurrences.map((entry) => entry.source).sort(),
        [
          '@alavida/monorepo-architecture',
          '@alavida/monorepo-architecture',
          '@alavida/monorepo-architecture:overview',
        ]
      );
    } finally {
      repo.cleanup();
    }
  });
});
