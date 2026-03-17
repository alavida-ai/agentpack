import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, runCLI, runCLIJson } from './fixtures.js';

function validRootSkillDocument() {
  return `---
name: monorepo-architecture
description: Primary package entry point for the monorepo architecture.
---

\`\`\`agentpack
import onboarding from skill "@alavida/monorepo-architecture:monorepo-onboarding"
\`\`\`

Use [onboarding](skill:onboarding){context="entrypoint routes to the onboarding workflow"}.
`;
}

function validNamedSkillDocument(name, sourcePath) {
  return `---
name: ${name}
description: ${name} workflow.
---

\`\`\`agentpack
source architecture = "${sourcePath}"
\`\`\`

Use [architecture](source:architecture){context="source material for ${name}"}.
`;
}

function createCompilerFirstRepo(name = 'compiler-first-authored-workspace') {
  return createScenario({
    name,
    packages: [
      {
        relPath: 'workspace/active/architecture/agonda-monorepo',
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
          'SKILL.md': validRootSkillDocument(),
          'skills/monorepo-overview/SKILL.md': validNamedSkillDocument(
            'monorepo-architecture:monorepo-overview',
            'workspace/active/architecture/agonda-monorepo/CONTINUE.md'
          ),
          'skills/monorepo-onboarding/SKILL.md': validNamedSkillDocument(
            'monorepo-architecture:monorepo-onboarding',
            'workspace/active/architecture/agonda-monorepo/CONTINUE.md'
          ),
          'skills/broken-skill/SKILL.md': `---
name: broken-skill
description: Broken sub-skill.
---

\`\`\`agentpack
source architecture from "workspace/active/architecture/agonda-monorepo/CONTINUE.md"
\`\`\`
`,
        },
      },
    ],
    sources: {
      'workspace/active/architecture/agonda-monorepo/CONTINUE.md': '# Architecture\n',
    },
  });
}

describe('compiler-first authored workspace', () => {
  it('surfaces package-invalid when inspecting a package root with an invalid sibling export', () => {
    const repo = createCompilerFirstRepo('compiler-first-package-root-inspect');

    try {
      const result = runCLIJson(['author', 'inspect', 'workspace/active/architecture/agonda-monorepo'], { cwd: repo.root });

      assert.equal(result.exitCode, 2, result.stderr);
      assert.equal(result.json.error, 'package_invalid');
      assert.equal(result.json.details.packageName, '@alavida/monorepo-architecture');
      assert.match(JSON.stringify(result.json), /broken-skill/);
    } finally {
      repo.cleanup();
    }
  });

  it('validates the entire package root and reports package-invalid plus invalid exports explicitly', () => {
    const repo = createCompilerFirstRepo('compiler-first-package-root-validate');

    try {
      const result = runCLIJson(['publish', 'validate', 'workspace/active/architecture/agonda-monorepo'], { cwd: repo.root });

      assert.equal(result.exitCode, 2, result.stderr || result.stdout);
      assert.equal(result.json.count, 4);
      assert.equal(result.json.invalidCount, 4);
      assert.match(JSON.stringify(result.json), /broken-skill/);
      assert.match(JSON.stringify(result.json), /package_invalid/);
      assert.match(JSON.stringify(result.json), /invalid_agentpack_declaration/);
    } finally {
      repo.cleanup();
    }
  });

  it('surfaces package-invalid for canonical export inspection when the package has an invalid sibling export', () => {
    const repo = createCompilerFirstRepo('compiler-first-canonical-id');

    try {
      const result = runCLIJson(['author', 'inspect', '@alavida/monorepo-architecture:monorepo-overview'], { cwd: repo.root });

      assert.equal(result.exitCode, 2, result.stderr);
      assert.equal(result.json.error, 'package_invalid');
      assert.match(JSON.stringify(result.json), /broken-skill/);
    } finally {
      repo.cleanup();
    }
  });

  it('surfaces typed diagnostics and nextSteps for an invalid export target', () => {
    const repo = createCompilerFirstRepo('compiler-first-invalid-export');

    try {
      const result = runCLIJson(['author', 'inspect', '@alavida/monorepo-architecture:broken-skill'], { cwd: repo.root });

      assert.equal(result.exitCode, 2, result.stderr || result.stdout);
      assert.equal(result.json.error, 'export_invalid');
      assert.match(JSON.stringify(result.json), /invalid_agentpack_declaration/);
      assert.ok(Array.isArray(result.json.nextSteps));
      assert.equal(result.json.nextSteps[0].action, 'edit_file');
    } finally {
      repo.cleanup();
    }
  });

  it('fails dev for an invalid named export with compiler diagnostics', () => {
    const repo = createCompilerFirstRepo('compiler-first-dev-invalid-export');

    try {
      const result = runCLIJson(['author', 'dev', 'workspace/active/architecture/agonda-monorepo/skills/broken-skill', '--no-dashboard'], { cwd: repo.root });

      assert.equal(result.exitCode, 2, result.stderr || result.stdout);
      assert.equal(result.json.error, 'export_invalid');
      assert.match(JSON.stringify(result.json), /invalid_agentpack_declaration/);
    } finally {
      repo.cleanup();
    }
  });

  it('surfaces a package-invalid error for unsupported agentpack.skills export tables', () => {
    const repo = createScenario({
      name: 'compiler-first-legacy-export-table',
      packages: [
        {
          relPath: 'workspace/active/architecture/agonda-monorepo',
          packageJson: {
            name: '@alavida/monorepo-architecture',
            version: '0.1.0',
            files: ['skills'],
            agentpack: {
              skills: {
                'monorepo-overview': { path: 'skills/monorepo-overview/SKILL.md' },
              },
            },
          },
          files: {
            'skills/monorepo-overview/SKILL.md': validNamedSkillDocument(
              'monorepo-overview',
              'workspace/active/architecture/agonda-monorepo/CONTINUE.md'
            ),
          },
        },
      ],
      sources: {
        'workspace/active/architecture/agonda-monorepo/CONTINUE.md': '# Architecture\n',
      },
    });

    try {
      const inspect = runCLIJson(['author', 'inspect', 'workspace/active/architecture/agonda-monorepo'], { cwd: repo.root });
      assert.equal(inspect.exitCode, 2, inspect.stderr || inspect.stdout);
      assert.equal(inspect.json.error, 'package_invalid');
      assert.match(JSON.stringify(inspect.json), /legacy_export_table_not_supported/);

      const validate = runCLIJson(['publish', 'validate', 'workspace/active/architecture/agonda-monorepo'], { cwd: repo.root });
      assert.equal(validate.exitCode, 2, validate.stderr || validate.stdout);
      assert.equal(validate.json.valid, false);
      assert.match(JSON.stringify(validate.json), /legacy_export_table_not_supported/);
    } finally {
      repo.cleanup();
    }
  });
});
