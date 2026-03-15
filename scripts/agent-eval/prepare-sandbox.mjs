import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getScenario, validateScenario } from './scenarios.js';

const DEFAULT_TEMPLATE = 'agentpack-agent-eval';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export async function prepareSandbox({
  scenario,
  scenarioId,
  env = process.env,
  sandboxFactory,
  runId,
  template = DEFAULT_TEMPLATE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const resolvedScenario = scenario ?? getScenario(scenarioId);
  validateScenario(resolvedScenario);

  const mergedEnv = env === process.env ? mergeEnvWithDotEnv(env) : { ...env };
  if (!mergedEnv.E2B_API_KEY) {
    throw new Error('E2B API key is required for autonomous agent eval sandboxes');
  }
  const auth = resolveClaudeAuth(mergedEnv, {
    allowLocalCredentials: env === process.env,
  });
  if (!auth) {
    throw new Error('Claude auth is required for autonomous agent eval sandboxes');
  }

  const factory = sandboxFactory ?? (await loadDefaultSandboxFactory());
  const sandbox = await factory.create({
    apiKey: mergedEnv.E2B_API_KEY,
    template,
    timeoutMs,
    metadata: {
      app: 'agentpack-agent-eval',
      runId,
      scenarioId: resolvedScenario.id,
      repoSource: resolvedScenario.repo.source,
    },
  });

  const paths = {
    root: '/workspace',
    taskRepo: '/workspace/task-repo',
    toolRoot: '/workspace/agentpack',
    resultRoot: '/workspace/eval-results',
  };

  const bootstrapCommands = buildBootstrapCommands({ auth, paths, scenario: resolvedScenario });

  return {
    sandbox,
    apiKey: mergedEnv.E2B_API_KEY,
    auth,
    scenario: resolvedScenario,
    paths,
    browser: {
      enabled: resolvedScenario.browser.required,
      workbenchHostForPort: (port) => sandbox.getHost(port),
    },
    bootstrapCommands,
  };
}

function mergeEnvWithDotEnv(baseEnv) {
  const merged = { ...baseEnv };
  const envPath = resolve('.env');

  if (!existsSync(envPath)) {
    return merged;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in merged)) {
      merged[key] = stripQuotes(value);
    }
  }

  return merged;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function resolveClaudeAuth(env, { allowLocalCredentials = false } = {}) {
  const sandboxBaseEnv = {
    HOME: '/home/user',
    USER: 'user',
  };

  if (allowLocalCredentials) {
    const credentials = loadLocalClaudeCredentials();
    if (credentials) {
      return {
        mode: 'claude-credentials',
        env: sandboxBaseEnv,
        credentials,
      };
    }
  }

  if (env.CLAUDE_CODE_OAUTH_TOKEN || env.CLAUDE_CODE_TOKEN) {
    const token = env.CLAUDE_CODE_OAUTH_TOKEN ?? env.CLAUDE_CODE_TOKEN;
    return {
      mode: 'claude-code-token',
      env: {
        ...sandboxBaseEnv,
        CLAUDE_CODE_OAUTH_TOKEN: token,
      },
      credentials: {
        claudeAiOauth: {
          accessToken: token,
          refreshToken: env.CLAUDE_CODE_REFRESH_TOKEN ?? 'agent-eval-placeholder-refresh-token',
          expiresAt:
            Number.parseInt(env.CLAUDE_CODE_EXPIRES_AT ?? '', 10) ||
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          scopes: ['user:inference'],
          subscriptionType: env.CLAUDE_CODE_SUBSCRIPTION_TYPE ?? 'max',
          rateLimitTier: null,
        },
      },
    };
  }

  if (env.ANTHROPIC_API_KEY) {
    return {
      mode: 'anthropic-api-key',
      env: {
        ...sandboxBaseEnv,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      },
    };
  }

  return null;
}

function buildBootstrapCommands({ auth, paths, scenario }) {
  const commands = [
    `mkdir -p ${paths.taskRepo} ${paths.toolRoot} ${paths.resultRoot}`,
  ];

  if (auth.mode === 'claude-code-token' || auth.mode === 'claude-credentials') {
    const prelude = [];
    if (auth.env.CLAUDE_CODE_OAUTH_TOKEN) {
      prelude.push(
        `export CLAUDE_CODE_OAUTH_TOKEN="${shellEscape(auth.env.CLAUDE_CODE_OAUTH_TOKEN)}"`
      );
    }
    commands.push(
      [
        ...prelude,
        'mkdir -p ~/.claude',
        `cat <<'EOF' > ~/.claude/.credentials.json
${JSON.stringify(auth.credentials, null, 2)}
EOF`,
        'chmod 700 ~/.claude',
        'chmod 600 ~/.claude/.credentials.json',
      ].join('\n')
    );
  }

  if (auth.mode === 'anthropic-api-key') {
    commands.push(
      `export ANTHROPIC_API_KEY="${shellEscape(auth.env.ANTHROPIC_API_KEY)}"`
    );
  }

  commands.push(
    `cat <<'EOF' > /usr/local/bin/agentpack-log-learning
#!/usr/bin/env bash
set -euo pipefail
kind="\${1:-learning}"
severity="\${2:-low}"
area="\${3:-general}"
shift 3 || true
note="$*"
mkdir -p ${paths.resultRoot}
KIND="$kind" SEVERITY="$severity" AREA="$area" NOTE="$note" node -e '
const entry = {
  ts: new Date().toISOString(),
  kind: process.env.KIND || "learning",
  severity: process.env.SEVERITY || "low",
  area: process.env.AREA || "general",
  note: process.env.NOTE || "",
};
process.stdout.write(JSON.stringify(entry) + "\\n");
' >> ${paths.resultRoot}/learning-log.ndjson
EOF`,
  );
  commands.push('chmod +x /usr/local/bin/agentpack-log-learning');

  if (scenario.browser.required) {
    commands.push('mkdir -p /workspace/browser-artifacts');
  }

  return commands;
}

function shellEscape(value) {
  return String(value).replaceAll('"', '\\"');
}

async function loadDefaultSandboxFactory() {
  const { Sandbox } = await import('e2b');
  return Sandbox;
}

function loadLocalClaudeCredentials() {
  const candidates = [
    resolve(process.env.HOME ?? '', '.claude', '.credentials.json'),
    resolve(process.env.HOME ?? '', '.claude', '.credentials.json.backup'),
  ];

  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      if (parsed?.claudeAiOauth?.accessToken) {
        return {
          claudeAiOauth: parsed.claudeAiOauth,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
