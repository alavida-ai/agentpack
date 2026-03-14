---
name: developing-and-testing-skills
description: Use when iterating locally on a packaged skill with agentpack skills dev, the localhost workbench, repo-local materialization, and runtime testing feedback loops.
type: core
library: agentpack
library_version: "0.1.3"
sources:
  - "alavida-ai/agentpack:docs/commands.mdx"
  - "alavida-ai/agentpack:docs/introduction.mdx"
  - "alavida-ai/agentpack:README.md"
requires:
  - authoring-skillgraphs-from-knowledge
  - maintaining-skillgraph-freshness
---

# Agentpack - Developing And Testing Skills

## Setup

```bash
cd knowledge-base
agentpack skills dev domains/value/skills/copywriting
```

## Core Patterns

### Start local dev with the workbench

```bash
agentpack skills dev domains/value/skills/copywriting
```

This links the selected skill into `.claude/skills/` and `.agents/skills/`, records the active dev session in `.agentpack/dev-session.json`, and starts a localhost workbench by default.

### Use CLI-only mode when you explicitly do not want the dashboard

```bash
agentpack skills dev --no-dashboard domains/value/skills/copywriting
```

### Stop and clean up local links

```bash
agentpack skills unlink value-copywriting
```

If the previous dev process was killed badly and left stale runtime links behind:

```bash
agentpack skills dev cleanup
```

If a wrapper-managed process left a false-positive live pid in `.agentpack/dev-session.json`:

```bash
agentpack skills dev cleanup --force
```

If you need to remove the active root plus its recorded transitive links in one shot:

```bash
agentpack skills unlink value-copywriting --recursive
```

## Common Mistakes

### HIGH Expecting the current agent session to pick up new links

Wrong:

```bash
agentpack skills dev domains/value/skills/copywriting
```

Correct:

```bash
agentpack skills dev domains/value/skills/copywriting
# start a fresh agent session if one was already running
```

Already-running agent sessions may not rescan newly materialized skills.

Source: README.md

### MEDIUM Assuming unresolved requires block local dev links

Wrong:

```bash
agentpack skills dev domains/value/skills/copywriting
# ignore the unresolved warning because linking succeeded
```

Correct:

```bash
agentpack skills dev domains/value/skills/copywriting
agentpack skills dependencies @alavida-ai/value-copywriting
agentpack skills missing
```

`skills dev` can still link the selected skill while warning about unresolved packaged requirements.

Source: docs/commands.mdx

### MEDIUM Using no-dashboard mode and expecting workbench actions

Wrong:

```bash
agentpack skills dev --no-dashboard domains/value/skills/copywriting
```

Correct:

```bash
agentpack skills dev domains/value/skills/copywriting
```

`--no-dashboard` suppresses the localhost workbench entirely.

Source: docs/introduction.mdx

## References

- [Local workbench](references/local-workbench.md)
