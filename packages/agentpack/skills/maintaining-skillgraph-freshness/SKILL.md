---
name: maintaining-skillgraph-freshness
description: Use when validating authored skills, checking stale state, and keeping build-state and catalog metadata aligned with changing knowledge in an agentpack skillgraph.
type: lifecycle
library: agentpack
library_version: "0.1.3"
sources:
  - "alavida-ai/agentpack:docs/commands.mdx"
  - "alavida-ai/agentpack:docs/current-state.mdx"
  - "alavida-ai/agentpack:README.md"
---

# Agentpack - Maintaining Skillgraph Freshness

## Setup

```bash
cd knowledge-base
agentpack skills validate domains/value/skills/copywriting
agentpack skills stale
git add .agentpack/build-state.json .agentpack/catalog.json
```

## Core Patterns

### Use stale before and after source changes

```bash
agentpack skills stale
edit domains/value/knowledge/tone-of-voice.md
agentpack skills stale
```

### Revalidate to refresh the baseline

```bash
agentpack skills validate domains/value/skills/copywriting
```

### Commit authored metadata

```bash
git add .agentpack/build-state.json .agentpack/catalog.json
git commit -m "chore: refresh skill metadata"
```

## Common Mistakes

### CRITICAL Treating stale detection as automatic without validate

Wrong:

```bash
edit domains/value/knowledge/tone-of-voice.md
agentpack skills stale
```

Correct:

```bash
edit domains/value/knowledge/tone-of-voice.md
agentpack skills stale
agentpack skills validate domains/value/skills/copywriting
```

The stale baseline only updates on successful validation.

Source: docs/commands.mdx

### HIGH Not committing build-state and catalog in authoring repos

Wrong:

```bash
git add domains/value/skills/copywriting
git commit -m "feat: update copywriting"
```

Correct:

```bash
git add domains/value/skills/copywriting .agentpack/build-state.json .agentpack/catalog.json
git commit -m "feat: update copywriting"
```

Uncommitted authored metadata breaks stale visibility across clones, CI, and teammates.

Source: README.md

### MEDIUM Using install-state as authored provenance

Wrong:

```text
.agentpack/install.json is treated as the authored source of truth
```

Correct:

```text
.agentpack/build-state.json and .agentpack/catalog.json are the authored metadata files
```

Install-state describes runtime materialization, not authored source freshness.

Source: docs/current-state.mdx

## References

- [Authored metadata](references/authored-metadata.md)
