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
      const result = runCLI(['skills', 'validate'], { cwd: repo.root });

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
      const result = runCLIJson(['skills', 'validate'], { cwd: repo.root });

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

      const result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root });

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
        ['skills', 'validate', 'domains/value/skills/copywriting'],
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
      const result = runCLIJson(['skills', 'validate', 'skills/prd-agent'], { cwd: repo.root });

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
});
