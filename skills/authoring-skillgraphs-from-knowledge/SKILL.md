---
name: authoring-skillgraphs-from-knowledge
description: Use when authoring packaged skills from source knowledge with valid SKILL.md metadata, package.json release fields, provenance sources, and requires edges in agentpack.
type: core
library: agentpack
library_version: "0.1.3"
sources:
  - "alavida-ai/agentpack:docs/commands.mdx"
  - "alavida-ai/agentpack:docs/architecture.mdx"
  - "alavida-ai/agentpack:skills/agentpack-cli/SKILL.md"
---

# Agentpack - Authoring Skillgraphs From Knowledge

## Setup

```yaml
---
name: value-copywriting
description: Messaging and copywriting guidance.
metadata:
  sources:
    - domains/value/knowledge/selling-points.md
requires:
  - @alavida-ai/methodology-gary-provost
---
```

```json
{
  "name": "@alavida-ai/value-copywriting",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alavida-ai/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "files": ["SKILL.md"],
  "dependencies": {
    "@alavida-ai/methodology-gary-provost": "^1.0.0"
  }
}
```

## Core Patterns

### Author `requires` in `SKILL.md`

```yaml
requires:
  - @alavida-ai/methodology-gary-provost
```

### Validate to sync and record provenance

```bash
agentpack skills validate domains/value/skills/copywriting
```

### Inspect by path or package name

```bash
agentpack skills inspect domains/value/skills/copywriting
agentpack skills inspect @alavida-ai/value-copywriting
```

## Common Mistakes

### CRITICAL Editing package dependencies instead of requires

Wrong:

```json
{
  "dependencies": {
    "@alavida-ai/methodology-gary-provost": "^1.0.0"
  }
}
```

Correct:

```yaml
requires:
  - @alavida-ai/methodology-gary-provost
```

`requires` is the authored dependency truth; `package.json.dependencies` is the compiled mirror.

Source: skills/agentpack-cli/SKILL.md

### HIGH Shipping a skill package without SKILL.md in files

Wrong:

```json
{
  "files": ["README.md"]
}
```

Correct:

```json
{
  "files": ["SKILL.md"]
}
```

A package that excludes `SKILL.md` is structurally invalid even if the authored source exists locally.

Source: docs/commands.mdx

### HIGH Using missing or invalid package metadata

Wrong:

```json
{
  "name": "@alavida-ai/value-copywriting"
}
```

Correct:

```json
{
  "name": "@alavida-ai/value-copywriting",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alavida-ai/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Release-readiness checks enforce package identity and distribution metadata during `skills validate`.

Source: docs/commands.mdx

## References

- [Authored metadata](references/authored-metadata.md)
