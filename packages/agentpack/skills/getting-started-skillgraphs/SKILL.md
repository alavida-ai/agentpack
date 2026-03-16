---
name: getting-started-skillgraphs
description: Use when starting from an empty repo or empty skillgraph and needing the first correct authoring loop, lifecycle framing, repo-root routing, and inspect/validate/dev command flow in agentpack.
type: lifecycle
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/introduction.mdx"
  - "alavida-ai/agentpack:docs/cli-skills.mdx"
  - "alavida-ai/agentpack:README.md"
---

# Agentpack - Getting Started Skillgraphs

## Setup

```bash
npm install -g @alavida/agentpack
cd knowledge-base
agentpack author inspect domains/value/skills/copywriting
agentpack publish validate domains/value/skills/copywriting
agentpack author dev domains/value/skills/copywriting
```

## Core Patterns

### Start in the authoring repo

```bash
cd knowledge-base
agentpack publish validate domains/value/skills/copywriting
agentpack author stale
```

Run source-backed commands from the repo that owns the files declared by your `source` bindings.

### Use the authored workflow first

```bash
agentpack author inspect domains/value/skills/copywriting
agentpack publish validate domains/value/skills/copywriting
agentpack author dev domains/value/skills/copywriting
```

### Switch to consumer install only after publishing

```bash
cd consumer-repo
npm install @alavida/value-copywriting
agentpack skills list
agentpack skills enable @alavida/value-copywriting
```

## Common Mistakes

### CRITICAL Wrong repo root for source-backed commands

Wrong:

```bash
cd tooling/agentpack
agentpack publish validate ../knowledge-base/domains/value/skills/copywriting
```

Correct:

```bash
cd knowledge-base
agentpack publish validate domains/value/skills/copywriting
```

`source` bindings resolve relative to the current repo root, so validating from the wrong repo breaks provenance checks.

Source: docs/introduction.mdx

### HIGH Starting with npm install instead of authoring validation

Wrong:

```bash
npm install @alavida/value-copywriting
```

Correct:

```bash
agentpack author inspect domains/value/skills/copywriting
agentpack publish validate domains/value/skills/copywriting
```

`npm install` is the consumer lifecycle; authored skills need inspect and validate first.

Source: skills/agentpack-cli/SKILL.md

### MEDIUM Treating the dashboard as the authoring surface

Wrong:

```bash
agentpack author dev domains/value/skills/copywriting
```

Correct:

```bash
edit domains/value/skills/copywriting/SKILL.md
agentpack author dev domains/value/skills/copywriting
```

The localhost workbench is for visibility during `author dev`, not the source of truth for authored behavior.

Source: docs/cli-skills.mdx

## References

- [Command routing](references/command-routing.md)
