import { test, expect } from '@playwright/test';
import { createScenario } from '../integration/fixtures.js';
import { startSkillDev } from '../../packages/agentpack/src/lib/skills.js';

function createWorkbenchRepo() {
  return createScenario({
    name: 'skills-dev-workbench-e2e',
    sources: {
      'domains/product/knowledge/prd-principles.md': '# PRD Principles\n\nUse evidence and clear scope.\n',
    },
    packages: [
      {
        relPath: 'skills/methodology',
        packageJson: {
          name: '@alavida/methodology-gary-provost',
          version: '1.0.0',
          files: ['SKILL.md'],
        },
        skillMd: `---
name: methodology-gary-provost
description: Sentence rhythm guidance.
---

\`\`\`agentpack
\`\`\`

# Gary Provost
`,
      },
      {
        relPath: 'skills/copywriting',
        packageJson: {
          name: '@alavida/value-copywriting',
          version: '1.0.0',
          files: ['SKILL.md'],
          dependencies: {
            '@alavida/methodology-gary-provost': '^1.0.0',
          },
        },
        skillMd: `---
name: value-copywriting
description: Copy with source-backed proof.
---

\`\`\`agentpack
import methodology from skill "@alavida/methodology-gary-provost"
source principles = "domains/product/knowledge/prd-principles.md"
\`\`\`

Use [the methodology guidance](skill:methodology){context="for sentence rhythm and style"}.
Ground this in [PRD principles](source:principles){context="primary source material"}.
`,
      },
    ],
  });
}

test('skills dev workbench renders the live localhost graph', async ({ page }, testInfo) => {
  const repo = createWorkbenchRepo();
  const previousDisableBrowser = process.env.AGENTPACK_DISABLE_BROWSER;
  process.env.AGENTPACK_DISABLE_BROWSER = '1';

  let session = null;

  try {
    session = startSkillDev('skills/copywriting', {
      cwd: repo.root,
      dashboard: true,
    });
    const readyResult = await session.ready;

    const workbenchUrl = readyResult?.workbench?.url || session.initialResult?.workbench?.url;
    expect(workbenchUrl).toBeTruthy();

    await page.goto(workbenchUrl);
    await expect(page.getByTestId('workbench-header')).toContainText('Skill Graph');
    await expect(page.getByTestId('control-strip')).toBeVisible();
    await expect(page.getByTestId('skill-graph')).toBeVisible();
    await expect(page.getByTestId('workbench-error')).toHaveCount(0);
    await expect(page.locator('.tree-edge')).toHaveCount(1);
    await expect(page.locator('.provenance-edge')).toHaveCount(1);

    await page.getByTestId('control-toggle-knowledge').click();
    await expect(page.locator('.provenance-edge')).toHaveCount(0);
    await page.getByTestId('control-toggle-knowledge').click();
    await expect(page.locator('.provenance-edge')).toHaveCount(1);

    await page.screenshot({ path: testInfo.outputPath('skills-dev-workbench.png') });
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
