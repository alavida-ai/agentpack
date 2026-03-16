---
name: multi-skill-packages
description: Use when deciding how to structure multi-skill packages, configure the agentpack.skills export table, and manage dependency edges between exported skills in agentpack.
type: core
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/skill-graph.mdx"
  - "alavida-ai/agentpack:docs/schema-package-json.mdx"
  - "alavida-ai/agentpack:docs/sharing-skills.mdx"
---

# Agentpack - Multi-Skill Packages

## Setup

A multi-skill package exports more than one skill from a single npm package. Each exported skill has its own `SKILL.md` in a separate directory under `skills/`. The `package.json` declares all exports explicitly in the `agentpack.skills` map.

### Minimal multi-skill package layout

```
@acme/brand/
  package.json
  skills/
    value-copywriting/
      SKILL.md
    editorial-principles/
      SKILL.md
    tone-of-voice/
      SKILL.md
```

### package.json with multiple exports

```json
{
  "name": "@acme/brand",
  "version": "1.0.0",
  "description": "Brand copywriting and editorial skill package.",
  "files": ["skills/"],
  "agentpack": {
    "skills": {
      "value-copywriting": {
        "path": "skills/value-copywriting/SKILL.md"
      },
      "editorial-principles": {
        "path": "skills/editorial-principles/SKILL.md"
      },
      "tone-of-voice": {
        "path": "skills/tone-of-voice/SKILL.md"
      }
    }
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/acme-corp/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Each key in `agentpack.skills` must match the `name` field in the corresponding `SKILL.md` frontmatter. The `path` value is relative to the package root.

### SKILL.md frontmatter for an exported skill

```yaml
---
name: value-copywriting
description: Messaging and copywriting guidance grounded in brand selling points.
metadata:
  sources:
    - domains/brand/knowledge/selling-points.md
requires:
  - name: editorial-principles
    package: "@acme/brand"
---
```

The `requires` entry above points at a skill in the same package. Same-package requires do not generate a `package.json` dependency because npm does not need to fetch anything extra -- the skill is already present in the package.

## Core Patterns

### When to use one package vs many

Group skills in one package when they:

- share the same source knowledge files
- are always versioned and released together
- belong to the same bounded domain (e.g., "brand", "onboarding", "compliance")

Split into separate packages when:

- skills have independent version cadences
- different teams own different skills
- a skill has heavy transitive dependencies that consumers should not pull unless they need it

The heuristic: if you would put the code in the same npm library, put the skills in the same package. If you would publish separate libraries, publish separate skill packages.

### The `agentpack.skills` export table

The `agentpack.skills` object in `package.json` is the package-level contract. It declares which skills ship and where they live. This is analogous to the `exports` field in a Node.js `package.json`.

```json
"agentpack": {
  "skills": {
    "skill-a": { "path": "skills/skill-a/SKILL.md" },
    "skill-b": { "path": "skills/skill-b/SKILL.md" }
  }
}
```

Rules:

- Every exported skill must have a matching `SKILL.md` at the declared path.
- Every `SKILL.md` under `skills/` that you intend to distribute must appear in the export table.
- The key must match the `name` field in the `SKILL.md` frontmatter exactly.
- `agentpack skills validate` checks that each declared path resolves to a valid `SKILL.md`.

### Canonical skill IDs

When a package exports multiple skills, the canonical ID includes both the package name and the skill name:

```
@scope/package:skill-name
```

Examples:

```
@acme/brand:value-copywriting
@acme/brand:editorial-principles
@acme/brand:tone-of-voice
```

When a package exports exactly one skill with the same name as the package, the short form `@scope/package` is equivalent to `@scope/package:skill-name`.

Use the full `@scope/package:skill-name` form in `requires` and `import` declarations when referencing a specific skill from a multi-export package.

### `requires` (frontmatter) vs `import` (agentpack block)

These are two different edge types that serve different purposes.

**`requires` in SKILL.md frontmatter** declares a package-level dependency. It tells agentpack that this skill needs another skill to be installed. The `requires` array drives `package.json` dependency sync for cross-package references.

```yaml
requires:
  - name: gary-provost
    package: "@acme/methodology"
```

**`import` in the agentpack block** declares a semantic skill-to-skill edge in the compiled graph. It binds the imported skill to a local name so you can reference it in the body with contextual usage annotations.

```markdown
```agentpack
import research from skill "@acme/research"
```

Use [research](skill:research){context="required verification workflow before factual claims"}.
```

Key differences:

| Concern | `requires` (frontmatter) | `import` (agentpack block) |
|---|---|---|
| Purpose | Declare install-time dependency | Declare compile-time semantic edge |
| Drives | `package.json.dependencies` sync | Compiled skill graph edges |
| Scope | Package-level (which package to fetch) | Skill-level (which skill to reference in body) |
| Syntax | YAML array of `{name, package}` | `import <name> from skill "<package>"` |
| Required for cross-package | Yes | Optional (only if body references the skill) |

A cross-package skill reference typically needs both: `requires` so the dependency is installed, and `import` if the body references the skill with context annotations. For same-package references, `requires` alone is sufficient and does not generate a `package.json` dependency entry.

### How `package.json.dependencies` stays in sync

agentpack manages `package.json.dependencies` the way `go mod tidy` manages `go.mod`:

1. Read `requires` from each exported `SKILL.md`.
2. Compare against `dependencies` in `package.json`.
3. Add any cross-package `requires` entries that are missing.
4. Remove any `dependencies` entries that no longer appear in any exported skill's `requires`.
5. Write the updated `package.json`.

This sync runs automatically inside `agentpack skills validate` and `agentpack skills dev`. You never run it manually, and you never edit `dependencies` by hand for skill edges.

Same-package requires (where the required skill is exported from the same package) do not generate dependency entries. Only cross-package requires produce `dependencies` entries.

### Inspecting and validating multi-skill packages

```bash
# Inspect a specific exported skill by path
agentpack skills inspect domains/brand/skills/value-copywriting

# Inspect by canonical ID
agentpack skills inspect @acme/brand:value-copywriting

# Validate the entire package (checks all exports)
agentpack skills validate domains/brand

# Dev mode for a specific exported skill
agentpack skills dev domains/brand/skills/value-copywriting
```

`skills validate` checks all exported skills declared in `agentpack.skills`:

- Each declared path resolves to a valid `SKILL.md`.
- Each `SKILL.md` `name` matches its export table key.
- All cross-package `requires` are reflected in `dependencies`.
- `files` includes the exported skill paths.
- Package identity fields (`name`, `version`, `repository`, `publishConfig`) are present.

`skills inspect` shows the skill graph for one exported skill, including its source bindings, skill imports, and requires edges.

### Internal edges between co-exported skills

Skills within the same package can depend on each other. Use `requires` in the frontmatter to declare the edge:

```yaml
---
name: value-copywriting
description: Messaging and copywriting guidance.
requires:
  - name: editorial-principles
    package: "@acme/brand"
---
```

This creates a same-package edge. Because both skills ship in `@acme/brand`, no `dependencies` entry is generated. The skill graph still records the edge for staleness propagation and visualization.

If the body also references the co-exported skill with context annotations, add an `import` in the agentpack block:

```markdown
```agentpack
import editorial from skill "@acme/brand:editorial-principles"
```

Follow the [editorial principles](skill:editorial){context="baseline style rules that all copy must satisfy"}.
```

### Cross-package edges from a multi-skill package

When an exported skill depends on a skill in a different package, declare it in `requires`:

```yaml
---
name: value-copywriting
description: Messaging and copywriting guidance.
requires:
  - name: gary-provost
    package: "@acme/methodology"
---
```

After running `agentpack skills validate`, the package.json will contain:

```json
{
  "dependencies": {
    "@acme/methodology": "^1.0.0"
  }
}
```

Multiple exported skills can require different skills from the same external package. The dependency appears once in `package.json`.

## Common Mistakes

### CRITICAL Putting all skills in one mega-package

Wrong:

```json
{
  "name": "@acme/everything",
  "agentpack": {
    "skills": {
      "brand-copy": { "path": "skills/brand-copy/SKILL.md" },
      "engineering-standards": { "path": "skills/engineering-standards/SKILL.md" },
      "legal-review": { "path": "skills/legal-review/SKILL.md" },
      "devops-runbooks": { "path": "skills/devops-runbooks/SKILL.md" }
    }
  }
}
```

Correct: split by domain boundary.

```json
// @acme/brand package
{
  "name": "@acme/brand",
  "agentpack": {
    "skills": {
      "brand-copy": { "path": "skills/brand-copy/SKILL.md" },
      "editorial-principles": { "path": "skills/editorial-principles/SKILL.md" }
    }
  }
}

// @acme/engineering package
{
  "name": "@acme/engineering",
  "agentpack": {
    "skills": {
      "engineering-standards": { "path": "skills/engineering-standards/SKILL.md" }
    }
  }
}
```

A mega-package forces every consumer to install every skill even when they only need one domain. Version bumps in unrelated skills force unnecessary upgrades across all consumers.

### CRITICAL Forgetting to declare exports in `agentpack.skills`

Wrong:

```json
{
  "name": "@acme/brand",
  "version": "1.0.0",
  "files": ["skills/"]
}
```

Correct:

```json
{
  "name": "@acme/brand",
  "version": "1.0.0",
  "files": ["skills/"],
  "agentpack": {
    "skills": {
      "value-copywriting": {
        "path": "skills/value-copywriting/SKILL.md"
      }
    }
  }
}
```

Without the `agentpack.skills` export table, agentpack cannot discover, validate, or materialize any skills from the package. The `SKILL.md` files are invisible to the toolchain even if they exist on disk.

Source: docs/schema-package-json.mdx

### HIGH Manually editing `package.json` dependencies for skill edges

Wrong:

```json
{
  "dependencies": {
    "@acme/methodology": "^1.0.0",
    "@acme/research": "^2.0.0"
  }
}
```

Correct: author `requires` in each `SKILL.md` frontmatter.

```yaml
requires:
  - name: gary-provost
    package: "@acme/methodology"
  - name: fact-checking
    package: "@acme/research"
```

`package.json.dependencies` is managed output. agentpack derives it from exported skills' `requires` arrays during `validate` and `dev`. Manual edits will be overwritten on the next sync.

Source: docs/schema-package-json.mdx

### HIGH Mismatched export key and SKILL.md name

Wrong:

```json
"agentpack": {
  "skills": {
    "copywriting": {
      "path": "skills/value-copywriting/SKILL.md"
    }
  }
}
```

```yaml
---
name: value-copywriting
---
```

The export key `copywriting` does not match the SKILL.md `name` field `value-copywriting`. `skills validate` will flag this as a structural error.

Correct: use the same identifier in both places.

```json
"agentpack": {
  "skills": {
    "value-copywriting": {
      "path": "skills/value-copywriting/SKILL.md"
    }
  }
}
```

### MEDIUM Confusing `requires` and `import` scopes

Wrong: using `import` in the agentpack block without a corresponding `requires` for a cross-package dependency.

```markdown
```agentpack
import research from skill "@acme/research"
```
```

Without a `requires` entry for `@acme/research`, the skill will not trigger a `package.json` dependency and consumers will not have the package installed. `skills validate` will report the missing dependency.

Correct: declare both when referencing a cross-package skill in the body.

```yaml
requires:
  - name: research
    package: "@acme/research"
```

```markdown
```agentpack
import research from skill "@acme/research"
```
```

### MEDIUM Excluding skill directories from `files`

Wrong:

```json
{
  "files": ["README.md"],
  "agentpack": {
    "skills": {
      "value-copywriting": { "path": "skills/value-copywriting/SKILL.md" }
    }
  }
}
```

Correct:

```json
{
  "files": ["skills/"],
  "agentpack": {
    "skills": {
      "value-copywriting": { "path": "skills/value-copywriting/SKILL.md" }
    }
  }
}
```

The `files` array controls what npm publishes. If it does not include the exported skill directories, the published package will be empty. `skills validate` checks that `files` includes the exported paths.

Source: docs/schema-package-json.mdx

## References

- [Package.json schema](references/schema-package-json.md)
- [SKILL.md schema](references/schema-skill-md.md)
- [The skill graph](references/skill-graph.md)
- [Sharing skills](references/sharing-skills.md)
