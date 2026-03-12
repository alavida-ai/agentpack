---
name: identifying-skill-opportunities
description: Use when deciding what raw knowledge should become a packaged skill, a reusable capability boundary, a requires edge, or a plugin-local wrapper in an agentpack skillgraph.
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

### Keep plugin-local skills as delivery wrappers

Use plugin-local skills to expose packaged capabilities inside a runtime shell, not to hide the capability graph.

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

### CRITICAL Using plugin boundaries as the dependency model

Wrong:

```text
plugins/website-dev/skills/copywriting/SKILL.md
plugins/website-dev/skills/research/SKILL.md
```

Correct:

```text
domains/brand/skills/copywriting/SKILL.md
domains/research/skills/interview-research/SKILL.md
plugins/website-dev/skills/copywriting/SKILL.md # requires packaged skills
```

Plugins are a delivery surface, not the architectural place to hide reusable capability boundaries.

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
