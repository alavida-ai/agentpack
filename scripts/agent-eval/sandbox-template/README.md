# Agentpack Agent-Eval Sandbox Template

This directory holds the pinned E2B template scaffold for the autonomous
agent-eval harness.

The template is for the outer eval loop, not for local deterministic tests.

It should provide:

- Node and npm
- git
- Claude Code CLI
- Playwright browsers
- agentpack runtime prerequisites

Recommended workflow:

1. Build or update the template with the E2B CLI
2. Keep the template alias stable as `agentpack-agent-eval`
3. Use that alias from `scripts/agent-eval/prepare-sandbox.mjs`

Expected commands:

```bash
e2b template build -p scripts/agent-eval/sandbox-template -n agentpack-agent-eval
```

The generated `e2b.toml` is checked in as a scaffold and may need to be updated
after a real template build.
