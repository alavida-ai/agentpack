---
name: authoring-skillgraphs-from-knowledge
description: Use when authoring packaged skills from source knowledge with valid SKILL.md structure, package.json release fields, provenance source bindings, and skill imports in agentpack.
type: core
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/cli-skills.mdx"
  - "alavida-ai/agentpack:docs/how-it-works.mdx"
  - "alavida-ai/agentpack:skills/agentpack-cli/SKILL.md"
---

# Agentpack - Authoring Skillgraphs From Knowledge

## Setup

```markdown
---
name: value-copywriting
description: Messaging and copywriting guidance.
---

```agentpack
source sellingPoints = "domains/value/knowledge/selling-points.md"
import provost from skill "@alavida/methodology:gary-provost"
```
```

```json
{
  "name": "@alavida/value-copywriting",
  "version": "1.0.0",
  "files": ["SKILL.md", "skills"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alavida-ai/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "dependencies": {
    "@alavida/methodology": "^1.0.0"
  }
}
```

## Core Patterns

### Author `source` and `import` declarations in `SKILL.md`

```agentpack
source sellingPoints = "domains/value/knowledge/selling-points.md"
import provost from skill "@alavida/methodology:gary-provost"
```

### Validate to sync and record provenance

```bash
agentpack publish validate domains/value/skills/value-copywriting
```

### Inspect by path or package name

```bash
agentpack author inspect domains/value/skills/value-copywriting
agentpack author inspect @alavida/value-copywriting:value-copywriting
```

## Common Mistakes

### CRITICAL Editing package dependencies instead of imports

Wrong:

```json
{
  "dependencies": {
    "@alavida/methodology": "^1.0.0"
  }
}
```

Correct:

```agentpack
import provost from skill "@alavida/methodology:gary-provost"
```

`import` is the authored dependency truth; `package.json.dependencies` is the managed cross-package mirror.

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
  "files": ["SKILL.md", "skills"],
  "agentpack": {
    "root": "skills"
  }
}
```

A package that excludes its exported skill files is structurally invalid even if the authored source exists locally.

Source: docs/cli-skills.mdx

### HIGH Using missing or invalid package metadata

Wrong:

```json
{
  "name": "@alavida/value-copywriting"
}
```

Correct:

```json
{
  "name": "@alavida/value-copywriting",
  "version": "1.0.0",
  "files": ["SKILL.md", "skills"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alavida-ai/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Release-readiness checks enforce package identity and distribution metadata during `publish validate`.

Source: docs/cli-skills.mdx

## References

- [Authored metadata](references/authored-metadata.md)
