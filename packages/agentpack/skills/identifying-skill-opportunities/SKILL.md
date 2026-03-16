---
name: identifying-skill-opportunities
description: Use when deciding what raw knowledge should become a packaged skill, a reusable capability boundary, or a requires edge in an agentpack skillgraph.
type: core
library: agentpack
library_version: "0.1.3"
sources:
  - "alavida-ai/agentpack:docs/architecture.mdx"
  - "alavida-ai/agentpack:docs/overview.mdx"
  - "alavida-ai/agentpack:skills/agentpack-cli/SKILL.md"
---

# Agentpack - Identifying Skill Opportunities

## Setup

```md
Source knowledge:
- domains/design/knowledge/brand-guidelines.md
- domains/frontend/knowledge/component-heuristics.md

Reusable skills:
- domains/design/skills/brand-guidelines
- domains/frontend/skills/frontend-skill

Composed task skill:
- domains/design/skills/agonda-brand-frontend
  requires:
    - @scope/brand-guidelines
    - @scope/frontend-skill
```

## Core Patterns

### Split by reusable capability

If a knowledge area should be reused compositionally in work, give it its own packaged skill.

### Compose task-specific skills with `requires`

Use a task skill when the work needs several reusable capabilities together.

### Keep capability boundaries explicit

Use packaged skills and explicit `requires` edges to expose reusable capabilities. Runtime materialization belongs downstream from the compiled graph.

## Common Mistakes

### HIGH Copying knowledge into one giant skill

Wrong:

```md
One SKILL.md contains branding, frontend heuristics, research notes, and delivery instructions.
```

Correct:

```md
Create packaged skills for reusable capabilities, then compose them with requires.
```

Flattening multiple capabilities into one skill destroys explicit dependency edges and makes maintenance coarse.

Source: maintainer interview

### CRITICAL Hiding dependency boundaries inside one task skill

Wrong:

```text
domains/brand/skills/website-ops/SKILL.md
```

Correct:

```text
domains/brand/skills/copywriting/SKILL.md
domains/research/skills/interview-research/SKILL.md
domains/brand/skills/website-ops/SKILL.md # requires packaged skills
```

The compiled skill graph is the architectural source of truth. Reusable capability boundaries should remain explicit in packaged skills and `requires` edges.

Source: docs/architecture.mdx

### CRITICAL Omitting provenance sources for knowledge-backed skills

Wrong:

```yaml
---
name: value-copywriting
description: Copy.
requires: []
---
```

Correct:

```yaml
---
name: value-copywriting
description: Copy.
metadata:
  sources:
    - domains/value/knowledge/tone-of-voice.md
requires: []
---
```

Without `metadata.sources`, the skillgraph cannot explain stale state against source truth.

Source: docs/architecture.mdx

## References

- [Capability boundaries](references/capability-boundaries.md)
