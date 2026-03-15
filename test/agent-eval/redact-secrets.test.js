import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectSecrets, redactSecrets } from '../../scripts/agent-eval/redact-secrets.mjs';

describe('redact-secrets', () => {
  it('collects secret-like env values and redacts nested structures', () => {
    const secrets = collectSecrets({
      env: {
        E2B_API_KEY: 'e2b_super_secret_key',
        CLAUDE_CODE_TOKEN: 'claude_super_secret_token',
        HOME: '/home/user',
      },
      auth: {
        credentials: {
          claudeAiOauth: {
            accessToken: 'oauth-access-token',
            refreshToken: 'oauth-refresh-token',
          },
        },
      },
    });

    const redacted = redactSecrets(
      {
        command: 'export CLAUDE_CODE_OAUTH_TOKEN="claude_super_secret_token"',
        nested: {
          debug: 'access oauth-access-token refresh oauth-refresh-token',
        },
      },
      secrets,
    );

    assert.match(redacted.command, /\[REDACTED\]/);
    assert.match(redacted.nested.debug, /\[REDACTED\]/);
    assert.equal(redacted.command.includes('claude_super_secret_token'), false);
  });
});
