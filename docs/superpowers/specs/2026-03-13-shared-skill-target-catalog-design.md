# Shared Skill Target Catalog Design

**Date:** 2026-03-13

## Goal

Fix the open `skills` command regressions around multi-skill packages and local authored discovery by replacing command-specific target parsing with one shared package-and-export catalog, while deliberately shaping that catalog so wrapper-skill support can land cleanly afterward.

This design directly addresses issue cluster `#24` through `#28` and lays the metadata and resolver foundation for `#29`.

## Problem

The current CLI has one domain concept in the model layer and a different concept in the command layer.

At the model layer, the repo already understands that a package may export multiple skills through `package.json > agentpack.skills`. At the command layer, `inspect`, `validate`, `dev`, workbench startup, graph building, stale checks, and authored catalog generation still rely on narrower assumptions such as:

- a packaged skill is a directory containing both `SKILL.md` and `package.json`
- package lookup by name implies a root `SKILL.md`
- no-arg authored discovery means "find directories with sibling `SKILL.md` and `package.json`"
- `skills dev` can resolve only when `package.json` is adjacent to the selected `SKILL.md`

Those assumptions create the current regressions:

- `skills dev` cannot target multi-skill packages or individual exports inside them
- `skills validate` cannot target multi-skill packages or individual exports inside them
- `skills validate` without args ignores locally authored multi-skill packages
- `inspect`, `validate`, and `dev` disagree about what the same target means

Separately, the `intent` wrapper script is effectively an unowned shim. It imports a package entrypoint but does not participate in the same style of explicit contract ownership as the rest of the CLI, which is why the `@tanstack/intent` upgrade regressed silently.

## Desired Outcome

The CLI should have:

- one shared way to discover authored and installed skill packages
- one shared way to resolve user targets into package and export objects
- one shared representation for single-skill and multi-skill packages
- command-specific behavior expressed as policy after resolution, not as duplicated filesystem heuristics
- a future-proof place to attach wrapper metadata such as `wraps`
- a small, explicit contract for the bundled `intent` binary

## Scope

### In scope

- unify target resolution for `inspect`, `validate`, `dev`, workbench startup, and authored discovery
- treat root `SKILL.md` packages as the single-export case of a package export model
- support package directory, package name, skill directory, and `SKILL.md` targets consistently
- make no-arg `skills validate` include authored multi-skill packages
- add wrapper metadata support in the skill model and inspection surface as architecture groundwork for `#29`
- repair the `intent` binary wrapper contract after the `@tanstack/intent` upgrade

### Out of scope

- full `skills wrap` scaffolding in this patch
- automatic wrapper regeneration
- custom package-management behavior beyond npm dependency resolution

## Architecture Direction

Adopt one shared skill-package catalog and one shared target resolver.

### Core concepts

#### SkillPackage

Represents a local or installed package that exports one or more skills.

Fields:

- package root
- package metadata from `package.json`
- origin: `authored` or `installed`
- exported skills

#### SkillExport

Represents one exported skill entry from a package.

Fields:

- declared export key
- skill name from frontmatter
- description
- skill file and skill directory
- relative export path
- requires
- status metadata
- optional wrapper metadata:
  - `wraps`
  - `overrides`

Root `SKILL.md` packages are modeled as a package with one export.

#### ResolvedSkillTarget

Represents the normalized result of resolving a user target.

Fields:

- matched package
- matched export, if the target is precise
- matched exports, if the target expands to a package
- resolution source:
  - package name
  - package directory
  - skill directory
  - `SKILL.md` file
  - discovery scan

### Services

#### Skill catalog

The catalog owns discovery of authored and installed packages and conversion into `SkillPackage` objects.

Responsibilities:

- scan authored packages from repo contents
- scan installed packages from `node_modules`
- parse package metadata once
- enumerate exported skills once
- provide lookups by package name, package path, skill path, and skill file

Discovery rules:

- authored package:
  - `package.json` with `agentpack.skills`, or
  - `package.json` plus root `SKILL.md`
- installed package:
  - resolved in `node_modules` and enumerated through the same export reader

#### Target resolver

The resolver accepts raw command input and returns `ResolvedSkillTarget`.

Resolution order:

1. exact file target for `SKILL.md`
2. exact directory target for a skill directory or package directory
3. package-name target
4. no-arg discovery target set

The resolver is command-agnostic. It does not decide whether a package target is acceptable for `dev` or whether no-arg mode should be allowed. It only resolves and normalizes.

## Command Policy Layer

Commands remain distinct, but only after resolution.

### `skills inspect`

- accepts package or single-export targets
- if the target is a package with multiple exports, show package-level metadata plus the export list
- if the target is a precise export, show that export
- later, can display wrapper metadata without changing resolution rules

### `skills validate`

- accepts package, export, package name, skill directory, or `SKILL.md`
- package targets expand to all exports in that package
- no-arg mode validates all authored packages discovered by the catalog
- validation remains export-aware but can still surface package-level publication issues once per package

### `skills dev`

- uses shared resolution
- requires exactly one export after resolution
- when the target resolves to multiple exports, returns a structured ambiguous-target error listing valid export choices
- package metadata lookup walks through the resolved package, not the immediate parent directory of `SKILL.md`

### Workbench and graph features

- dev workbench startup derives its default package and export context from the same resolved package object
- graph and catalog generation stop assuming root `SKILL.md` only
- stale detection reads export-aware build-state records instead of inferring one file per package

## Wrapper Metadata Design

Wrapper support is deliberately designed into the model now so `#29` does not require another target-resolution rewrite.

### `wraps`

`wraps` is an optional frontmatter field on a `SkillExport`. In v1 it points to exactly one upstream export identity.

Recommended public shape:

```yaml
wraps: "@vendor/package:skill-name"
```

The system resolves that identity into a concrete installed export and its underlying files.

Implementation note: the parser should normalize wrapper metadata into the same internal shape regardless of whether the repo eventually prefers top-level wrapper keys or nests them under `metadata`. The public design intent is the explicit wrapped-export relationship, not a second parsing split.

### `overrides`

Optional list of override reference files that define the local customization layer.

```yaml
overrides:
  - references/brand.md
```

### Why this is not just another `source`

`metadata.sources` says "these files influenced this skill."

`wraps` says "this skill is intentionally an overlay over that upstream exported skill."

That semantic relationship matters because it lets `agentpack`:

- identify exactly which local skills depend on a changed upstream export
- show wrapper relationships in `inspect`
- mark wrapper skills stale when wrapped exports drift
- later scaffold or refresh wrapper boilerplate without guessing intent from prose

npm remains responsible for installing and updating upstream dependencies. `agentpack` uses `wraps` to interpret what those updates mean for local overlay skills.

## Build-State And Catalog Implications

The current authored catalog and build-state generation are package-root-centric. They need to become export-aware.

### Authored catalog

The generated catalog should record package entries and exported skills, not just one skill per package. A root `SKILL.md` package still serializes as one export.

### Build-state

Build-state should record per-export provenance:

- package identity
- export identity
- skill path and skill file
- source hashes
- optional wrapped export identity
- optional wrapped-source hash summary

This lets stale detection distinguish:

- direct source drift
- wrapped upstream drift
- package-level metadata drift

## Error Model

Use a smaller and more explicit set of errors:

- `skill_not_found`
- `ambiguous_skill_target`
- `invalid_skill_package`
- `invalid_validate_target`
- `invalid_wrapped_target`

The important behavior change is that valid package targets should no longer fail with misleading "package.json not found" or "skill not found" errors just because the command walked the wrong directory.

## `intent` Binary Contract

Treat `bin/intent.js` as a supported integration boundary rather than an autogenerated afterthought.

Requirements:

- invoke the actual current CLI entrypoint exposed by `@tanstack/intent`
- preserve CLI arguments and stdout/stderr behavior
- fail clearly when the dependency is missing
- cover the wrapper with a regression test that does not rely on manual `npx` behavior

This is intentionally separate from the skill catalog work. It shares the same architectural theme, though: replace implicit behavior with an explicit contract.

## File Ownership Direction

The patch should introduce small focused modules instead of adding more branches to `src/lib/skills.js`.

Target ownership:

- `src/domain/skills/skill-model.js`
  - parse frontmatter and package metadata
  - expose wrapper metadata fields
- `src/domain/skills/skill-catalog.js`
  - discover and load `SkillPackage` and `SkillExport`
- `src/domain/skills/skill-target-resolution.js`
  - resolve raw user targets to normalized objects
- `src/domain/skills/skill-graph.js`
  - build dependency graph from export-aware package data
- `src/lib/skills.js`
  - orchestrate command behavior over catalog and resolver outputs

This keeps the new architecture additive and focused.

## Testing Strategy

Protect the new boundary directly.

Tests should cover:

- catalog discovery of single-skill and multi-skill authored packages
- installed-package enumeration through the same export reader
- target resolution by package name, package directory, skill directory, and `SKILL.md`
- no-arg `validate` discovering local multi-skill packages
- `inspect`, `validate`, and `dev` agreeing on target handling
- ambiguous-target error behavior for `dev`
- wrapper metadata parsing and inspection output
- `intent` wrapper forwarding behavior

## Migration Strategy

This is an additive architecture change with command rewiring.

- existing single-skill packages continue working as one-export packages
- multi-skill packages become first-class instead of exceptional
- current public target formats remain valid, but more of them succeed consistently
- full wrapper scaffolding can land later on top of the same package/export model

## Recommendation

Implement the architecture patch in two tightly related tracks:

1. skill catalog and target resolution foundation, then command rewiring for `#24` through `#27`
2. wrapper metadata and `intent` binary contract follow-through, which addresses `#28` and prepares `#29`

This keeps the patch maintainable: one shared domain seam, one set of regression tests, and no more command-local target rules.
