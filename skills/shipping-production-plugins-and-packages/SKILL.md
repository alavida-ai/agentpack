---
name: shipping-production-plugins-and-packages
description: Use when turning maintained skills into deployable bundled plugins or publishable standalone packages with explicit dependency closure, hooks, MCP tools, and production checks in agentpack.
type: core
library: agentpack
library_version: "0.1.2"
sources:
  - "alavida-ai/agentpack:docs/commands.mdx"
  - "alavida-ai/agentpack:docs/architecture.mdx"
  - "alavida-ai/agentpack:README.md"
requires:
  - identifying-skill-opportunities
  - authoring-skillgraphs-from-knowledge
  - repairing-broken-skill-or-plugin-state
---

# Agentpack - Shipping Production Plugins And Packages

## Setup

```bash
agentpack plugin inspect plugins/website-dev
agentpack plugin validate plugins/website-dev
agentpack plugin build plugins/website-dev
```

## Core Patterns

### Ship a standalone package for one reusable capability

```bash
agentpack skills validate domains/value/skills/copywriting
```

Use this when the capability stands on its own and does not need to ship bundled with hooks, MCP tools, or other skills.

### Bundle a production plugin when shipping several skills together

```bash
agentpack plugin inspect plugins/website-dev
agentpack plugin validate plugins/website-dev
agentpack plugin build plugins/website-dev
```

### Use plugin dev during iteration on the delivery shell

```bash
agentpack plugin dev plugins/website-dev
```

## Common Mistakes

### CRITICAL Declaring plugin-local skill requires without matching devDependencies

Wrong:

```yaml
requires:
  - @alavida-ai/value-copywriting
```

```json
{
  "devDependencies": {}
}
```

Correct:

```json
{
  "devDependencies": {
    "@alavida-ai/value-copywriting": "^1.0.0"
  }
}
```

Plugin bundle closure depends on direct required skill packages being present in `package.json.devDependencies`.

Source: docs/commands.mdx

### HIGH Forgetting the plugin manifest and expecting validate to infer it

Wrong:

```text
plugins/website-dev/package.json
# no .claude-plugin/plugin.json
```

Correct:

```text
plugins/website-dev/package.json
plugins/website-dev/.claude-plugin/plugin.json
```

Plugin commands require an explicit runtime manifest and now return structured diagnostics when it is missing.

Source: docs/commands.mdx

### HIGH Assuming a packaged skill and a bundled plugin are the same release unit

Wrong:

```text
Publish one packaged skill and assume hooks, MCP tools, and related skills ship with it automatically
```

Correct:

```text
Use a standalone package for one reusable capability
Use a bundled plugin when several skills, hooks, or MCP tools must ship together
```

Packaged skills are reusable units; plugins are deployable runtime shells.

Source: README.md

## References

- [Plugin delivery](references/plugin-delivery.md)
