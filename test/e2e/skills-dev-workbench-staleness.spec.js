import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario } from '../integration/fixtures.js';
import { startSkillDev } from '../../packages/agentpack/src/lib/skills.js';

function createStalenessRepo() {
  const sourcePath = 'domains/product/knowledge/prd-principles.md';
  const repo = createScenario({
    name: 'skills-dev-workbench-staleness-e2e',
    sources: {
      [sourcePath]: '# PRD Principles\n\nOriginal guidance.\n',
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
source principles = "${sourcePath}"
\`\`\`

Ground this in [our PRD principles](source:principles){context="primary source material"}.
`,
      },
    ],
  });

  return { repo, sourcePath };
}

test('skills dev workbench refresh shows stale and changed node states', async ({ page }) => {
  const { repo, sourcePath } = createStalenessRepo();
  const previousDisableBrowser = process.env.AGENTPACK_DISABLE_BROWSER;
  process.env.AGENTPACK_DISABLE_BROWSER = '1';

  let session = null;

  try {
    session = startSkillDev('skills/prd-agent', {
      cwd: repo.root,
      dashboard: true,
    });
    const readyResult = await session.ready;
    const workbenchUrl = readyResult?.workbench?.url;

    await page.goto(workbenchUrl);
    await expect(page.locator('[data-node-id="@alavida/prd-agent"]')).toHaveAttribute('data-node-status', 'current');
    await expect(page.locator('[data-node-id="source:domains/product/knowledge/prd-principles.md"]')).toHaveAttribute('data-node-status', 'current');

    writeFileSync(join(repo.root, sourcePath), '# PRD Principles\n\nUpdated guidance.\n');

    await page.getByTestId('control-refresh').click();

    await expect(page.locator('[data-node-id="@alavida/prd-agent"]')).toHaveAttribute('data-node-status', 'stale');
    await expect(page.locator('[data-node-id="source:domains/product/knowledge/prd-principles.md"]')).toHaveAttribute('data-node-status', 'changed');
  } finally {
    session?.close();
    if (previousDisableBrowser === undefined) {
      delete process.env.AGENTPACK_DISABLE_BROWSER;
    } else {
      process.env.AGENTPACK_DISABLE_BROWSER = previousDisableBrowser;
    }
    repo.cleanup();
  }
});
