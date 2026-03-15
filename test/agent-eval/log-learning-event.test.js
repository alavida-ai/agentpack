import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendLearningEvent } from '../../scripts/agent-eval/log-learning-event.mjs';

describe('appendLearningEvent', () => {
  it('appends NDJSON learning events to the target log file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-eval-learning-log-'));

    try {
      const logPath = join(root, 'learning-log.ndjson');

      await appendLearningEvent(logPath, {
        ts: '2026-03-15T12:00:00.000Z',
        kind: 'pain_point',
        severity: 'high',
        area: 'syntax',
        note: 'I did not know where compiler syntax belonged.',
        evidence: ['SKILL.md edit attempt'],
        suggested_fix: 'Show a compiler-mode example in validate output.',
      });

      await appendLearningEvent(logPath, {
        ts: '2026-03-15T12:00:01.000Z',
        kind: 'learning',
        severity: 'medium',
        area: 'graph',
        note: 'The graph was more useful for confirmation than discovery.',
        evidence: [],
        suggested_fix: '',
      });

      const entries = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      assert.equal(entries.length, 2);
      assert.equal(entries[0].kind, 'pain_point');
      assert.equal(entries[1].kind, 'learning');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
