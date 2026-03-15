import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getScenario } from '../../scripts/agent-eval/scenarios.js';
import { writeResultBundle } from '../../scripts/agent-eval/write-result-bundle.mjs';

describe('writeResultBundle', () => {
  it('writes the expected result bundle layout with learning log and final reports', async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'agent-eval-results-'));

    try {
      const bundlePath = await writeResultBundle({
        outputRoot,
        runId: 'run-001',
        scenario: getScenario('synthetic/new-skill'),
        sandbox: {
          provider: 'e2b',
          sandboxId: 'sbx-123',
        },
        transcript: [
          { ts: '2026-03-15T12:00:00.000Z', role: 'assistant', message: 'Starting task' },
        ],
        commands: [
          { ts: '2026-03-15T12:00:01.000Z', command: 'agentpack skills validate', exitCode: 0 },
        ],
        browser: [
          { ts: '2026-03-15T12:00:02.000Z', kind: 'screenshot', path: 'screenshots/graph.png' },
        ],
        learningLog: [
          {
            ts: '2026-03-15T12:00:03.000Z',
            kind: 'pain_point',
            severity: 'high',
            area: 'cli-output',
            note: 'I could not tell whether validate had written compiled state.',
            evidence: ['agentpack skills validate'],
            suggested_fix: 'Make validate say whether compiled.json was written.',
          },
        ],
        grader: {
          objectiveCompletion: { status: 'success' },
          productFriction: { rating: 'low' },
          classifications: ['success-with-friction'],
        },
        report: {
          outcome: 'success',
          confidence: 0.81,
          summary: 'The task succeeded, but the validate/build distinction was confusing.',
          pain_points: [
            {
              area: 'cli-output',
              severity: 'high',
              what_was_confusing: 'I could not tell whether validate had written compiled state.',
              evidence: ['agentpack skills validate'],
              suggested_fix: 'Make validate say whether compiled.json was written.',
            },
          ],
          learnings: ['inspect was more helpful than status for graph understanding'],
          helpful_things: ['agentpack skills inspect'],
        },
        reportMarkdown: '# Agentpack Eval Report\n\n## Outcome\nTask succeeded with friction.\n',
        summary: '# Run Summary\n\nTask succeeded with friction.\n',
        screenshots: [
          {
            path: 'screenshots/graph.png',
            data: Buffer.from('fake-image-bytes'),
          },
        ],
        fileDiff: 'diff --git a/SKILL.md b/SKILL.md\n',
        extraFiles: [
          {
            path: 'logs/claude-debug.log',
            data: 'debug line one\ndebug line two\n',
          },
        ],
      });

      assert.equal(bundlePath, join(outputRoot, 'run-001'));
      assert.equal(existsSync(join(bundlePath, 'scenario.json')), true);
      assert.equal(existsSync(join(bundlePath, 'sandbox.json')), true);
      assert.equal(existsSync(join(bundlePath, 'transcript.ndjson')), true);
      assert.equal(existsSync(join(bundlePath, 'commands.ndjson')), true);
      assert.equal(existsSync(join(bundlePath, 'browser.ndjson')), true);
      assert.equal(existsSync(join(bundlePath, 'learning-log.ndjson')), true);
      assert.equal(existsSync(join(bundlePath, 'grader.json')), true);
      assert.equal(existsSync(join(bundlePath, 'report.json')), true);
      assert.equal(existsSync(join(bundlePath, 'report.md')), true);
      assert.equal(existsSync(join(bundlePath, 'summary.md')), true);
      assert.equal(existsSync(join(bundlePath, 'file-diff.patch')), true);
      assert.equal(existsSync(join(bundlePath, 'logs', 'claude-debug.log')), true);
      assert.equal(existsSync(join(bundlePath, 'screenshots', 'graph.png')), true);

      const grader = JSON.parse(readFileSync(join(bundlePath, 'grader.json'), 'utf8'));
      assert.equal(grader.objectiveCompletion.status, 'success');
      const report = JSON.parse(readFileSync(join(bundlePath, 'report.json'), 'utf8'));
      assert.equal(report.pain_points[0].area, 'cli-output');
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
