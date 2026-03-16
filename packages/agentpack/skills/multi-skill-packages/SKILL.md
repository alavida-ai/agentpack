---
name: multi-skill-packages
description: Use when deciding how to structure multi-skill packages, configure agentpack.root for named export discovery, and manage dependency edges between exported skills in agentpack.
type: core
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/skill-graph.mdx"
  - "alavida-ai/agentpack:docs/schema-package-json.mdx"
  - "alavida-ai/agentpack:docs/publishing.mdx"
---

# Agentpack - Multi-Skill Packages

## Setup

A multi-skill package exports more than one skill from a single npm package. The root `SKILL.md` is the primary export. Additional named exports each have their own `SKILL.md` in a separate directory under the path declared in `agentpack.root`. Named exports are discovered from the filesystem automatically -- there is no explicit export table.

### Minimal multi-skill package layout

```
@acme/brand/
  package.json
  SKILL.md                        # primary export
  skills/
    value-copywriting/
      SKILL.md                    # named export
    editorial-principles/
      SKILL.md                    # named export
    tone-of-voice/
      SKILL.md                    # named export
```

### package.json with named exports

```json
{
  "name": "@acme/brand",
  "version": "1.0.0",
  "description": "Brand copywriting and editorial skill package.",
  "files": ["SKILL.md", "skills/"],
  "agentpack": {
    "root": "skills"
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

The `agentpack.root` tells the toolchain where to discover named exports. Each subdirectory containing a `SKILL.md` becomes a named export. The `name` field in each `SKILL.md` frontmatter determines the export name.

### SKILL.md structure for an exported skill

```markdown
---
name: value-copywriting
description: Messaging and copywriting guidance grounded in brand selling points.
---

```agentpack
source sellingPoints = "domains/brand/knowledge/selling-points.md"
import editorial from skill "@acme/brand:editorial-principles"
```

Use ^[source:sellingPoints]{context="core product claims and differentiation"}.

Apply ^[skill:editorial]{context="baseline style rules shared across the brand package"}.
```

The `source` statement declares provenance. The `import` statement declares a semantic edge to another exported skill. When that import points at another package, agentpack also mirrors the package dependency into `package.json.dependencies`.

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

### The `agentpack.root` export discovery

The `agentpack.root` field in `package.json` tells the toolchain which directory to scan for named exports. Every subdirectory under that path that contains a `SKILL.md` becomes a named export automatically.

```json
"agentpack": {
  "root": "skills"
}
```

Rules:

- Every named export must have a valid `SKILL.md` in its directory.
- The `name` field in each `SKILL.md` frontmatter determines the export name.
- The root `SKILL.md` at the package root is the primary export (if present).
- `agentpack publish validate` checks that each discovered export resolves to a valid `SKILL.md`.

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

Use the full `@scope/package:skill-name` form in `import` declarations when referencing a specific skill from a multi-export package.

### `import` is the dependency declaration

The current compiler-first model uses `import` statements in the `agentpack` block as the source of truth for skill-to-skill edges.

An `import` both:

- creates the semantic edge in the compiled graph
- drives managed `package.json.dependencies` sync for cross-package package references

Same-package imports do not add a `dependencies` entry because npm already ships those skills in the same package. Cross-package imports do.

```markdown
```agentpack
import research from skill "@acme/research"
import editorial from skill "@acme/brand:editorial-principles"
```

Use [research](skill:research){context="required verification workflow before factual claims"}.
```

Guidance:

- Use same-package imports for explicit edges between co-exported skills.
- Use cross-package imports for external skill dependencies.
- Do not duplicate dependency declarations in frontmatter.

### How `package.json.dependencies` stays in sync

agentpack manages `package.json.dependencies` from exported skill imports, the way `go mod tidy` manages `go.mod`:

1. Read cross-package `import` statements from each exported `SKILL.md`.
2. Compare against `dependencies` in `package.json`.
3. Add any required package entries that are missing.
4. Remove any `dependencies` entries that are no longer referenced by those imports.
5. Write the updated `package.json`.

This sync runs automatically inside `agentpack author dev`. `agentpack publish validate` checks alignment but does not write. You never edit `dependencies` by hand for skill edges.

Same-package imports do not generate dependency entries. Only cross-package imports produce `dependencies` entries.

### Inspecting and validating multi-skill packages

```bash
# Inspect a specific exported skill by path
agentpack author inspect domains/brand/skills/value-copywriting

# Inspect by canonical ID
agentpack author inspect @acme/brand:value-copywriting

# Validate the entire package (checks all exports)
agentpack publish validate domains/brand

# Dev mode for a specific exported skill
agentpack author dev domains/brand/skills/value-copywriting
```

`publish validate` checks all exports discovered from the filesystem:

- Each discovered `SKILL.md` parses correctly.
- All cross-package skill imports are reflected in `dependencies`.
- `files` includes the exported skill paths.
- Package identity fields (`name`, `version`, `repository`, `publishConfig`) are present.

`author inspect` shows the skill graph for one exported skill, including its source bindings and skill-import edges.

### Internal edges between co-exported skills

Skills within the same package can depend on each other through same-package imports:

```markdown
```agentpack
import editorial from skill "@acme/brand:editorial-principles"
```

Follow the [editorial principles](skill:editorial){context="baseline style rules that all copy must satisfy"}.
```

This creates a same-package edge. Because both skills ship in `@acme/brand`, no `dependencies` entry is generated. The skill graph still records the edge for staleness propagation and visualization.

### Cross-package edges from a multi-skill package

When an exported skill depends on a skill in a different package, declare it with an import:

```markdown
```agentpack
import provost from skill "@acme/methodology:gary-provost"
```
```

After running `agentpack publish validate`, the package.json will contain:

```json
{
  "dependencies": {
    "@acme/methodology": "^1.0.0"
  }
}
```

Multiple exported skills can import different skills from the same external package. The dependency appears once in `package.json`.

## Common Mistakes

### CRITICAL Putting all skills in one mega-package

Wrong: one package with skills from unrelated domains.

```json
{
  "name": "@acme/everything",
  "agentpack": {
    "root": "skills"
  }
}
```

Correct: split by domain boundary.

```json
// @acme/brand package
{
  "name": "@acme/brand",
  "agentpack": {
    "root": "skills"
  }
}

// @acme/engineering package
{
  "name": "@acme/engineering",
  "agentpack": {
    "root": "skills"
  }
}
```

A mega-package forces every consumer to install every skill even when they only need one domain. Version bumps in unrelated skills force unnecessary upgrades across all consumers.

### CRITICAL Missing `agentpack.root` for named exports

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
  "files": ["SKILL.md", "skills/"],
  "agentpack": {
    "root": "skills"
  }
}
```

Without `agentpack.root`, the toolchain only discovers the root `SKILL.md` as the primary export. Named exports under subdirectories are invisible unless `agentpack.root` points to the directory that contains them.

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

Correct: author cross-package imports in each `SKILL.md`.

```markdown
```agentpack
import provost from skill "@acme/methodology:gary-provost"
import research from skill "@acme/research:fact-checking"
```
```

`package.json.dependencies` is managed output. agentpack derives it from exported skills' cross-package imports during `author dev`. `publish validate` checks alignment but does not write. Manual edits will be overwritten on the next `author dev` run.

Source: docs/schema-package-json.mdx

### HIGH Mismatched directory name and SKILL.md name

The directory name under `agentpack.root` is cosmetic -- the export name comes from the `name` field in `SKILL.md` frontmatter. But keeping them aligned avoids confusion:

Wrong:

```
skills/
  copywriting/
    SKILL.md   # name: value-copywriting
```

Correct:

```
skills/
  value-copywriting/
    SKILL.md   # name: value-copywriting
```

### MEDIUM Treating imports as optional for cross-package dependencies

Wrong: describing an external dependency in prose but never declaring the import.

```markdown
```agentpack
import research from skill "@acme/research"
```
```

If the external skill is part of the package contract, declare the import explicitly so agentpack can sync the package dependency and the compiled graph edge.

Correct: declare the import and reference it in the body when needed.

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
    "root": "skills"
  }
}
```

Correct:

```json
{
  "files": ["SKILL.md", "skills/"],
  "agentpack": {
    "root": "skills"
  }
}
```

The `files` array controls what npm publishes. If it does not include the exported skill directories, the published package will be empty. `publish validate` checks that `files` includes the exported paths.

Source: docs/schema-package-json.mdx

## References

- `docs/schema-package-json.mdx`
- `docs/schema-skill-md.mdx`
- `docs/skill-graph.mdx`
- `docs/publishing.mdx`
