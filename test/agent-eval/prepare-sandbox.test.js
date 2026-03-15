import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSandbox } from '../../scripts/agent-eval/prepare-sandbox.mjs';
import { getScenario } from '../../scripts/agent-eval/scenarios.js';

describe('prepareSandbox', () => {
  it('creates a sandbox with template metadata and builds the expected prep plan', async () => {
    const createCalls = [];

    const sandboxFactory = {
      async create(options) {
        createCalls.push(options);
        return {
          sandboxId: 'sbx-test-123',
          commands: {
            async exec(command, execOptions = {}) {
              return { stdout: '', stderr: '', exitCode: 0, command, execOptions };
            },
          },
          getHost(port) {
            return `https://sbx.example.test:${port}`;
          },
        };
      },
    };

    const result = await prepareSandbox({
      scenario: getScenario('synthetic/new-skill'),
      env: {
        E2B_API_KEY: 'e2b_test_key',
        CLAUDE_CODE_TOKEN: 'claude_test_token',
      },
      sandboxFactory,
      runId: 'run-123',
    });

    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].template, 'agentpack-agent-eval');
    assert.equal(createCalls[0].apiKey, 'e2b_test_key');
    assert.equal(createCalls[0].metadata.runId, 'run-123');
    assert.equal(createCalls[0].metadata.scenarioId, 'synthetic/new-skill');

    assert.equal(result.sandbox.sandboxId, 'sbx-test-123');
    assert.equal(result.paths.taskRepo, '/workspace/task-repo');
    assert.equal(result.paths.toolRoot, '/workspace/agentpack');
    assert.equal(result.browser.enabled, false);
    assert.equal(result.auth.mode, 'claude-code-token');
    assert.ok(result.bootstrapCommands.some((command) => command.includes('mkdir -p /workspace/task-repo')));
    assert.ok(result.bootstrapCommands.some((command) => command.includes('CLAUDE_CODE_OAUTH_TOKEN')));
    assert.equal(result.auth.credentials.claudeAiOauth.accessToken, 'claude_test_token');
    assert.ok(
      result.bootstrapCommands.some((command) => command.includes('~/.claude/.credentials.json'))
    );
  });

  it('prefers ANTHROPIC_API_KEY auth when no Claude Code token is provided', async () => {
    const result = await prepareSandbox({
      scenario: getScenario('agonda/validate'),
      env: {
        E2B_API_KEY: 'e2b_test_key',
        ANTHROPIC_API_KEY: 'anthropic_test_key',
      },
      sandboxFactory: {
        async create() {
          return {
            sandboxId: 'sbx-test-456',
            commands: {
              async exec() {
                return { stdout: '', stderr: '', exitCode: 0 };
              },
            },
            getHost(port) {
              return `https://sbx.example.test:${port}`;
            },
          };
        },
      },
      runId: 'run-456',
    });

    assert.equal(result.auth.mode, 'anthropic-api-key');
    assert.ok(result.auth.env.ANTHROPIC_API_KEY);
  });

  it('fails when no sandbox auth is available', async () => {
    await assert.rejects(
      () =>
        prepareSandbox({
          scenario: getScenario('superpowers/convert-skill'),
          env: {
            E2B_API_KEY: 'e2b_test_key',
          },
          sandboxFactory: {
            async create() {
              return {
                sandboxId: 'sbx-test-789',
                commands: { async exec() { return { stdout: '', stderr: '', exitCode: 0 }; } },
                getHost(port) {
                  return `https://sbx.example.test:${port}`;
                },
              };
            },
          },
          runId: 'run-789',
        }),
      /claude auth is required/i
    );
  });

  it('fails when no E2B API key is available', async () => {
    await assert.rejects(
      () =>
        prepareSandbox({
          scenario: getScenario('superpowers/convert-skill'),
          env: {
            CLAUDE_CODE_TOKEN: 'claude_test_token',
          },
          sandboxFactory: {
            async create() {
              throw new Error('should not create sandbox without key');
            },
          },
          runId: 'run-999',
        }),
      /E2B API key is required/i
    );
  });
});
