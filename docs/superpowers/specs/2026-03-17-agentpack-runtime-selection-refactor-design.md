# Agentpack Runtime Selection and Dev Refactor Design

**Date:** 2026-03-17

**Depends On:** [2026-03-16-agentpack-workspace-compiler-runtime-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-16-agentpack-workspace-compiler-runtime-design.md)

## Problem Statement

The compiler/runtime architecture is now conceptually correct, but the implementation still spreads runtime exposure logic across multiple systems:

- authored-package build and compiled-state persistence
- compiled-state materialization
- installed-skill runtime activation
- `author dev` dependency walking and link management
- workbench watching and graph-model refresh

That creates three versions of effectively the same concerns:

- how a target resolves to a package/export
- how a runtime closure is computed
- how a selection of runtime artifacts gets materialized

The result is that `author dev` is still too special. It is closer to a separate runtime system than a thin orchestration layer over canonical compiler/runtime modules.

## Goals

- Make `author dev` an orchestrator over shared build, selection, and materialization services
- Remove ad hoc dependency walking and linking logic from `lib/skills.js`
- Unify authored-package materialization and installed-skill activation around one selection/materialization pattern
- Make workbench graph reads consume canonical semantic selection data instead of reconstructing graph state
- Keep package-wide build truth and selected-export-focused runtime exposure

## Non-Goals

- No redesign of installed package graph semantics in this phase
- No dashboard visual redesign in this phase
- No runtime naming normalization redesign in this phase
- No change to the semantic meaning of package compilation introduced in the 2026-03-16 spec

## Architecture Summary

The canonical flow should become:

1. Resolve target to owning package and selected export
2. Build the owning package
   - update root `.agentpack/compiled.json`
   - emit package-local `dist/`
3. Compute a runtime selection
   - package-wide selection for explicit materialize/build flows
   - selected-export transitive closure for dev flows
4. Materialize the selected built runtime artifacts into adapters
5. Let workbench/dashboard consume canonical semantic selection data

This creates a consistent model:

- build truth comes from package compilation
- selection truth comes from compiled semantic IR
- runtime exposure comes from built `dist/`
- dev coordinates those layers but does not reinterpret them

## New Shared Application Services

### 1. `build-package-use-case`

**Responsibility**

- Resolve a target to its owning package
- Compile the full package semantic state
- Persist the package entry into root `.agentpack/compiled.json`
- Emit full package runtime output into package-local `dist/`

**Primary consumers**

- `author build`
- `author dev`
- `publish validate` in compiler-backed flows
- `inspect compiled`

**Likely source**

- Refactor from [build-compiled-state.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/build-compiled-state.js)

### 2. `compute-runtime-selection-use-case`

**Responsibility**

- Read canonical package entries from root `.agentpack/compiled.json`
- Compute one of two selection modes:
  - `package`: all exports in a package
  - `closure`: selected export plus transitive skill closure plus source closure
- Return a canonical selection record suitable for:
  - adapter materialization
  - workbench graph/model building
  - dev session state

**Primary consumers**

- `author materialize`
- `author dev`
- future dashboard/workbench data loaders

**Key rule**

This is the only place authored-package closure logic should live.

### 3. `materialize-runtime-selection-use-case`

**Responsibility**

- Take a runtime selection and adapter targets
- Materialize built runtime artifacts from package `dist/`
- Remove no-longer-selected runtime links
- Persist canonical materialization state

**Primary consumers**

- `author materialize`
- `author dev`
- future selected-export runtime actions

**Key rule**

This becomes the one authored-package runtime materialization path.

### 4. `watch-package-development-use-case`

**Responsibility**

- Watch package-authored skill files
- Watch selected closure source files
- On change:
  - rebuild package
  - recompute selection
  - rematerialize selection
  - refresh workbench state

**Primary consumers**

- `author dev`

**Key rule**

The watcher does not parse skills or compute dependencies itself. It delegates to shared build/selection/materialization services.

## What Should Move Out of `lib/skills.js`

[skills.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/lib/skills.js) is currently carrying too many responsibilities and should be reduced to helper-free command orchestration utilities or deleted piecemeal as logic moves into application services.

### Remove or extract

- `resolveDevLinkedSkills`
- direct authored-package closure walking for dev
- dev-specific calls to `ensureSkillLink`
- compiler-mode detection helpers used only to decide whether dev should build
- stale readers that should live behind application use cases
- inspect helpers that should live behind application use cases
- validation helpers that should live behind application use cases

### Keep only temporarily

- session lifecycle helpers
- cleanup/reconciliation logic
- npm/install helpers that are not part of authored-package runtime selection

## Canonical Selection Shape

The runtime selection service should return a stable structure like:

```json
{
  "mode": "closure",
  "packageName": "@alavida/planning-kit",
  "selectedExportId": "@alavida/planning-kit:kickoff",
  "exports": [
    {
      "exportId": "@alavida/planning-kit:kickoff",
      "runtimeName": "planning-kit:kickoff",
      "runtimePath": "workbenches/planning-kit/dist/planning-kit:kickoff",
      "runtimeFile": "workbenches/planning-kit/dist/planning-kit:kickoff/SKILL.md",
      "packageName": "@alavida/planning-kit"
    }
  ],
  "sources": [
    {
      "path": "domains/planning/knowledge/kickoff.md",
      "usedBy": ["@alavida/planning-kit:kickoff"]
    }
  ],
  "edges": [],
  "packages": ["@alavida/planning-kit"]
}
```

This selection shape becomes the shared contract between:

- dev
- authored materialization
- workbench graph/model

## Refactor Targets by File

### Must be impacted

- [build-compiled-state.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/build-compiled-state.js)
- [build-runtime-artifacts.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/build-runtime-artifacts.js)
- [materialize-compiled-state.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/materialize-compiled-state.js)
- [start-skill-dev-workbench.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/start-skill-dev-workbench.js)
- [build-skill-workbench-model.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/build-skill-workbench-model.js)
- [runtime-activation.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/runtime-activation.js)
- [skills.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/lib/skills.js)
- [watch-skill-workbench.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/infrastructure/runtime/watch-skill-workbench.js)
- [claude-adapter.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js)
- [agents-adapter.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js)

### Likely follow-on impacts

- [inspect-compiled-skill.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/inspect-compiled-skill.js)
- [inspect-skill.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/inspect-skill.js)
- [validate-skills.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/validate-skills.js)
- [list-stale-skills.js](/Users/alexandergirardet/alavida/agentpack/packages/agentpack/src/application/skills/list-stale-skills.js)

## Refactor Plan

### Phase 1: Extract authored-package runtime selection

- Add `compute-runtime-selection-use-case`
- Move closure logic out of `lib/skills.js`
- Make `author materialize` consume explicit selection instead of raw package state only

### Phase 2: Extract authored-package materialization

- Add `materialize-runtime-selection-use-case`
- Make adapter writes consume a canonical selection contract
- Remove direct link management from dev flows

### Phase 3: Collapse dev onto shared services

- Make `startSkillDev` call:
  - build package
  - compute closure selection
  - materialize selection
- Restrict dev-owned logic to:
  - session lifecycle
  - cleanup
  - watch-loop scheduling
  - workbench startup lifecycle

### Phase 4: Move workbench watch/model to canonical state

- Replace direct file reparsing in `watch-skill-workbench.js`
- Make workbench model building consume semantic selection records
- Make changed-source tracking derive from compiled package entries and selected source closure

### Phase 5: Align installed activation where possible

- Reuse materialization primitives from authored-package flows
- Keep installed graph resolution separate where necessary
- Remove duplicate adapter application logic where possible

## Design Rules

- `author dev` may orchestrate shared services, but must not interpret skill semantics directly
- only the compiler/parser layer may decide what imports, sources, and edges mean
- only runtime build decides what runtime artifacts contain
- only runtime materialization decides how adapter links are applied and removed
- workbench graph/model reads semantic truth; it does not infer its own graph from source files

## Maintainability Benefits

If implemented fully, this refactor should produce the following improvements:

- one authored-package closure algorithm instead of a dev-only walker
- one authored-package materialization path instead of separate dev and materialize implementations
- thinner command handlers
- smaller `lib/skills.js`
- fewer opportunities for build/dev/materialize to diverge on what a package/export means
- easier future runtime adapters because they consume a stable runtime-selection contract

## Risks

### Risk: Half-centralized selection logic

If closure logic remains partly in `lib/skills.js` and partly in a new service, complexity will increase instead of decrease.

**Mitigation**

Do not introduce a new selection service without deleting the old dev-specific closure walker in the same refactor slice.

### Risk: Workbench still reparses source

If watch/workbench keeps direct `compileSkillDocument(...)` calls, the architecture remains inconsistent.

**Mitigation**

Make watcher and workbench refresh consume compiled/selection state rather than source parsing.

### Risk: Installed activation remains structurally unrelated

If authored and installed flows continue to duplicate adapter application semantics, runtime drift logic will remain harder to maintain.

**Mitigation**

Unify materialization primitives even if graph sources remain separate.

## Verification Plan

### Harness

- Add integration tests for canonical runtime selection
- Add integration tests for dev closure materialization using built `dist/`
- Add integration tests proving invalid sibling exports block package-scoped dev
- Add workbench model tests proving selected closure drives graph nodes and edges
- Add integration tests proving authored materialize and dev use the same adapter materialization semantics

### TLA+

Re-run `DevSession` TLC after the refactor.

If session ownership, cleanup, or materialized-output invariants need to change, update the model before implementation.

### Live sandbox verification

Run:

- `npm run test:sandboxes -- --no-browser-checks`

And, once localhost workbench/browser verification is stable:

- `npm run test:sandboxes`

## Acceptance Criteria

- `author dev` no longer computes closure via a custom dev-only graph walker
- `author dev` no longer links authored package directories directly
- authored-package materialization and dev runtime exposure use the same materialization service
- workbench watching does not reparse source skills directly to compute closure state
- command behavior continues to pass local harness coverage
- TLA model suite passes
- live sandbox smoke suite passes in `agonda` and `superpowers`
