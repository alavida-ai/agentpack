import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addPackagedSkill, createTempRepo, runCLI, startCLI } from './fixtures.js';
import { startSkillDev } from '../../src/lib/skills.js';

async function waitUntil(predicate, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for condition');
}

describe('agentpack skills dev', () => {
  it('links a skill while running and unlinks it on exit', async () => {
    const repo = createTempRepo('skills-dev-basic');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires: []
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Linked Skill: value-copywriting/);
      await session.waitForOutput(/fresh session to pick up newly linked skills/);

      const claudePath = join(repo.root, '.claude', 'skills', 'value-copywriting');
      const agentsPath = join(repo.root, '.agents', 'skills', 'value-copywriting');
      assert.ok(existsSync(claudePath));
      assert.ok(existsSync(agentsPath));
      assert.ok(lstatSync(claudePath).isSymbolicLink());
      assert.ok(lstatSync(agentsPath).isSymbolicLink());

      await session.stop();
      await waitUntil(() => !existsSync(claudePath) && !existsSync(agentsPath));
      assert.equal(existsSync(claudePath), false);
      assert.equal(existsSync(agentsPath), false);
    } finally {
      repo.cleanup();
    }
  });

  it('unlinks the skill when the process receives SIGHUP', async () => {
    const repo = createTempRepo('skills-dev-sighup');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires: []
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Linked Skill: value-copywriting/);

      const claudePath = join(repo.root, '.claude', 'skills', 'value-copywriting');
      const agentsPath = join(repo.root, '.agents', 'skills', 'value-copywriting');
      assert.ok(existsSync(claudePath));
      assert.ok(existsSync(agentsPath));

      await session.stop('SIGHUP');
      await waitUntil(() => !existsSync(claudePath) && !existsSync(agentsPath));
      assert.equal(existsSync(claudePath), false);
      assert.equal(existsSync(agentsPath), false);
    } finally {
      repo.cleanup();
    }
  });

  it('links locally resolvable required skills for discovery and removes them on exit', async () => {
    const repo = createTempRepo('skills-dev-dependency-links');

    try {
      addPackagedSkill(repo.root, 'skills/methodology', {
        skillMd: `---
name: methodology-gary-provost
description: Method.
requires: []
---

# Method
`,
        packageJson: {
          name: '@alavida/methodology-gary-provost',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/methodology-gary-provost
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida/methodology-gary-provost': '^1.0.0',
          },
        },
      });

      const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Linked Skill: value-copywriting/);

      const rootLink = join(repo.root, '.claude', 'skills', 'value-copywriting');
      const depLink = join(repo.root, '.claude', 'skills', 'methodology-gary-provost');
      assert.ok(existsSync(rootLink));
      assert.ok(existsSync(depLink));
      assert.ok(lstatSync(depLink).isSymbolicLink());

      await session.stop();
      await waitUntil(() => !existsSync(rootLink) && !existsSync(depLink));
      assert.equal(existsSync(rootLink), false);
      assert.equal(existsSync(depLink), false);
      assert.equal(existsSync(join(repo.root, '.agents', 'skills', 'methodology-gary-provost')), false);
    } finally {
      repo.cleanup();
    }
  });

  it('syncs managed dependencies before linking and can reload on change', async () => {
    const repo = createTempRepo('skills-dev-sync');

    try {
      const skillDir = join(repo.root, 'skills', 'copywriting');
      const packagePath = join(skillDir, 'package.json');
      const skillPath = join(skillDir, 'SKILL.md');

      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/methodology-gary-provost
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {},
        },
      });

      const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Linked Skill: value-copywriting/);

      let pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '*');

      writeFileSync(
        skillPath,
        `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/new-dep
---

# Copy
`
      );

      await session.waitForOutput(/Reloaded Skill: value-copywriting/);
      pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      assert.equal(pkg.dependencies['@alavida/new-dep'], '*');
      assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], undefined);

      await session.stop();
    } finally {
      repo.cleanup();
    }
  });

  it('supports --no-sync without mutating package.json', async () => {
    const repo = createTempRepo('skills-dev-no-sync');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/new-dep
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {},
        },
      });

      const session = startCLI(['skills', 'dev', '--no-sync', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Linked Skill: value-copywriting/);

      const pkg = JSON.parse(readFileSync(join(repo.root, 'skills', 'copywriting', 'package.json'), 'utf-8'));
      assert.deepEqual(pkg.dependencies, {});

      await session.stop();
    } finally {
      repo.cleanup();
    }
  });

  it('returns the initial linked result to programmatic callers', () => {
    const repo = createTempRepo('skills-dev-initial-result');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires: []
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const session = startSkillDev('skills/copywriting', {
        cwd: repo.root,
        dashboard: false,
      });

      assert.equal(session.initialResult?.name, 'value-copywriting');
      assert.equal(session.initialResult?.workbench?.enabled, false);
      session.close();
    } finally {
      repo.cleanup();
    }
  });

  it('reports startup failures through the normal CLI error path', () => {
    const repo = createTempRepo('skills-dev-dashboard-startup-error');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires: []
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      const result = runCLI(['skills', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DASHBOARD_BUNDLE_PATH: join(repo.root, 'missing-dashboard.js'),
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /Skill workbench bundle is missing/i);
      assert.match(result.stderr, /Path: .*dashboard\.js/i);
      assert.doesNotMatch(result.stderr, /UnhandledPromiseRejection|uncaught/i);
    } finally {
      repo.cleanup();
    }
  });

  it('reports unresolved required skills that are neither local nor installed', async () => {
    const repo = createTempRepo('skills-dev-unresolved');

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
requires:
  - @alavida/missing-skill
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida/missing-skill': '^1.0.0',
          },
        },
      });

      const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
      await session.waitForOutput(/Unresolved Dependencies:/);

      assert.match(session.stdout, /@alavida\/missing-skill/);
      assert.match(session.stdout, /installed or available locally/i);

      await session.stop();
    } finally {
      repo.cleanup();
    }
  });

  it('fails clearly for invalid or missing manifests', () => {
    const repo = createTempRepo('skills-dev-invalid');

    try {
      mkdirSync(join(repo.root, 'skills', 'broken'), { recursive: true });
      writeFileSync(join(repo.root, 'skills', 'broken', 'SKILL.md'), '# No frontmatter\n');
      writeFileSync(join(repo.root, 'skills', 'broken', 'package.json'), '{"name":"test","version":"1.0.0"}\n');

      const broken = runCLI(['skills', 'dev', 'skills/broken'], { cwd: repo.root });
      assert.equal(broken.exitCode, 1);
      assert.match(broken.stderr, /error|frontmatter/i);

      mkdirSync(join(repo.root, 'skills', 'empty'), { recursive: true });
      const missingSkill = runCLI(['skills', 'dev', 'skills/empty'], { cwd: repo.root });
      assert.equal(missingSkill.exitCode, 1);
      assert.match(missingSkill.stderr, /SKILL\.md|not found/i);

      mkdirSync(join(repo.root, 'skills', 'no-pkg'), { recursive: true });
      writeFileSync(
        join(repo.root, 'skills', 'no-pkg', 'SKILL.md'),
        `---
name: no-pkg
description: Test.
requires: []
---

# No pkg
`
      );
      const missingPackage = runCLI(['skills', 'dev', 'skills/no-pkg'], { cwd: repo.root });
      assert.equal(missingPackage.exitCode, 1);
      assert.match(missingPackage.stderr, /package\.json|not found/i);
    } finally {
      repo.cleanup();
    }
  });
});
