import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createScenario,
  createTempRepo,
  createValidateFixture,
  runCLI,
  runCLIJson,
} from './fixtures.js';

describe('agentpack skills validate', () => {
  it('validates one packaged skill successfully', () => {
    const repo = createValidateFixture();

    try {
      const result = runCLI(['publish', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Status: valid/);
      assert.match(result.stdout, /Issues: 0/);
      assert.match(result.stdout, /Next Steps:/);
      assert.match(result.stdout, /npm version patch/);
      assert.match(result.stdout, /npm publish/);
    } finally {
      repo.cleanup();
    }
  });

  it('resolves relative sub-skill targets from the current working directory', () => {
    const repo = createScenario({
      name: 'skills-validate-relative-target',
      sources: {
        'domains/platform/knowledge/cross-domain-integration.md': '# Cross domain\n',
      },
      packages: [
        {
          relPath: 'domains/platform/skills/monorepo-architecture',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/knowledge-base.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: monorepo-architecture
description: Root.
---

\`\`\`agentpack
import integration from skill "@alavida/monorepo-architecture:cross-domain-integration"
\`\`\`

Use [integration](skill:integration){context="package entrypoint"}.
`,
            'skills/cross-domain-integration/SKILL.md': `---
name: monorepo-architecture:cross-domain-integration
description: Cross-domain integration.
---

\`\`\`agentpack
source integration = "domains/platform/knowledge/cross-domain-integration.md"
\`\`\`

Use [integration](source:integration){context="source material"}.
`,
          },
        },
      ],
    });

    try {
      const result = runCLI(
        ['publish', 'validate', 'skills/cross-domain-integration'],
        { cwd: join(repo.root, 'domains', 'platform', 'skills', 'monorepo-architecture') }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: @alavida\/monorepo-architecture/);
      assert.match(result.stdout, /Status: valid/);
    } finally {
      repo.cleanup();
    }
  });

  it('returns structured release guidance for a valid packaged skill', () => {
    const repo = createValidateFixture();

    try {
      const result = runCLIJson(
        ['publish', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.valid, true);
      assert.equal(result.json.nextSteps[0].command, 'npm version patch');
      assert.equal(result.json.nextSteps[1].command, 'npm publish');
    } finally {
      repo.cleanup();
    }
  });

  it('shows issue detail for each invalid skill when validating a multi-skill package target', () => {
    const repo = createScenario({
      name: 'skills-validate-package-issues',
      packages: [
        {
          relPath: 'skills/monorepo-architecture',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '0.1.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://example.com/npm',
            },
            files: ['SKILL.md'],
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
import overview from skill "@alavida/monorepo-architecture:monorepo-overview"
\`\`\`

Use [overview](skill:overview){context="package entrypoint"}.
`,
            'skills/monorepo-overview/SKILL.md': `---
name: monorepo-architecture:monorepo-overview
description: Overview workflow.
---

\`\`\`agentpack
\`\`\`

# Overview
`,
          },
        },
      ],
    });

    try {
      const result = runCLI(['publish', 'validate', 'skills/monorepo-architecture'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stdout, /monorepo-overview/);
      assert.match(result.stdout, /Validation Issues:/);
      assert.match(result.stdout, /skill_not_published/);
    } finally {
      repo.cleanup();
    }
  });

  it('validates all authored compiler-mode skills in a repo without writing build-state', () => {
    const repo = createScenario({
      name: 'skills-validate-all-compiler-mode',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
        'domains/product/knowledge/research-principles.md': '# Research\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/prd-development': '^1.0.0',
            },
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
        },
        {
          relPath: 'skills/research-agent',
          packageJson: {
            name: '@alavida/research-agent',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/prd-development': '^1.0.0',
            },
          },
          skillMd: `---
name: research-agent
description: Perform research.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/research-principles.md"
\`\`\`

Ground this in [research principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLI(['publish', 'validate'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Validated Skills: 2/);
      assert.match(result.stdout, /Valid Skills: 2/);
      assert.match(result.stdout, /Invalid Skills: 0/);
      assert.equal(existsSync(join(repo.root, '.agentpack', 'build-state.json')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('flags legacy authored skills during no-target validate', () => {
    const repo = createScenario({
      name: 'skills-validate-mixed-authoring',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
        'domains/value/knowledge/selling-points.md': '# Selling Points\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/prd-development': '^1.0.0',
            },
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
        },
        {
          relPath: 'skills/value-copywriting',
          packageJson: {
            name: '@alavida/value-copywriting',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
          },
          skillMd: `---
name: value-copywriting
description: Legacy authored copywriting skill.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
requires: []
---

# Value Copywriting
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.count, 2);
      assert.equal(result.json.invalidCount, 1);
      assert.equal(
        result.json.skills.find((skill) => skill.packageName === '@alavida/value-copywriting').issues[0].code,
        'legacy_authoring_not_supported'
      );
    } finally {
      repo.cleanup();
    }
  });

  it('fails when a declared source file does not exist', () => {
    const repo = createValidateFixture();

    try {
      rmSync(join(repo.root, 'domains', 'value', 'knowledge', 'selling-points.md'));

      const result = runCLI(['publish', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stdout, /Status: invalid/);
      assert.match(result.stdout, /bound_source_not_found/);
      assert.match(result.stdout, /domains\/value\/knowledge\/selling-points\.md/);
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
        ['publish', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'missing_repository');
    } finally {
      repo.cleanup();
    }
  });

  it('does not enforce a specific publish registry', () => {
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
              registry: 'https://example.com/custom-registry',
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
        ['publish', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.valid, true);
    } finally {
      repo.cleanup();
    }
  });

  it('treats trailing-slash directories in package.json files as published skill paths', () => {
    const repo = createScenario({
      name: 'skills-validate-files-trailing-slash',
      packages: [
        {
          relPath: 'skills/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md', 'skills/'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: planning-kit
description: Planning kit.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="package root"}.
`,
            'skills/kickoff/SKILL.md': `---
name: planning-kit:kickoff
description: Kickoff.
---

\`\`\`agentpack
\`\`\`

# Kickoff
`,
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate', 'skills/planning-kit/skills/kickoff'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.valid, true);
      assert.equal(result.json.issues.length, 0);
    } finally {
      repo.cleanup();
    }
  });

  it('flags a missing root SKILL.md when package.json files declares it', () => {
    const repo = createScenario({
      name: 'skills-validate-missing-root-skill',
      packages: [
        {
          relPath: 'skills/monorepo-architecture',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '0.1.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'skills/monorepo-overview/SKILL.md': `---
name: monorepo-architecture:monorepo-overview
description: Overview workflow.
---

\`\`\`agentpack
\`\`\`

# Overview
`,
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate', 'skills/monorepo-architecture'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'package_invalid');
      assert.match(JSON.stringify(result.json), /missing_root_skill_file/);
    } finally {
      repo.cleanup();
    }
  });

  it('fails validation when a module frontmatter name does not match the package:module convention', () => {
    const repo = createScenario({
      name: 'skills-validate-invalid-module-name',
      packages: [
        {
          relPath: 'skills/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: planning-kit
description: Planning kit.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="entrypoint"}.
`,
            'skills/kickoff/SKILL.md': `---
name: kickoff
description: Kickoff.
---

\`\`\`agentpack
\`\`\`

# Kickoff
`,
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate', 'skills/planning-kit/skills/kickoff'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'invalid_skill_name');
      assert.match(result.json.issues[0].message, /planning-kit:kickoff/);
    } finally {
      repo.cleanup();
    }
  });

  it('reports invalid dependency keys before npm publish', () => {
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
            dependencies: {
              '@alavida/value-copywriting:monorepo-overview': '*',
            },
          },
          null,
          2
        ) + '\n'
      );

      const result = runCLIJson(
        ['publish', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'invalid_dependency_name');
      assert.equal(result.json.issues[0].dependency, '@alavida/value-copywriting:monorepo-overview');
    } finally {
      repo.cleanup();
    }
  });

  it('rejects legacy target authoring without an agentpack declaration block', () => {
    const repo = createTempRepo('skills-validate-legacy-authoring');

    try {
      mkdirSync(join(repo.root, 'domains', 'value', 'knowledge'), { recursive: true });
      mkdirSync(join(repo.root, 'domains', 'value', 'skills', 'copywriting'), { recursive: true });
      writeFileSync(join(repo.root, 'domains', 'value', 'knowledge', 'selling-points.md'), '# Selling Points\n');
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
requires: []
---

# Value Copywriting
`
      );
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
        ['publish', 'validate', 'domains/value/skills/copywriting'],
        { cwd: repo.root }
      );

      assert.equal(result.exitCode, 2);
      assert.equal(result.json.valid, false);
      assert.equal(result.json.issues[0].code, 'legacy_authoring_not_supported');
    } finally {
      repo.cleanup();
    }
  });

  it('validates a compiler-mode skill into compiled state without writing build-state', () => {
    const repo = createScenario({
      name: 'skills-validate-compiler-mode',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/prd-development': '^1.0.0',
            },
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate', 'skills/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.valid, true);
      assert.equal(result.json.packageName, '@alavida/prd-agent');
      assert.equal(result.json.skillFile, 'skills/prd-agent/SKILL.md');
      assert.equal(existsSync(join(repo.root, '.agentpack', 'compiled.json')), true);
      assert.equal(existsSync(join(repo.root, '.agentpack', 'build-state.json')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('accepts a no-import named skill in a multi-skill package without an empty agentpack block', () => {
    const repo = createScenario({
      name: 'skills-validate-no-import-modern-skill',
      packages: [
        {
          relPath: 'skills/planning-kit',
          packageJson: {
            name: '@alavida/planning-kit',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md', 'skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'SKILL.md': `---
name: planning-kit
description: Planning kit.
---

\`\`\`agentpack
import kickoff from skill "@alavida/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="package entrypoint"}.
`,
            'skills/kickoff/SKILL.md': `---
name: planning-kit:kickoff
description: Kickoff workflow.
---

# Kickoff
`,
          },
        },
      ],
    });

    try {
      const result = runCLIJson(['publish', 'validate', 'skills/planning-kit'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.valid, true);
      assert.equal(
        result.json.skills.find((skill) => skill.name === 'planning-kit:kickoff').valid,
        true
      );
    } finally {
      repo.cleanup();
    }
  });

  it('shows verbose validation details for sources, hashes, and dependency alignment', () => {
    const repo = createScenario({
      name: 'skills-validate-verbose',
      sources: {
        'domains/product/knowledge/prd-principles.md': '# Principles\n',
      },
      packages: [
        {
          relPath: 'skills/prd-agent',
          packageJson: {
            name: '@alavida/prd-agent',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
            files: ['SKILL.md'],
            dependencies: {
              '@alavida/prd-development': '^1.0.0',
            },
          },
          skillMd: `---
name: prd-agent
description: Create strong PRDs.
---

\`\`\`agentpack
import prd from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLI(['--verbose', 'publish', 'validate', 'skills/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Verbose Details:/);
      assert.match(result.stdout, /Resolved Source Paths:/);
      assert.match(result.stdout, /domains\/product\/knowledge\/prd-principles\.md/);
      assert.match(result.stdout, /Hash Comparisons:/);
      assert.match(result.stdout, /previous: none/i);
      assert.match(result.stdout, /Dependency Alignment:/);
      assert.match(result.stdout, /@alavida\/prd-development/);
      assert.match(result.stdout, /declared/i);
    } finally {
      repo.cleanup();
    }
  });
});
