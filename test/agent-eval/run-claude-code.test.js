import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runClaudeCode } from '../../scripts/agent-eval/run-claude-code.mjs';
import { getScenario } from '../../scripts/agent-eval/scenarios.js';

describe('runClaudeCode', () => {
  it('builds a non-interactive Claude invocation and parses stream-json output', async () => {
    const calls = [];
    const result = await runClaudeCode({
      scenario: getScenario('synthetic/new-skill'),
      cwd: '/workspace/task-repo',
      systemPrompt: 'You are evaluating agentpack.',
      commandRunner: async (command, options) => {
        calls.push({ command, options });
        return {
          stdout: [
            JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Started task' }] } }),
            JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1200 }),
          ].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].command.includes('claude -p'));
    assert.ok(calls[0].command.includes('--output-format stream-json'));
    assert.equal(calls[0].options.cwd, '/workspace/task-repo');
    assert.equal(result.exitCode, 0);
    assert.equal(result.transcript.length, 2);
    assert.equal(result.transcript[0].type, 'assistant');
  });

  it('includes checkpoint observations for checkpointed scenarios', async () => {
    let invokedPrompt = '';

    await runClaudeCode({
      scenario: getScenario('synthetic/stale-repair'),
      cwd: '/workspace/task-repo',
      checkpointObservations: ['The dashboard shows the source node as stale.'],
      commandRunner: async (command) => {
        invokedPrompt = command;
        return {
          stdout: JSON.stringify({ type: 'result', subtype: 'success' }),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    assert.ok(invokedPrompt.includes('Checkpoint observations'));
    assert.ok(invokedPrompt.includes('source node as stale'));
  });

  it('records stderr and preserves non-json output as transcript lines', async () => {
    const result = await runClaudeCode({
      scenario: getScenario('synthetic/install-package'),
      cwd: '/workspace/task-repo',
      commandRunner: async () => ({
        stdout: 'plain text output\nsecond line',
        stderr: 'warning text',
        exitCode: 1,
      }),
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, 'warning text');
    assert.equal(result.transcript.length, 2);
    assert.equal(result.transcript[0].type, 'stdout');
  });
});
