import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInstalledMultiSkillFixture,
  createScenario,
  runCLI,
  runCLIJson,
  runNpm,
} from './fixtures.js';

describe('agentpack skills list', () => {
  it('discovers installed skill packages from nested workspace node_modules roots', () => {
    const fixture = createInstalledMultiSkillFixture('skills-list-nested-node-modules');
    const repo = createScenario({
      name: 'skills-list-nested-node-modules-consumer',
      files: {
        'workspace/active/agonda/.workbench': 'workbench: agonda\n',
      },
    });

    try {
      const workspaceRoot = join(repo.root, 'workspace', 'active', 'agonda');
      mkdirSync(workspaceRoot, { recursive: true });
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: workspaceRoot });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const result = runCLIJson(['skills', 'list'], { cwd: repo.root });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.json.packages.some((entry) => entry.packageName === '@alavida-ai/prd-development'), true);
      assert.equal(result.json.packages.some((entry) => entry.packageName === '@alavida-ai/foundation-primer'), true);
    } finally {
      fixture.cleanup();
      repo.cleanup();
    }
  });

  it('shows newer local package versions in skills list output and json', () => {
    const fixture = createInstalledMultiSkillFixture('skills-list-newer-version');
    const discovery = createScenario({
      name: 'skills-list-newer-version-discovery',
      packages: [
        {
          relPath: 'packages/prd-development',
          packageJson: {
            name: '@alavida-ai/prd-development',
            version: '0.2.0',
            files: ['SKILL.md', 'skills'],
            agentpack: {
              skills: {
                'proto-persona': { path: 'skills/proto-persona/SKILL.md' },
                'problem-statement': { path: 'skills/problem-statement/SKILL.md' },
              },
            },
            dependencies: {
              '@alavida-ai/foundation-primer': 'file:../foundation-primer',
            },
          },
          files: {
            'SKILL.md': `---
name: prd-development
description: Root workflow.
---

\`\`\`agentpack
\`\`\`
`,
            'skills/proto-persona/SKILL.md': `---
name: proto-persona
description: Proto persona.
---

\`\`\`agentpack
\`\`\`
`,
            'skills/problem-statement/SKILL.md': `---
name: problem-statement
description: Problem statement.
---

\`\`\`agentpack
\`\`\`
`,
          },
        },
      ],
    });

    try {
      const npmInstall = runNpm(['install', fixture.target, fixture.dependencyTarget], { cwd: fixture.consumer.root });
      assert.equal(npmInstall.exitCode, 0, npmInstall.stderr);

      const jsonResult = runCLIJson(['skills', 'list'], {
        cwd: fixture.consumer.root,
        env: {
          AGENTPACK_DISCOVERY_ROOT: discovery.root,
        },
      });
      assert.equal(jsonResult.exitCode, 0, jsonResult.stderr);
      const pkg = jsonResult.json.packages.find((entry) => entry.packageName === '@alavida-ai/prd-development');
      assert.equal(pkg.updateAvailable, true);
      assert.equal(pkg.availableVersion, '0.2.0');
      assert.equal(pkg.updateType, 'minor');

      const textResult = runCLI(['skills', 'list'], {
        cwd: fixture.consumer.root,
        env: {
          AGENTPACK_DISCOVERY_ROOT: discovery.root,
        },
      });
      assert.equal(textResult.exitCode, 0, textResult.stderr);
      assert.match(textResult.stdout, /newer version: 0\.2\.0/i);
    } finally {
      fixture.cleanup();
      discovery.cleanup();
    }
  });
});
