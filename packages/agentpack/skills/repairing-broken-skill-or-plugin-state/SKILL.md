---
name: repairing-broken-skill-or-plugin-state
description: Use when auditing or repairing stale skills, unresolved requires, missing runtime dependencies, affected dependents, or malformed plugin definition files in agentpack.
type: lifecycle
library: agentpack
library_version: "0.1.3"
sources:
  - "alavida-ai/agentpack:docs/current-state.mdx"
  - "alavida-ai/agentpack:docs/commands.mdx"
  - "alavida-ai/agentpack:src/domain/plugins/load-plugin-definition.js"
requires:
  - maintaining-skillgraph-freshness
  - developing-and-testing-skills
---

# Agentpack - Repairing Broken Skill Or Plugin State

## Setup

```bash
agentpack skills status
agentpack skills missing
agentpack skills dependencies @alavida-ai/value-copywriting
agentpack plugin inspect plugins/website-dev
```

## Core Patterns

### Start with visibility commands

```bash
agentpack skills status
agentpack skills missing
agentpack skills env
```

### Inspect plugin definition failures before build

```bash
agentpack plugin inspect plugins/website-dev
agentpack plugin validate plugins/website-dev
```

### Trace stale or affected dependents explicitly

```bash
agentpack skills stale
agentpack skills dependencies @alavida-ai/value-copywriting
```

## Common Mistakes

### HIGH Debugging plugin bundle failures without inspect

Wrong:

```bash
agentpack plugin build plugins/website-dev
```

Correct:

```bash
agentpack plugin inspect plugins/website-dev
agentpack plugin validate plugins/website-dev
```

`plugin inspect` and `plugin validate` now surface actionable diagnostics for missing plugin files and metadata.

Source: docs/commands.mdx

### HIGH Treating affected dependents as healthy because they still resolve

Wrong:

```bash
agentpack skills env
```

Correct:

```bash
agentpack skills stale
agentpack skills dependencies @alavida-ai/value-copywriting
```

A dependent can still resolve while being affected by an upstream stale dependency.

Source: docs/current-state.mdx

### MEDIUM Repairing runtime state by hand-editing local materializations

Wrong:

```bash
rm -rf .claude/skills/value-copywriting
```

Correct:

```bash
agentpack skills unlink value-copywriting
agentpack skills unlink value-copywriting --recursive
agentpack skills dev cleanup
agentpack skills install @alavida-ai/value-copywriting
```

Runtime state should be repaired through agentpack lifecycle commands, not direct edits under `.claude/skills` or `.agents/skills`.

Use `skills dev cleanup --force` only when a wrapper-managed process or pid reuse leaves a false-positive active session in `.agentpack/dev-session.json`.

Source: docs/architecture.mdx

## References

- [Diagnostic flows](references/diagnostic-flows.md)
