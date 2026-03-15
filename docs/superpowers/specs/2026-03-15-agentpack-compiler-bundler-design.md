# Agentpack Compiler/Bundler Redesign

## Summary

Redefine agentpack as a compiler/bundler and runtime materializer for source-backed skills.

Agentpack should no longer try to be a plugin framework or rely on filesystem discovery as semantic truth. Instead, it should compile explicit skill declarations, explicit source bindings, and explicit in-body usage contexts into one canonical semantic artifact. Runtime outputs, graph visualization, staleness analysis, install flows, and local dev workflows should all consume that compiled artifact.

## Product Scope

Agentpack becomes responsible for:

- defining a skill language inside `SKILL.md`
- resolving package-backed skill imports
- binding repo-local source files for provenance and staleness
- compiling a semantic model of skills, sources, imports, and usage relationships
- computing staleness and affected downstream relationships from source changes
- producing one canonical compiled artifact in `.agentpack`
- materializing compiled skills into runtime-specific targets through adapters
- powering graph inspection and visualization from compiled semantics

Agentpack is explicitly not responsible for:

- plugin build/dev/validate workflows
- Claude plugin artifacts
- ad hoc repo scanning as a source of dependency truth
- inferring skill or source relationships from prose without explicit syntax

## Design Principles

- **Compiler first**: parse, resolve, analyze, compile, then materialize
- **Explicit declarations**: no hidden dependency or provenance inference
- **One canonical truth**: all commands consume compiled state
- **Strict semantics**: undeclared usage and unresolved references are compile errors
- **Human-readable source files**: `SKILL.md` remains readable to humans and AI
- **Adapters at the edge**: runtimes are outputs, not core semantics
- **Visualization downstream**: graph UI consumes compiled semantics instead of inventing its own graph

## Primary User Stories

1. As a skill author, I can declare skill dependencies and source provenance explicitly in `SKILL.md`, so the compiler can build a reliable graph without guessing from prose.
2. As a skill author, I can reference imported skills and bound sources inside the body with explicit usage context, so humans, AI, and the graph understand how each dependency is used.
3. As a maintainer, I can see exactly which source files a skill depends on and how they are used, so source changes produce precise stale and affected diagnostics.
4. As a consumer, I can run `agentpack install @alavida/prd-development`, and agentpack resolves, compiles, and materializes it into configured runtimes.
5. As a developer, I can run `agentpack dev <skill>`, and agentpack symlinks/materializes the selected skill plus its dependency closure, starts the dashboard, and keeps everything refreshed as I edit.
6. As a team, we can rely on one canonical compiled artifact in `.agentpack`, so `install`, `build`, `materialize`, `status`, `stale`, `inspect`, `dev`, and the graph UI all read the same truth.

## Skill File Shape

### Frontmatter

Frontmatter is kept minimal and document-oriented:

```yaml
---
name: prd-agent
description: Create PRDs grounded in product knowledge.
---
```

Frontmatter is not the language surface for imports, provenance, or dependency semantics.

### Agentpack Declarations Block

Each skill file contains one top-level `agentpack` declarations block:

````md
```agentpack
import prd, { proto-persona as persona } from skill "@alavida/prd-development"

source principles = "domains/product/knowledge/prd-principles.md"
source marketMap = "domains/product/knowledge/market-map.md"
```
````

This block is the compiler-readable declaration zone. Normal markdown body text is not parsed for dependency or provenance semantics except through explicit body reference syntax.

### Markdown Body

The markdown body remains human-readable instruction text for humans and AI, but uses explicit references when invoking imported skills or bound sources:

````md
# PRD Agent

Use [the PRD development method](skill:prd){context="for structuring and reviewing the PRD"}.

Use [the proto persona workflow](skill:persona){context="for shaping the target user profile before drafting the PRD"}.

Ground this in [our PRD principles](source:principles){context="primary source material for PRD guidance"}.

Use [the market map](source:marketMap){context="reference context for positioning and alternatives"}.
````

The `context` attribute is required. Agentpack does not infer edge meaning from surrounding prose.

## Language Semantics

### Skill Imports

Skill imports follow package/module semantics:

```agentpack
import prd, { proto-persona as persona } from skill "@alavida/prd-development"
```

Rules:

- `import prd from skill "@pkg"` imports the package's explicit primary skill export
- `import { exportName } from skill "@pkg"` imports a named exported subskill
- `import { exportName as localName } from skill "@pkg"` renames the named exported subskill locally
- default skill import is valid only if the package explicitly declares a primary skill export
- primary skill exports are never inferred

This matches established import patterns:

- default import for the primary export
- named import for explicit exported subskills

### Source Bindings

Sources are not modules. They are explicit bindings to repo-local files:

```agentpack
source principles = "domains/product/knowledge/prd-principles.md"
source marketMap = "domains/product/knowledge/market-map.md"
```

Rules:

- `source alias = "path"` binds a local alias to one repo-local source file
- the right-hand side is always a concrete source file path
- source bindings do not pretend that files export symbols
- the alias is used in body references and graph semantics

This keeps source provenance honest and avoids confusing file bindings with package-style skill imports.

### Body References

Body references use explicit link targets plus required contextual metadata:

```md
[the PRD development method](skill:prd){context="for structuring and reviewing the PRD"}
[our PRD principles](source:principles){context="primary source material for PRD guidance"}
```

Rules:

- `skill:<alias>` must resolve to a declared skill import
- `source:<alias>` must resolve to a declared source binding
- `context="..."` is required on every semantic reference
- bare prose mentions do not create graph edges

### Compiler Validation Rules

- undeclared body reference = compile error
- unresolved skill import = compile error
- missing source file = compile error
- duplicate alias = compile error
- skill package with no explicit primary export used as default import = compile error
- unused skill import = warning or error
- unused source binding = warning or error

## Compiler Pipeline

Agentpack follows a standard compiler/bundler pipeline:

1. **Parse**
   - parse minimal frontmatter
   - parse the `agentpack` declarations block
   - parse explicit body references and required `context`
2. **Resolve**
   - resolve skill imports against declared package exports
   - resolve source bindings against repo-local files
   - validate that body references point to declared aliases
3. **Analyze**
   - build exact usage occurrences
   - validate import forms and source binding correctness
   - compute provenance and dependency relationships
4. **Compile**
   - emit one canonical semantic artifact in `.agentpack`
5. **Materialize**
   - runtime adapters consume the compiled artifact and emit runtime-specific outputs

## Semantic Model

The canonical semantic model stores exact occurrences, not only summarized graph edges.

### Core Entities

- `SkillModule`
  - one compiled `SKILL.md`
- `SkillImport`
  - local alias
  - resolved package/export identity
- `SourceBinding`
  - local alias
  - bound source file path
- `UsageOccurrence`
  - referenced alias
  - target kind (`skill` or `source`)
  - explicit context
  - source location in file
- `CompiledGraph`
  - skill nodes
  - source nodes
  - usage occurrences
  - derived summarized edges
  - staleness state

### Canonical vs Derived Graph

Best practice is:

- canonical IR stores each individual usage occurrence
- graph/UI layers derive aggregated edges for readability

This preserves precise diagnostics, exact provenance, and exact usage contexts while still allowing a clean visual graph.

## State Model

Agentpack should use one primary compiled artifact plus a few operational state files.

### Canonical State

- `.agentpack/compiled.json`
  - canonical compiled artifact
  - contains parsed, resolved, and analyzed semantic truth
  - used by `build`, `materialize`, `status`, `stale`, `inspect`, `dev`, and graph visualization

### Operational State

- `.agentpack/install-state.json`
  - operational install and resolution state for fetched packages
- `.agentpack/materialization-state.json`
  - records adapter outputs and emitted locations
- `.agentpack/dev-session.json`
  - optional local dev/watch session state for cleanup and crash recovery

Filesystem scanning is not semantic truth. Raw filesystem layout may exist physically, but compiled state is authoritative.

## Runtime Materialization Adapters

Agentpack owns runtime materialization, but runtime specifics live in adapters.

### Adapter Model

Adapters consume compiled state and emit runtime-specific outputs.

Examples:

- `claude`
  - writes `.claude/skills/...`
- `agents`
  - writes `.agents/skills/...`
- `openclaw`
  - writes the OpenClaw-compatible runtime shape

### Design Rules

- adapters are downstream from compiled state
- adapters do not re-resolve or rediscover semantic relationships
- materialization state records emitted outputs per adapter
- cleanup and rematerialization operate from `materialization-state.json`

## Command Surface

Agentpack should keep a focused CLI:

- `agentpack build`
- `agentpack install`
- `agentpack materialize`
- `agentpack inspect`
- `agentpack status`
- `agentpack stale`
- `agentpack dev`
- graph visualization through the workbench or a dedicated graph command

### Command Behavior

#### `agentpack build`

- parse, resolve, analyze, compile
- update `.agentpack/compiled.json`
- no runtime outputs by default

#### `agentpack install <package>`

- resolve and fetch package dependencies
- update `.agentpack/install-state.json`
- rebuild `.agentpack/compiled.json`
- materialize to configured runtimes by default
- optional `--no-materialize` escape hatch for advanced workflows

#### `agentpack materialize`

- read `.agentpack/compiled.json`
- emit runtime outputs through adapters
- update `.agentpack/materialization-state.json`

#### `agentpack inspect`

- inspect compiled skills, imports, source bindings, resolved identities, and graph relationships

#### `agentpack stale`

- compare bound sources against compiled provenance
- report stale skills and affected downstream relationships

#### `agentpack dev <skill>`

`dev` remains the local testing workflow:

- resolve the selected local authored skill as the root
- compile the local graph slice needed for that skill
- materialize/symlink the root skill plus its dependency closure into configured runtimes
- start the graph/workbench dashboard
- on change:
  - rebuild compiled state
  - refresh materialized outputs
  - refresh graph/dashboard
- on exit:
  - remove recorded dev-session materializations safely

This keeps `dev` aligned with existing successful local testing behavior while making it consume compiled state rather than bespoke discovery logic.

## Visualization And Debugging

Visualization remains a first-class shipped surface, but it is downstream from compiled semantics.

The graph/workbench should show:

- resolved skill imports
- source bindings
- exact or aggregated usage contexts on edges
- stale sources
- affected downstream skills
- unresolved imports and compile diagnostics
- materialization and adapter state where useful

The graph should help both humans and agents debug the skill graph by exposing the same semantic truth the compiler uses.

## Explicit Removals

The redesign removes:

- plugin commands
- plugin manifests and bundle artifacts
- plugin-specific docs and state
- filesystem discovery as semantic truth
- legacy `requires` / `metadata.sources` authoring semantics as the new language contract

## Migration Direction

This redesign is a clean break.

Migration involves:

- rewriting `SKILL.md` files to:
  - minimal frontmatter
  - one `agentpack` declarations block
  - explicit body usage references with required context
- updating package manifests to declare:
  - exported skills
  - explicit primary/default skill export
- replacing command implementations so they consume compiled state instead of ad hoc scans
- rebuilding the graph/workbench against compiled semantic edges and occurrence aggregation

## Resulting Product Definition

Agentpack is a compiler/bundler and runtime materializer for source-backed skills.

It allows teams to:

- author explicit skill graphs
- bind real source knowledge into those skills
- detect drift and staleness
- install package-backed skill systems
- materialize them into agent runtimes
- visualize the resulting graph and provenance model

That is the new core product scope.
