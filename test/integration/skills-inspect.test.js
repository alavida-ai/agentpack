import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createScenario,
  runCLI,
  runCLIJson,
} from './fixtures.js';

function createSkillFixture() {
  return createScenario({
    name: 'skills-inspect',
    sources: {
      'domains/value/knowledge/selling-points.md': '# Selling Points\n',
      'domains/value/knowledge/tone-of-voice.md': '# Tone Of Voice\n',
    },
    packages: [
      {
        relPath: 'domains/value/skills/copywriting',
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.2.0',
          description: "Write copy aligned with Alavida's value messaging and tone.",
          files: ['SKILL.md'],
        },
        skillMd: `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
---

\`\`\`agentpack
source sellingPoints = "domains/value/knowledge/selling-points.md"
source toneOfVoice = "domains/value/knowledge/tone-of-voice.md"
\`\`\`

Ground this in [selling points](source:sellingPoints){context="primary source material for value messaging"}.
Apply [tone of voice](source:toneOfVoice){context="tone constraints for the final copy"}.
`,
      },
    ],
  });
}

describe('agentpack skills inspect', () => {
  it('inspects a packaged skill by directory path', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['author', 'inspect', 'domains/value/skills/copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: value-copywriting/);
      assert.match(result.stdout, /Package: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Version: 1\.2\.0/);
      assert.match(result.stdout, /Path: domains\/value\/skills\/copywriting\/SKILL\.md/);
      assert.match(result.stdout, /Sources:/);
      assert.match(result.stdout, /domains\/value\/knowledge\/selling-points\.md/);
      assert.match(result.stdout, /domains\/value\/knowledge\/tone-of-voice\.md/);
      assert.match(result.stdout, /Requires:\n- none/);
    } finally {
      repo.cleanup();
    }
  });

  it('inspects a packaged skill by package name', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['author', 'inspect', '@alavida/value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Package: @alavida\/value-copywriting/);
      assert.match(result.stdout, /Path: domains\/value\/skills\/copywriting\/SKILL\.md/);
    } finally {
      repo.cleanup();
    }
  });

  it('rejects legacy authored skills during inspect', () => {
    const repo = createSkillFixture();

    try {
      writeFileSync(
        join(repo.root, 'domains', 'value', 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
sources:
  - domains/value/knowledge/selling-points.md
---

# Value Copywriting
`
      );

      const result = runCLI(['author', 'inspect', '@alavida/value-copywriting'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /legacy skill\.md authoring is not supported|convert this skill to compiler-mode authoring/i);
    } finally {
      repo.cleanup();
    }
  });

  it('returns a not found error for an unknown skill target', () => {
    const repo = createSkillFixture();

    try {
      const result = runCLI(['author', 'inspect', '@alavida/unknown-skill'], { cwd: repo.root });

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, /Error: skill not found/i);
    } finally {
      repo.cleanup();
    }
  });

  it('inspects a multi-skill package by package name and lists exported skills', () => {
    const repo = createScenario({
      name: 'skills-inspect-multi-skill-package',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
          },
          files: {
            'SKILL.md': `---
name: planning-kit
description: Planning root workflow.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="primary entrypoint"}.
`,
            'skills/kickoff/SKILL.md': `---
name: planning-kit:kickoff
description: Plan the kickoff.
---

\`\`\`agentpack
source agenda = "domains/planning/knowledge/kickoff-agenda.md"
\`\`\`

Use [the kickoff agenda](source:agenda){context="source material for kickoff planning"}.
`,
            'skills/recap/SKILL.md': `---
name: planning-kit:recap
description: Plan the recap.
---

\`\`\`agentpack
source checklist = "domains/planning/knowledge/recap-checklist.md"
\`\`\`

Use [the recap checklist](source:checklist){context="source material for recap planning"}.
`,
          },
        },
      ],
      sources: {
        'domains/planning/knowledge/kickoff-agenda.md': '# Kickoff Agenda\n',
        'domains/planning/knowledge/recap-checklist.md': '# Recap Checklist\n',
      },
    });

    try {
      const result = runCLIJson(['author', 'inspect', '@alavida-ai/planning-kit'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.packageName, '@alavida-ai/planning-kit');
      assert.equal(result.json.kind, 'package');
      assert.deepEqual(
        result.json.exports.map((entry) => entry.name).sort(),
        ['planning-kit', 'planning-kit:kickoff', 'planning-kit:recap']
      );
    } finally {
      repo.cleanup();
    }
  });

  it('inspects a multi-skill package export by skill directory', () => {
    const repo = createScenario({
      name: 'skills-inspect-multi-skill-export-dir',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['SKILL.md', 'skills'],
            repository: {
              type: 'git',
              url: 'git+https://github.com/alavida-ai/agentpack.git',
            },
            publishConfig: {
              registry: 'https://npm.pkg.github.com',
            },
          },
          files: {
            'SKILL.md': `---
name: planning-kit
description: Planning root workflow.
---

\`\`\`agentpack
import kickoff from skill "@alavida-ai/planning-kit:kickoff"
\`\`\`

Use [kickoff](skill:kickoff){context="primary entrypoint"}.
`,
            'skills/kickoff/SKILL.md': `---
name: planning-kit:kickoff
description: Plan the kickoff.
---

\`\`\`agentpack
source agenda = "domains/planning/knowledge/kickoff-agenda.md"
\`\`\`

Use [the kickoff agenda](source:agenda){context="source material for kickoff planning"}.
`,
            'skills/recap/SKILL.md': `---
name: planning-kit:recap
description: Plan the recap.
---

\`\`\`agentpack
source checklist = "domains/planning/knowledge/recap-checklist.md"
\`\`\`

Use [the recap checklist](source:checklist){context="source material for recap planning"}.
`,
          },
        },
      ],
      sources: {
        'domains/planning/knowledge/kickoff-agenda.md': '# Kickoff Agenda\n',
        'domains/planning/knowledge/recap-checklist.md': '# Recap Checklist\n',
      },
    });

    try {
      const result = runCLI(['author', 'inspect', 'workbenches/planning-kit/skills/kickoff'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /Skill: planning-kit:kickoff/);
      assert.match(result.stdout, /Package: @alavida-ai\/planning-kit/);
      assert.match(result.stdout, /Path: workbenches\/planning-kit\/skills\/kickoff\/SKILL\.md/);
    } finally {
      repo.cleanup();
    }
  });

  it('fails inspect when a module name does not match the package:module convention', () => {
    const repo = createScenario({
      name: 'skills-inspect-invalid-module-name',
      packages: [
        {
          relPath: 'workbenches/planning-kit',
          packageJson: {
            name: '@alavida-ai/planning-kit',
            version: '0.1.0',
            files: ['skills'],
            agentpack: {
              root: 'skills',
            },
          },
          files: {
            'skills/kickoff/SKILL.md': `---
name: kickoff
description: Plan the kickoff.
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
      const result = runCLI(['author', 'inspect', 'workbenches/planning-kit/skills/kickoff'], { cwd: repo.root });

      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /planning-kit:kickoff/);
    } finally {
      repo.cleanup();
    }
  });

  it('inspects a compiler-mode skill from compiled state', () => {
    const repo = createScenario({
      name: 'skills-inspect-compiler-mode',
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
Use [the proto persona workflow](skill:persona){context="for shaping the target user profile before drafting the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
        },
      ],
    });

    try {
      const result = runCLIJson(['author', 'inspect', 'skills/prd-agent'], { cwd: repo.root });

      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(result.json.kind, 'export');
      assert.equal(result.json.name, 'prd-agent');
      assert.equal(result.json.packageName, '@alavida/prd-agent');
      assert.equal(result.json.packageVersion, '1.0.0');
      assert.equal(result.json.skillFile, 'skills/prd-agent/SKILL.md');
      assert.deepEqual(result.json.sources, ['domains/product/knowledge/prd-principles.md']);
      assert.deepEqual(result.json.requires, ['@alavida/prd-development', '@alavida/prd-development:proto-persona']);
    } finally {
      repo.cleanup();
    }
  });
});
