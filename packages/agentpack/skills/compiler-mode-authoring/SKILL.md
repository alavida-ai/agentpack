---
name: compiler-mode-authoring
description: Use when writing agentpack declaration blocks, source bindings, skill imports, and contextual body references in SKILL.md files for compiler-mode skill authoring.
type: core
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/schema-skill-md.mdx"
  - "alavida-ai/agentpack:docs/how-it-works.mdx"
  - "alavida-ai/agentpack:docs/docs-as-sources.mdx"
  - "alavida-ai/agentpack:docs/skill-graph.mdx"
---

# Agentpack - Compiler-Mode Authoring

## Setup

A compiler-mode SKILL.md has three structural layers:

1. YAML frontmatter (identity only)
2. The `agentpack` declaration block (source bindings, skill imports)
3. The body (agent instructions with contextual references)

Minimal compiler-mode SKILL.md:

```markdown
---
name: hello-world
description: A minimal compiler-mode skill.
---

```agentpack
```

Respond with a friendly greeting when the user says hello.
```

The `agentpack` block establishes the compiler contract even when empty. Without it, the file is a plain SKILL.md with no compiler-mode semantics.

## Core Patterns

### The `agentpack` declaration block

The declaration block is a fenced code block with the language tag `agentpack`. It appears immediately after the closing `---` of the frontmatter, before the body text. It contains two kinds of statements: source bindings and skill imports.

```markdown
```agentpack
source tone = "domains/brand/knowledge/tone-of-voice.md"
source selling = "domains/brand/knowledge/selling-points.md"
import research from skill "@alavida/research"
import editorial from skill "@acme/editorial-principles"
```
```

Rules:

- One statement per line.
- Source bindings and imports can appear in any order.
- The block must be a fenced code block with exactly the language tag `agentpack`.
- There is exactly one `agentpack` block per SKILL.md.

### Source bindings

A source binding maps an alias to a repo-relative file path. The syntax is:

```
source <alias> = "<repo-relative-path>"
```

Example:

```agentpack
source tone = "domains/brand/knowledge/tone-of-voice.md"
source sellingPoints = "domains/value/knowledge/selling-points.md"
```

Key rules:

- The alias is a camelCase identifier used later in body references.
- The path is always relative to the repository root, never relative to the skill directory.
- The file at the path must exist when you run `agentpack publish validate` or `agentpack author build`.
- A single knowledge doc can be a source for multiple skills across different directories.
- Source bindings create source-usage edges in the compiled skill graph.
- Source hashes are recorded during validation so staleness can be detected later.
- Do not duplicate source bindings in frontmatter. The `source` statements are the authored source of truth.

### Skill imports

A skill import declares a dependency on another published skill. The syntax is:

```
import <alias> from skill "<package-specifier>"
```

The package specifier is an npm-style reference. For packages that export a single default skill:

```agentpack
import provost from skill "@alavida/methodology-gary-provost"
import valueCopy from skill "@alavida/value-copywriting"
```

For packages that export multiple skills, use the colon-separated canonical form:

```agentpack
import editorial from skill "@acme/writing-toolkit:editorial-principles"
```

Key rules:

- The alias is a camelCase identifier used later in body references.
- Cross-package imports must have a matching entry in `package.json` dependencies so npm can fetch the owning package.
- Same-package imports (skills within the same package) do not need extra package dependencies.
- `agentpack author dev` syncs `import` statements into `package.json` dependencies automatically. `agentpack publish validate` checks alignment but does not write. You never edit `package.json` dependencies by hand for skill edges.
- Skill imports create skill-usage edges in the compiled skill graph.
- Do not duplicate skill dependencies in frontmatter. The `import` statements are the authored source of truth.

### Contextual body references

After the `agentpack` block closes, the body contains agent instructions. You reference declared sources and imports using contextual links. The syntax is:

```
[display text](source:<alias>){context="<why this reference matters>"}
[display text](skill:<alias>){context="<why this reference matters>"}
```

Examples:

```markdown
Apply [tone guidance](source:tone){context="primary source of tone constraints for customer-facing copy"}.
Ground this in [current selling points](source:sellingPoints){context="primary source material for value messaging"}.
Use [Provost guidance](skill:provost){context="sentence rhythm and cadence guidance for final copy"}.
```

Key rules:

- The alias after `source:` or `skill:` must match a declaration in the `agentpack` block.
- The `context` attribute tells the compiler (and the agent) why this reference matters at this point in the instructions.
- Every source binding and skill import should have at least one body reference. Unused declarations are dead weight.
- Body references create the actual edges in the compiled skill graph. The declaration alone establishes the binding; the body reference records where and why it is used.

### Complete authored example

```markdown
---
name: value-copywriting
description: Write copy aligned with Alavida's value messaging and tone.
---

```agentpack
import provost from skill "@alavida/methodology-gary-provost"
source sellingPoints = "domains/value/knowledge/selling-points.md"
source toneOfVoice = "domains/value/knowledge/tone-of-voice.md"
```

Use [Provost guidance](skill:provost){context="sentence rhythm and cadence guidance for final copy"}.
Ground this in [current selling points](source:sellingPoints){context="primary source material for value messaging"}.
Apply [tone of voice](source:toneOfVoice){context="tone constraints for the final copy"}.
```

### Validate and build

Run `publish validate` to check structural correctness and record source hashes:

```bash
agentpack publish validate path/to/skill-package
```

Validation checks:

- Each discovered export `SKILL.md` parses correctly
- Declared source files exist at the specified repo-relative paths
- Imported skills align with package dependencies
- Package metadata (name, version, repository, publishConfig) is complete

Run `author build` to produce the compiled semantic graph:

```bash
agentpack author build path/to/skill-package
```

`author build` always writes `.agentpack/compiled.json`. `publish validate` writes it when given a specific target but not when validating all packages. The compiled state records the full semantic state: source hashes, skill edges, body reference contexts, and compilation timestamps.

### Authored vs. compiled SKILL.md

| Concern | Authored SKILL.md | Compiled output |
|---|---|---|
| Who writes it | You (or an agent) | The compiler toolchain |
| Contains `agentpack` block | Yes | No (resolved into compiled.json) |
| Contains body references | Yes, with `{context="..."}` | Resolved into plain markdown |
| Source paths | Repo-relative strings | Hashed and recorded in compiled.json |
| Skill imports | `import X from skill "..."` | Resolved to canonical skill IDs |
| Where it lives | `skills/<name>/SKILL.md` in the package | `.claude/skills/` and `.agents/skills/` after materialization |

The authored SKILL.md is what you write and commit. The compiled output is what agents read at runtime after materialization. You never edit compiled output directly.

### Package layout

A complete compiler-mode skill package:

```
my-skill-package/
  package.json          # name, version, agentpack.root, dependencies
  SKILL.md              # primary export (authored artifact with agentpack block)
  skills/
    my-skill/
      SKILL.md          # named export (authored artifact with agentpack block)
  .agentpack/
    compiled.json       # generated by validate/build (commit this)
```

The root `SKILL.md` is the primary export. Named exports are discovered from the `agentpack.root` directory:

```json
{
  "name": "@my-org/my-skill-package",
  "version": "1.0.0",
  "files": ["SKILL.md", "skills"],
  "agentpack": {
    "root": "skills"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/my-org/my-repo.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

## Common Mistakes

### CRITICAL Using paths relative to the skill directory

Wrong:

```agentpack
source tone = "knowledge/tone-of-voice.md"
```

Correct:

```agentpack
source tone = "domains/brand/knowledge/tone-of-voice.md"
```

Source paths are always relative to the repository root, not the skill directory. Running `publish validate` from the wrong directory compounds this error because it resolves paths from the current repo root.

Source: docs/docs-as-sources.mdx

### CRITICAL Missing agentpack block in compiler-mode skill

Wrong:

```markdown
---
name: my-skill
description: Does something.
---

Follow the guide to do the thing.
```

Correct:

```markdown
---
name: my-skill
description: Does something.
---

```agentpack
source guide = "docs/guide.md"
```

Follow [the guide](source:guide){context="primary instructions for the thing"}.
```

Without the `agentpack` block, the file is a plain SKILL.md. The compiler has no source bindings or skill imports to resolve, no edges to build, and no hashes to track. Staleness detection will not work.

Source: docs/how-it-works.mdx

### HIGH Body reference alias does not match declaration

Wrong:

```agentpack
source toneOfVoice = "domains/brand/knowledge/tone-of-voice.md"
```

```markdown
Apply [tone guidance](source:tone){context="voice constraints"}.
```

Correct:

```agentpack
source toneOfVoice = "domains/brand/knowledge/tone-of-voice.md"
```

```markdown
Apply [tone guidance](source:toneOfVoice){context="voice constraints"}.
```

The alias in `(source:<alias>)` or `(skill:<alias>)` must exactly match the identifier declared in the `agentpack` block. Mismatched aliases produce broken edges in the compiled graph.

Source: docs/skill-graph.mdx

### HIGH Editing package.json dependencies instead of using imports

Wrong:

```json
{
  "dependencies": {
    "@alavida/methodology-gary-provost": "^1.0.0"
  }
}
```

Correct:

```agentpack
import provost from skill "@alavida/methodology-gary-provost"
```

The `import` statement in the `agentpack` block is the authored source of truth. `package.json` dependencies are the managed cross-package mirror, synced automatically by `agentpack author dev`. `agentpack publish validate` checks alignment but does not write. Never hand-edit package dependencies for skill edges.

Source: docs/skill-graph.mdx

### HIGH Forgetting the context attribute on body references

Wrong:

```markdown
Use [Provost guidance](skill:provost).
```

Correct:

```markdown
Use [Provost guidance](skill:provost){context="sentence rhythm and cadence guidance for final copy"}.
```

The `{context="..."}` attribute tells the compiler why this reference matters at this point in the instructions. Without it, the edge exists but carries no semantic weight for staleness analysis or graph inspection.

Source: docs/skill-graph.mdx

### MEDIUM Declaring sources without body references

Wrong:

```agentpack
source tone = "domains/brand/knowledge/tone-of-voice.md"
source selling = "domains/brand/knowledge/selling-points.md"
```

```markdown
Write brand-consistent copy.
```

Correct:

```agentpack
source tone = "domains/brand/knowledge/tone-of-voice.md"
source selling = "domains/brand/knowledge/selling-points.md"
```

```markdown
Apply [tone guidance](source:tone){context="primary source of tone constraints"}.
Ground messaging in [selling points](source:selling){context="value propositions for copy"}.
```

Every declared source and import should be referenced in the body. Orphaned declarations bind the file to a source without explaining where or why it is used.

Source: docs/docs-as-sources.mdx

### MEDIUM Missing root SKILL.md or agentpack.root

Wrong:

```json
{
  "name": "@my-org/my-skill",
  "version": "1.0.0"
}
```

Correct (single-skill package with root SKILL.md):

```json
{
  "name": "@my-org/my-skill",
  "version": "1.0.0",
  "files": ["SKILL.md"]
}
```

Correct (multi-skill package with named exports):

```json
{
  "name": "@my-org/my-skill",
  "version": "1.0.0",
  "files": ["SKILL.md", "skills"],
  "agentpack": {
    "root": "skills"
  }
}
```

Without a root `SKILL.md` (primary export) or `agentpack.root` (named exports), the package has no exported skill modules. `publish validate` will find nothing to validate.

Source: docs/how-it-works.mdx

## References

- `docs/schema-skill-md.mdx`
- `docs/how-it-works.mdx`
- `docs/docs-as-sources.mdx`
- `docs/skill-graph.mdx`
