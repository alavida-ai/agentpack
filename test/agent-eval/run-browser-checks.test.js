import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBrowserChecks } from '../../scripts/agent-eval/run-browser-checks.mjs';

describe('runBrowserChecks', () => {
  it('opens the workbench URL, captures a screenshot, and returns browser events', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-eval-browser-'));
    const opened = [];

    try {
      const result = await runBrowserChecks({
        url: 'https://sbx.example.test/workbench',
        outputDir: root,
        desktop: {
          stream: {
            async start() {},
            getUrl() {
              return 'https://stream.example.test';
            },
            async stop() {},
          },
          async open(target) {
            opened.push(target);
          },
          async screenshot() {
            return Buffer.from('fake-browser-image');
          },
          async getCurrentWindowId() {
            return 'window-1';
          },
          async getWindowTitle() {
            return 'Agentpack Workbench';
          },
        },
        assertPage: async () => ({
          nodeCount: 6,
          labels: ['prd-agent', 'principles'],
          screenshot: Buffer.from('playwright-image'),
        }),
      });

      assert.deepEqual(opened, ['https://sbx.example.test/workbench']);
      assert.equal(result.summary.nodeCount, 6);
      assert.equal(result.summary.screenshot, undefined);
      assert.equal(result.events.length >= 2, true);
      assert.equal(result.extraScreenshots.length, 1);
      assert.equal(readFileSync(join(root, 'browser-screenshot.png')).toString('utf8'), 'fake-browser-image');
      assert.equal(readFileSync(join(root, 'playwright-workbench.png')).toString('utf8'), 'playwright-image');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
