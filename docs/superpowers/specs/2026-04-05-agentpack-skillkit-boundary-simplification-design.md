# Agentpack SkillKit Boundary Simplification Design

**Date:** 2026-04-05

## Problem Statement

Agentpack currently spans too many responsibilities:

- source-aware skill authoring and compilation
- package/runtime bundle generation
- runtime-specific materialization into local agent folders
- installed-package activation for consumer repos
- release validation under a misleading `publish validate` command name

That scope made sense while agentpack owned the full path from authored source to runtime-linked skills. It is now a poor fit for actual usage.

The current real workflow is:

- author source-backed skills
- compile a dependency-aware `dist/` bundle
- point Claude Code plugins at `./dist`
- or use SkillKit to install/sync `./dist` into `.claude/skills` and `.codex/skills`

Recent live tests confirmed that SkillKit can consume agentpack's existing `dist/` output directly for Claude Code and Codex installation, while `agentpack materialize` now overlaps with that downstream responsibility.

## Goals

- Narrow agentpack to one primary concern: compile and validate source-backed skill bundles
- Make `dist/` the stable contract between agentpack and downstream tools
- Rename `publish validate` to `validate`
- De-emphasize or deprecate materialization as a primary workflow
- Ensure built bundles are fully portable for plugins and SkillKit install flows
- Preserve source hash recording and stale detection
- Preserve cross-package dependency closure during bundle generation

## Non-Goals

- No removal of compiled-state or stale-detection logic
- No redesign of core authored skill syntax in this patch
- No attempt to replace Claude Code plugins with SkillKit
- No attempt to replace plugin-level hooks or MCP config with SkillKit
- No OpenClaw runtime redesign in this patch

## New Product Boundary

### Agentpack Owns

- authored `SKILL.md` parsing and compilation
- source bindings and source hash tracking
- cross-package dependency graph resolution
- package-scoped compiled semantic state
- portable `dist/` bundle generation
- bundle validation and release gating

### SkillKit Owns

- install from local `dist/`
- sync/install to `.claude/skills`, `.codex/skills`, and other agent-specific folders
- team manifests and downstream install orchestration
- optional translation and hosted skill distribution concerns

### Plugins Own

- Claude Code/OpenClaw plugin packaging
- plugin-specific hooks, MCP configuration, and runtime metadata
- native plugin loading by pointing `"skills"` at `./dist`

## Command Model

### Keep

- `agentpack author build <target>`
- `agentpack validate [target]`

### Deprecate

- `agentpack publish validate [target]`
- `agentpack author materialize`
- `agentpack materialize`

### Compatibility Strategy

- `publish validate` remains as a deprecated alias for one compatibility window
- `author materialize` and top-level `materialize` remain available temporarily with deprecation messaging
- docs and examples move immediately to `build -> SkillKit/plugin`

## Bundle Contract

### Bundle Boundary

The authored package is the bundle boundary.

Agentpack should stop treating the runtime bundle as only:

- generated `SKILL.md`
- copied `references/`

Instead, a built package bundle should include the package runtime payload wholesale.

### Bundle Rule

For the selected authored target:

1. Compile the selected export closure across authored package dependencies
2. Emit runtime `SKILL.md` artifacts for the closure into the target package `dist/`
3. Include the runtime-supporting folder content from the selected skill package without trying to infer individual asset references from text

The guiding rule is:

> compile everything in the skill folder/package that is part of the runtime payload; do not guess from prose

This keeps bundling simple, deterministic, and testable.

### Why Not Infer References From Text

- brittle
- ambiguous
- hard to test
- likely to miss real runtime dependencies or include irrelevant files

The simplification target is explicit package-level bundling, not path-mining from markdown prose.

## Validation Semantics

`validate` becomes the release gate for source-backed skill packages.

It should continue to own:

- structural SKILL validation
- source existence checks
- dependency alignment checks
- package metadata checks
- source hash recording for staleness detection
- bundle-readiness checks

It should not pretend to publish anything.

## Materialization Semantics

Materialization is no longer the preferred authored workflow.

For Claude Code and Codex:

- preferred local install path: `skillkit install ./dist`
- preferred plugin path: plugin manifest points to `./dist`

Materialization survives only as:

- a compatibility layer
- a fallback for runtimes that SkillKit does not cover yet

This should reduce the importance of:

- runtime-specific adapter code
- install/materialization state as a primary product story
- dev-session conflicts caused by runtime link ownership

## Installed Package Story

Agentpack currently also supports installed-package discovery from published runtime artifacts in `node_modules`.

That capability should be treated as secondary after this change.

It remains useful if:

- consumer repos still install packaged skill bundles via npm
- agentpack still needs to inspect or validate installed packages

It should not drive the main architecture or CLI framing.

## Issue Mapping

### In Scope For This Stream

- `#97` Bundle scripts/lib/data into `dist`
- `#94` Missing `dist` should fail clearly
- `#95` Local runtime activation conflict should be reduced by simplifying away agentpack-owned sync for the main workflow

### Likely Deferred

- `#93` richer frontmatter acceptance
- `#98` JSON-based instruction blocks

Those are still agentpack concerns, but they belong to the authoring language surface, not this bundle-boundary simplification patch.

## Testing Strategy

Follow the existing harness-first order, but scoped to this change:

### Parser / Compiler Golden

- no changes required unless `validate` command routing or output shape changes parser-facing tests

### Repo-Lab Integration

Add or update tests to prove:

- `author build` emits a complete portable `dist/`
- deprecation messaging for `publish validate`, `author materialize`, and `materialize` is correct
- `validate` produces the same validation semantics previously exposed through `publish validate`
- missing `dist` is surfaced explicitly for plugin-oriented flows

### External Compatibility Smoke

Add a focused integration or documented smoke script proving:

- SkillKit can install built `dist/` into Claude Code
- SkillKit can install built `dist/` into Codex

This does not make SkillKit part of the core compiler harness, but it is the key boundary this patch depends on.

## Documentation Changes

Update docs, skills, and README to tell one story:

1. `agentpack author build <target>`
2. `agentpack validate <target>`
3. use SkillKit or plugins to consume `dist`

Old wording that frames agentpack as a materialization-first runtime manager should be removed or explicitly marked legacy.

## Risks

- Existing users may rely on `publish validate` naming in scripts and docs
- Existing users may still rely on materialization-managed local workflows
- Package-wide bundling can over-include files if the package layout is noisy
- SkillKit hosted publishing currently rejects colon-named skills, so hosted distribution is not yet a full replacement for current plugin packaging

## Mitigations

- keep aliases with deprecation warnings for a compatibility window
- keep materialize commands working while removing them from the primary docs path
- document package layout expectations for portable bundles
- do not block plugin workflows on SkillKit hosted publish support

## Recommended Outcome

Agentpack should be defined as:

> a source-aware skill compiler and bundler that emits portable runtime bundles and validates their source contract

Everything after `dist/` should default to SkillKit or native plugin loading.
