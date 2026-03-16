---
name: maintaining-skillgraph-freshness
description: Use when validating authored skills, checking stale state, and keeping compiled metadata aligned with changing knowledge in an agentpack skillgraph.
type: lifecycle
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/cli-skills.mdx"
  - "alavida-ai/agentpack:docs/staleness.mdx"
  - "alavida-ai/agentpack:README.md"
---

# Agentpack - Maintaining Skillgraph Freshness

## Setup

```bash
cd knowledge-base
agentpack publish validate domains/value/skills/copywriting
agentpack author stale
git add .agentpack/compiled.json
```

## Core Patterns

### Use stale before and after source changes

```bash
agentpack author stale
edit domains/value/knowledge/tone-of-voice.md
agentpack author stale
```

### Revalidate to refresh the baseline

```bash
agentpack publish validate domains/value/skills/copywriting
```

### Commit authored metadata

```bash
git add .agentpack/compiled.json
git commit -m "chore: refresh skill metadata"
```

## Common Mistakes

### CRITICAL Treating stale detection as automatic without validate

Wrong:

```bash
edit domains/value/knowledge/tone-of-voice.md
agentpack author stale
```

Correct:

```bash
edit domains/value/knowledge/tone-of-voice.md
agentpack author stale
agentpack publish validate domains/value/skills/copywriting
```

The stale baseline only updates on successful validation.

Source: docs/cli-skills.mdx

### HIGH Not committing compiled state in authoring repos

Wrong:

```bash
git add domains/value/skills/copywriting
git commit -m "feat: update copywriting"
```

Correct:

```bash
git add domains/value/skills/copywriting .agentpack/compiled.json
git commit -m "feat: update copywriting"
```

Uncommitted compiled metadata breaks stale visibility across clones, CI, and teammates.

Source: README.md

### MEDIUM Using install-state as authored provenance

Wrong:

```text
.agentpack/install.json is treated as the authored source of truth
```

Correct:

```text
.agentpack/compiled.json is the authored metadata file
```

Install-state describes runtime materialization, not authored source freshness.

Source: docs/staleness.mdx

## References

- [Authored metadata](../authoring-skillgraphs-from-knowledge/references/authored-metadata.md)
