import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, startCLI } from './fixtures.js';

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

function createWorkbenchScenario({
  name,
  sources = {},
  files = {},
  skillMd = `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
\`\`\`

# Copy
`,
  packageJson = {
    name: '@alavida/value-copywriting',
    version: '1.0.0',
    files: ['SKILL.md'],
  },
  extraPackages = [],
} = {}) {
  return createScenario({
    name,
    sources,
    files,
    packages: [
      {
        relPath: 'skills/copywriting',
        packageJson,
        skillMd,
      },
      ...extraPackages,
    ],
  });
}

describe('agentpack skills dev workbench', () => {
  it('starts a workbench server by default during skills dev', async () => {
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-default',
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
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
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-no-dashboard',
    });
    let session;

    try {
      session = startCLI(['author', 'dev', '--no-dashboard', 'skills/copywriting'], {
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
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-server-contract',
      sources: {
        'domains/value/knowledge/tone-of-voice.md': '# Voice\n',
      },
      skillMd: `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
import research from skill "@alavida/research"
source toneOfVoice = "domains/value/knowledge/tone-of-voice.md"
\`\`\`

Use [research guidance](skill:research){context="supporting dependency for evidence-backed copy"}.
Ground this in [tone of voice](source:toneOfVoice){context="primary writing guidance"}.
`,
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
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
      assert.match(asset, /Skill Graph/);

      const model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
      assert.equal(model.selected.packageName, '@alavida/value-copywriting');
      assert.equal(model.edges.length, 2);
    } finally {
      if (session) await session.stop();
      repo.cleanup();
    }
  });

  it('refreshes the workbench model when a selected source changes', async () => {
    const toneOfVoicePath = 'domains/value/knowledge/tone-of-voice.md';
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-watch',
      sources: {
        [toneOfVoicePath]: '# Voice\n',
      },
      skillMd: `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
source toneOfVoice = "${toneOfVoicePath}"
\`\`\`

Ground this in [tone of voice](source:toneOfVoice){context="primary writing guidance"}.
`,
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);

      let model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
      assert.equal(model.selected.status, 'current');

      writeFileSync(join(repo.root, toneOfVoicePath), '# Voice changed\n');

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

  it('rewatches source files added after skills dev has already started', async () => {
    const toneOfVoicePath = 'domains/value/knowledge/tone-of-voice.md';
    const proofPointsPath = 'domains/value/knowledge/proof-points.md';
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-dynamic-sources',
      sources: {
        [toneOfVoicePath]: '# Voice\n',
        [proofPointsPath]: '# Proof\n',
      },
      skillMd: `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
source toneOfVoice = "${toneOfVoicePath}"
\`\`\`

Ground this in [tone of voice](source:toneOfVoice){context="primary writing guidance"}.
`,
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);

      writeFileSync(
        join(repo.root, 'skills', 'copywriting', 'SKILL.md'),
        `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
source toneOfVoice = "${toneOfVoicePath}"
source proofPoints = "${proofPointsPath}"
\`\`\`

Ground this in [tone of voice](source:toneOfVoice){context="primary writing guidance"}.
Use [proof points](source:proofPoints){context="supporting evidence"}.
`
      );

      await session.waitForOutput(/Reloaded Skill: value-copywriting/);

      writeFileSync(join(repo.root, proofPointsPath), '# Proof changed\n');

      let model;
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
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-action',
      sources: {
        'domains/value/knowledge/selling-points.md': '# Selling Points\n',
      },
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
      skillMd: `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
source sellingPoints = "domains/value/knowledge/selling-points.md"
\`\`\`

Ground this in [selling points](source:sellingPoints){context="primary source material"}.
`,
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
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

  it('builds compiled state during dev for compiler-mode skills and refreshes stale status from sources', async () => {
    const sourcePath = 'domains/product/knowledge/prd-principles.md';
    const repo = createWorkbenchScenario({
      name: 'skills-dev-workbench-compiler-mode',
      sources: {
        [sourcePath]: '# Principles\n',
      },
      skillMd: `---
name: value-copywriting
description: Copy.
---

\`\`\`agentpack
source principles = "${sourcePath}"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
    });
    let session;

    try {
      session = startCLI(['author', 'dev', 'skills/copywriting'], {
        cwd: repo.root,
        env: {
          AGENTPACK_DISABLE_BROWSER: '1',
        },
      });

      const output = await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:\d+/);
      const workbenchUrl = extractWorkbenchUrl(output);

      assert.equal(existsSync(join(repo.root, '.agentpack', 'compiled.json')), true);

      let model = await fetch(`${workbenchUrl}/api/model`).then((response) => response.json());
      assert.equal(model.selected.status, 'current');
      assert.equal(model.edges.length, 1);

      writeFileSync(join(repo.root, sourcePath), '# Principles changed\n');

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
});
