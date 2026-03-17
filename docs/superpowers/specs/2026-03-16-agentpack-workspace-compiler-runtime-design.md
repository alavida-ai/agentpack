# Agentpack Workspace Compiler and Runtime Design

**Date:** 2026-03-16

## Problem Statement

Agentpack currently mixes four concerns that should be separate:

- authored `SKILL.md` source
- compiled semantic graph state
- runtime-consumable skill output
- runtime materialization into adapter directories

That coupling shows up as concrete failures:

- root `.agentpack/compiled.json` is a single flat artifact and gets clobbered by the last build
- package-level truth is incomplete for multi-skill packages because sub-skill provenance is not compiled as a first-class unit
- `author dev` and `publish validate` have ambiguous scope and can block targeted work for the wrong reasons
- the dashboard cannot reliably render graph context and package boundaries from one canonical semantic source
- runtime currently sees authored syntax instead of runtime-optimized instructions

The architecture needs to move from "commands each derive their own truth" to an explicit pipeline with clear ownership.

## Goals

- Keep the package as the compilation boundary
- Keep the repo as the graph and query boundary
- Support multi-package monorepos without compiled-state loss
- Compile multi-skill packages as full semantic units
- Generate runtime-ready skill artifacts from authored source
- Make `author dev` package-correct but skill-focused
- Preserve explicit dependency and provenance semantics
- Reduce duplicated graph logic across commands

## Non-Goals

- No runtime naming normalization redesign in this phase
- No embedded snapshots of external dependency semantics in compiled state
- No new registry or publishing protocol
- No inference of undeclared skill or source relationships from prose
- No attempt to flatten dependency content into one monolithic runtime skill artifact

## Architecture Overview

Agentpack should adopt four explicit layers:

### 1. Source Layer

Authored package source remains the current authoring format:

- package root `SKILL.md`
- named export `SKILL.md` files under `agentpack.root`
- source bindings and explicit body references in compiler-mode authoring

This layer is for humans and authoring-time tooling only.

### 2. Semantic Compile Layer

The canonical semantic index lives at repo root in:

- `.agentpack/compiled.json`

This file is a workspace index partitioned by package. It stores semantic truth for all compiled authored packages in the repo, not just the last-built package.

Each package entry owns:

- package metadata
- package root export
- all authored exports in the package
- source file records and hashes
- usage occurrences
- aggregated edges

This layer is authoritative for:

- stale detection
- dashboard graph queries
- inspect flows
- graph-aware validation and dev readers

### 3. Runtime Build Layer

Each package emits generated runtime artifacts into package-local `dist/`.

Each authored export gets its own built runtime skill artifact:

- `dist/<runtime-export-dir>/SKILL.md`

These artifacts:

- strip authoring-only syntax
- preserve runtime-relevant instructions
- rewrite skill and source references into runtime-readable language

`dist/` is generated build output and should be gitignored.

### 4. Materialization Layer

Runtime adapters consume built runtime artifacts and materialize them into runtime-specific locations such as:

- `.claude/skills/...`
- `.agents/skills/...`

Adapters should deliver built runtime output, not recompile authored source on the fly.

## Core Architectural Rules

- Compile per package, not per file
- Persist semantic truth at workspace root, partitioned by package
- Build runtime artifacts per export into package-local `dist/`
- Keep external dependencies as references only in compiled state
- Materialize selected export closure in dev, not the whole package ambiently
- Commands must consume either semantic compiled state or built runtime artifacts
- Commands must not invent their own partial graph truth by reparsing authored source ad hoc

## Compiled State Model

Root `.agentpack/compiled.json` becomes a workspace index keyed by package name.

Illustrative shape:

```json
{
  "version": 2,
  "packages": {
    "@alavida/monorepo-architecture": {
      "packageName": "@alavida/monorepo-architecture",
      "packageRoot": "domains/platform/skills/monorepo-architecture",
      "generatedAt": "2026-03-16T12:00:00.000Z",
      "rootExport": "@alavida/monorepo-architecture",
      "exports": {
        "@alavida/monorepo-architecture": {},
        "@alavida/monorepo-architecture:overview": {}
      },
      "sourceFiles": {},
      "occurrences": [],
      "edges": []
    }
  }
}
```

### Package Entry Rules

Each package entry stores only local semantics:

- authored exports from this package
- source bindings used by those exports
- occurrences emitted by those exports
- edges emitted by those exports

Cross-package targets are stored as references by canonical ID. The package entry must not embed copied metadata or semantic snapshots from external packages.

### Why This Is The Right Boundary

This keeps writes isolated and reads centralized:

- building one package updates only that package entry
- workspace readers still get one canonical file
- cross-package graph assembly happens in resolver logic, not by duplicating truth

## Runtime Build Model

When a package compiles, it also emits full package runtime output into package-local `dist/`.

Example:

```text
domains/platform/skills/agonda-architect/
  SKILL.md
  skills/
    architect/SKILL.md
    understand/SKILL.md
  dist/
    agonda-architect/
      SKILL.md
    agonda-architect-architect/
      SKILL.md
    agonda-architect-understand/
      SKILL.md
```

The exact directory naming strategy can remain compatible with the current runtime naming approach for now. Naming normalization is deferred until a real runtime adapter requires it.

### Runtime Build Rules

- build all exports in the package whenever the package compiles
- do not build only the selected export on demand
- emit one runtime artifact per export
- do not flatten dependency content into the selected export artifact

This matches normal project compilation behavior in systems like TypeScript:

- project is the build unit
- runtime entrypoint selection is a separate concern

## Command Semantics

### `author build <target>`

- resolve the target to its owning package
- compile the whole package
- update only that package entry in root `.agentpack/compiled.json`
- emit the whole package `dist/`

This is a package-truth command.

### `publish validate <target>`

- resolve the target to its owning package
- validate the whole package

Publishability is a package property, not an individual-export property.

### `author dev <target>`

- resolve the target to its owning package
- compile and rebuild the whole package in watch mode
- expose only the selected export and its dependency closure to runtime adapters
- focus workbench and runtime on the selected export

This is a package-correct but skill-focused workflow command.

### `author stale`

- no target: scan all compiled package entries in workspace state
- target: read the owning package entry and report stale state for the relevant export/package view

## Dev Focus and Closure Rules

### Skill Closure

Skill closure is:

- selected export
- all transitively imported skill dependencies reachable from that export

### Source Closure

Source closure is:

- all source bindings referenced anywhere in the selected skill closure

### Dev Runtime Behavior

`author dev` should:

- watch the current package skill files
- watch all source files in the selected closure
- rebuild package semantic state and package `dist/` automatically on change
- materialize only the selected export and transitive closure into runtime directories

`author dev` should not expose unrelated sibling exports ambiently just because they exist in the same package.

## Current Architecture to Target Architecture Mapping

### `packages/agentpack/src/application/skills/build-compiled-state.js`

Current role:

- compiles one resolved export
- emits one flat compiled artifact

Target role:

- compile whole owning package
- emit a package entry
- merge that package entry into root workspace compiled state
- trigger full package runtime build into `dist/`

### `packages/agentpack/src/infrastructure/fs/compiled-state-repository.js`

Current role:

- reads and writes one flat artifact

Target role:

- read and write a workspace index
- support replace-by-package merge semantics
- expose package-scoped reads and workspace-scoped reads

### `packages/agentpack/src/application/skills/materialize-compiled-state.js`

Current role:

- reads semantic compiled state
- asks adapters to materialize directly from it

Target role:

- resolve target package/export or selected closure
- materialize from built runtime artifacts in package `dist/`
- keep semantic state reads for graph lookup only

### `packages/agentpack/src/lib/skills.js`

Current role:

- contains mixed responsibilities for dev, stale, installed discovery, validation helpers, target resolution helpers, and runtime exposure

Target role:

- keep high-level orchestration helpers only
- move compile/build-specific logic into application services
- move runtime-closure materialization into explicit runtime build/materialization services
- reduce direct source parsing outside compile/build boundaries

### `packages/agentpack/src/application/skills/validate-skills.js`

Current role:

- validates mixed export/package results and can persist flat compiled state

Target role:

- validate package-scoped truth
- optionally refresh only the package entry in root compiled state
- keep target resolution explicit: target resolves to package, not ad hoc sibling walk behavior

### `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`

Current role:

- attempts to build workbench model from a narrow compiled shape and ad hoc fallbacks

Target role:

- read package-partitioned compiled state
- build workbench model from selected export closure
- distinguish internal sub-skills vs external dependencies from package identity
- surface occurrence contexts on edges

### `packages/agentpack/src/application/skills/build-skill-workbench-model.js`

Current role:

- builds a transitive graph from simplified package/dependency/source data

Target role:

- consume package-partitioned semantic occurrences and edges directly
- derive closure-specific workbench views
- keep UI derivation thin and semantic-layer driven

## How This Addresses Current Issues

### `#68 compiled.json only supports one package root`

Resolved by replacing flat compiled state with a package-partitioned workspace index.

### `#65 sub-skill source bindings missing from compiled graph`

Resolved by making package compilation the semantic unit and compiling all exports in the package.

### `#66 dashboard should show context annotations on graph edges`

Resolved by keeping occurrence context in canonical semantic state and reading it directly in workbench model construction.

### `#71 visually distinguish external package dependencies from internal sub-skills`

Resolved by preserving package boundaries in compiled state. Internal vs external is then a package identity comparison instead of a UI guess.

### `#74 compile SKILL.md to runtime-optimized output`

Resolved by introducing a real runtime build layer into package `dist/` with one built artifact per export.

### `#73 author dev validates all skills in package`

This becomes explicit instead of accidental:

- package truth commands remain package-scoped
- dev runtime exposure remains selected-skill scoped

### `#69 validator requires empty agentpack block on skills with no imports`

Package membership becomes a first-class semantic signal. Modern no-import skills can be accepted as package-scoped compiler-mode artifacts without forcing empty declaration blocks.

### `#72 author build fails with relative paths`

Target resolution becomes a clearer package-resolution concern and can be fixed independently inside the new package-centric command contract.

### `#70 skills list misses workbench-level dependencies`

Installed discovery remains a separate concern, but the resulting installed packages can be joined cleanly into the same graph-reading model once discovered.

### `#67 skills list should warn when newer versions are available`

This remains an inventory concern and stays separate from semantic compile architecture. The new layering does not block it.

## Maintainability Stress Test

This design simplifies the system by centralizing the right elements and decentralizing the right elements.

### Centralized

- semantic graph truth in one workspace index
- runtime build responsibility in one explicit build layer
- adapter delivery behind one materialization step

### Decentralized

- authored source remains package-owned
- runtime output remains package-owned
- package compilation remains isolated to one package entry update

### Why This Is Simpler Than Today

Today, too many commands each construct their own partial reality:

- some read authored source directly
- some trust the flat compiled artifact
- some derive runtime behavior from materialization state

The target architecture reduces this to two canonical read surfaces:

- semantic truth: root `.agentpack/compiled.json`
- runtime truth: package `dist/`

That reduces duplicated parsing, hidden coupling, and shape drift.

### Failure Containment

- one package rebuild rewrites one package entry
- one package rebuild rewrites one package `dist/`
- unrelated packages are not clobbered

### Extensibility

New adapters become easier because they can consume built runtime output instead of source authoring syntax.

New graph UI features become easier because they can consume semantic occurrences and edges without reverse-engineering intent from runtime or filesystem state.

Future package publish and install flows remain compatible because package entries map cleanly onto published package boundaries.

## Tradeoffs

### Root Workspace Index vs Per-Package `.agentpack`

Chosen:

- root workspace index, partitioned by package

Reason:

- workspace graph queries become straightforward
- dashboard and stale stay simple
- cross-package references remain first-class

Per-package `.agentpack` would improve physical isolation but would force every workspace-level reader to discover and merge state files repeatedly.

### Package-Wide Build vs Selected-Export-Only Build

Chosen:

- package-wide build

Reason:

- package is the correctness boundary
- selected-export-only build would reintroduce partial package truth

### Full-Package Runtime Exposure in Dev vs Closure-Only Exposure

Chosen:

- closure-only exposure in dev

Reason:

- avoids ambient sibling availability
- keeps runtime focused
- catches hidden dependency assumptions

### Semantic IR vs Runtime Artifacts in One File

Chosen:

- keep them separate

Reason:

- semantic compiled state stays stable and inspectable
- runtime output can evolve independently by adapter/runtime need

### Precompute Global Graph vs Derive on Read

Chosen initially:

- store package-local semantics only
- derive global workspace views on read

Reason:

- simpler state model
- simpler invalidation
- easier debugging

## Migration Plan

### Phase 1: Package-Partitioned Semantic State

- replace flat compiled artifact shape with workspace index keyed by package
- compile package instead of single export
- merge one package entry per build

### Phase 2: Runtime Build Layer

- introduce package-local `dist/`
- emit one runtime artifact per export
- keep adapters ready to consume built output

### Phase 3: Dev and Validation Semantics

- make build and validate package-scoped explicitly
- make dev package-rebuilding but skill-focused
- implement closure-based runtime exposure

### Phase 4: Dashboard and Inventory Integration

- workbench reads closure-aware semantic graph
- render edge contexts
- distinguish internal vs external dependencies
- integrate installed discovery and version warnings on top

## Verification Plan

Use the harness layers already defined in `docs/superpowers/specs/2026-03-15-agentpack-harness-design.md`.

### Parser and Compiler Golden Tests

- modern no-import skills in multi-skill packages
- package-wide compilation of multi-export packages
- package-partitioned compiled state merge behavior
- runtime build output stripping authoring syntax

### Repo-Lab Integration Harness

- `author build` updates only one package entry
- `publish validate` validates whole package truth
- `author dev` rebuilds whole package and exposes selected closure only
- `author stale` works across multiple package entries

### Dashboard and E2E Harness

- edge contexts visible
- external package dependencies visually distinct from internal sub-skills
- selected export closure reflected in workbench model

## Decision Summary

- package is the compilation boundary
- repo root is the semantic graph boundary
- root `.agentpack/compiled.json` is a workspace index partitioned by package
- package `dist/` is generated runtime output
- package builds emit full package `dist/`
- dev rebuilds whole-package truth automatically
- dev exposes only the selected export plus transitive skill and source closure
- external dependencies remain references-only
- runtime naming normalization is deferred
