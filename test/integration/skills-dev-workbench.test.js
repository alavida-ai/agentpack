import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addPackagedSkill, createTempRepo, startCLI } from './fixtures.js';
import { hashFile } from '../../src/domain/skills/skill-provenance.js';

function extractWorkbenchUrl(output) {
  const match = output.match(/Workbench URL: (http:\/\/127\.0\.0\.1:\d+)/);
  return match ? match[1] : null;
}

async function waitUntil(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for condition');
}

describe('agentpack skills dev workbench', () => {
  it('starts a workbench server by default during skills dev', async () => {
    const repo = createTempRepo('skills-dev-workbench-default');
    let session;

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

      session = startCLI(['skills', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });

  it('skips workbench startup with --no-dashboard', async () => {
    const repo = createTempRepo('skills-dev-workbench-no-dashboard');
    let session;

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

      session = startCLI(['skills', 'dev', '--no-dashboard', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      await session.waitForOutput(/Linked Skill: value-copywriting/);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.doesNotMatch(session.stdout + session.stderr, /Workbench URL:/);
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });

  it('serves the dashboard shell and the current workbench model', async () => {
    const repo = createTempRepo('skills-dev-workbench-server-contract');
    let session;

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
metadata:
  sources:
    - domains/value/knowledge/tone-of-voice.md
requires:
  - @alavida/research
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
      });

      session = startCLI(['skills', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);
      assert.ok(workbenchUrl);

      const html = await fetch(workbenchUrl).then((response) => response.text());
      assert.match(html, /Skill Dev Workbench/i);
      assert.match(html, /data-app-root/i);
      assert.match(html, /\/assets\/dashboard\.js/);

      const asset = await fetch(`${workbenchUrl}/assets/dashboard.js`).then((response) => response.text());
      assert.match(asset, /Skill Dev Workbench/);

      const model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
      assert.equal(model.selected.packageName, '@alavida/value-copywriting');
      assert.equal(model.edges.length, 2);
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });

  it('refreshes the workbench model when a selected source changes', async () => {
    const repo = createTempRepo('skills-dev-workbench-watch');
    let session;

    try {
      mkdirSync(join(repo.root, 'domains', 'value', 'knowledge'), { recursive: true });
      writeFileSync(join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'), '# Voice\n');
      mkdirSync(join(repo.root, '.agentpack'), { recursive: true });

      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
metadata:
  sources:
    - domains/value/knowledge/tone-of-voice.md
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

      writeFileSync(
        join(repo.root, '.agentpack', 'build-state.json'),
        JSON.stringify(
          {
            version: 1,
            skills: {
              '@alavida/value-copywriting': {
                package_version: '1.0.0',
                skill_path: 'skills/copywriting',
                skill_file: 'skills/copywriting/SKILL.md',
                sources: {
                  'domains/value/knowledge/tone-of-voice.md': {
                    hash: hashFile(join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md')),
                  },
                },
                requires: [],
              },
            },
          },
          null,
          2
        ) + '\n'
      );

      session = startCLI(['skills', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);

      let model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
      assert.equal(model.selected.status, 'current');

      writeFileSync(join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'), '# Voice changed\n');

      await waitUntil(async () => {
        model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
        return model.selected.status === 'stale';
      });

      assert.equal(model.selected.status, 'stale');
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });

  it('runs validate-skill through a workbench action endpoint', async () => {
    const repo = createTempRepo('skills-dev-workbench-action');
    let session;

    try {
      addPackagedSkill(repo.root, 'skills/copywriting', {
        skillMd: `---
name: value-copywriting
description: Copy.
metadata:
  sources: []
requires: []
---

# Copy
`,
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          repository: {
            type: 'git',
            url: 'git+https://github.com/alavida/knowledge-base.git',
          },
          publishConfig: {
            registry: 'https://npm.pkg.github.com',
          },
          files: ['SKILL.md'],
        },
      });

      session = startCLI(['skills', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);

      const payload = await fetch(`${workbenchUrl}/api/actions/validate-skill`, {
        method: 'POST',
      }).then((response) => response.json());

      assert.equal(payload.action, 'validate-skill');
      assert.equal(payload.ok, true);
      assert.equal(payload.result.valid, true);
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });
});
