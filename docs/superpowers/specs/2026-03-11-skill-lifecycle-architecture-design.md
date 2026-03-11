# Skill Lifecycle Architecture Design

**Date:** 2026-03-11

## Goal

Use the `skills validate` build-state bug as the trigger for a broader internal redesign that makes `agentpack` easier to understand, safer to change, and more maintainable in production.

The design keeps packaged skills as the first-class domain concept. Plugins remain important, but as a composition and distribution layer built on top of the shared packaged-skill core rather than as a parallel subsystem with its own implicit lifecycle logic.

## Problem

The current codebase has a conceptually simple product model but a blurry internal architecture.

The key maintenance issues are:

- shared lifecycle logic is not clearly owned
- `skills` and `plugin` command spaces appear separate even though they operate on overlapping domain concepts
- [src/lib/skills.js](/Users/alexandergirardet/alavida/agentpack/src/lib/skills.js) has become a gravity well for unrelated concerns
- command handlers, domain rules, graph reasoning, and filesystem side effects are too tightly mixed
- bugs such as build-state recording regressions are easy to patch locally but hard to locate architecturally

This makes the CLI feel brittle. The problem is not only the bug itself, but that the code does not clearly express where lifecycle truth should live.

## Desired Outcome

The CLI should have:

- packaged skills as the clear first-class citizen
- explicit ownership for skill modeling, dependency graph logic, provenance, and lifecycle rules
- plugins implemented as workflows over the skill core rather than a sibling mini-system
- commands that are thin adapters over application use cases
- a small set of state files with explicit ownership and no blurred responsibilities
- tests that protect user stories while allowing internal reshaping

## Architecture Direction

Adopt a layered internal architecture:

1. **Interface layer**
   Commander command handlers parse arguments and render output.

2. **Application layer**
   Use cases orchestrate workflows such as validating skills, listing stale skills, installing skills, inspecting plugin bundles, validating plugin bundles, and building plugin artifacts.

3. **Domain layer**
   Shared packaged-skill concepts and rules live here:
   - skill model
   - skill graph
   - provenance
   - lifecycle rules

4. **Infrastructure layer**
   File IO, package resolution, runtime materialization, watch mode, repo/workbench context, and bundle staging live here.

This design keeps business rules central and pushes process boundaries outward.

## First-Class Domain Concepts

### Packaged skill lifecycle

The primary domain concept is the lifecycle of a packaged skill:

- authored with `SKILL.md` and `package.json`
- validated against lifecycle and publication rules
- recorded into provenance/build-state
- checked for staleness when sources change
- installed and materialized into runtime-visible skill locations
- optionally vendored into plugin artifacts

### Skill graph

The secondary first-class concept is the skill dependency graph:

- direct `requires`
- reverse dependencies
- transitive closure
- affected-state propagation when dependencies become stale or incomplete

This graph logic should be shared across authoring, install, and plugin workflows.

## Layer Responsibilities

### Interface layer

Owns:

- commander definitions
- argument parsing
- output formatting
- process exit behavior

Does not own:

- dependency traversal
- lifecycle rules
- build-state logic
- filesystem write policy

### Application layer

Owns:

- workflow orchestration
- mapping user intents to domain and infrastructure calls
- consistent sequencing of validation, graph inspection, provenance recording, installation, and bundling

Representative use cases:

- `validate-skills`
- `inspect-skill`
- `list-stale-skills`
- `install-skills`
- `inspect-skills-env`
- `inspect-plugin-bundle`
- `validate-plugin-bundle`
- `build-plugin`

### Domain layer

Owns shared rule logic and canonical data shapes.

#### Skill model

Owns:

- parsing `SKILL.md`
- reading and normalizing `package.json`
- normalized skill/package records
- canonical path and package identity handling

#### Skill graph

Owns:

- dependency closure
- reverse dependencies
- graph traversal
- affected-state reasoning

#### Provenance

Owns:

- source hashing
- build-state record creation
- stale comparison
- lifecycle snapshot semantics

The build-state bug belongs here. Recording provenance after successful validation is part of the packaged-skill lifecycle contract.

#### Lifecycle rules

Owns:

- validation rules
- dependency declaration rules
- publication-readiness rules
- lifecycle consistency checks

### Infrastructure layer

Owns side effects only.

Potential responsibilities:

- repository access for skills and packages
- reading/writing `.agentpack/build-state.json`
- reading/writing `.agentpack/install.json`
- generating `.agentpack/catalog.json`
- package resolution from repo and `node_modules`
- runtime materialization into `.claude/skills/` and `.agents/skills/`
- plugin staging and vendoring
- watch mode
- repo/workbench lookup

## Plugin Relationship To The Skill Core

Plugins are not a separate lifecycle center.

Plugins should:

- discover local plugin skills
- ask shared skill-domain services for metadata, dependency closure, and lifecycle truth
- use infrastructure modules to vendor skills into a staged plugin artifact

Plugins should not:

- re-own dependency truth
- parse skill metadata differently
- invent separate provenance rules
- become a shadow lifecycle for packaged skills

In the cleaner architecture, plugin workflows are application use cases that compose the shared packaged-skill domain.

## State Over Time

The system should model a small number of explicit lifecycle states:

1. **Authored truth**
   Source files, `SKILL.md`, and `package.json` define the packaged skill.

2. **Validated snapshot**
   Successful validation records provenance in `.agentpack/build-state.json`.

3. **Source drift**
   A source file changes after validation.

4. **Stale lifecycle state**
   Current hashes differ from recorded hashes; the skill becomes stale and dependents may become affected.

5. **Installed runtime state**
   Consumer repos install skills and materialize them into agent-visible directories. This is tracked in `.agentpack/install.json`.

6. **Bundled distribution artifact**
   Plugin build workflows vendor packaged skills into a plugin artifact and record plugin bundle provenance.

These states should be explicit and command-independent.

## Required Artifact Files

### `SKILL.md`

Owns:

- authored skill instructions
- `metadata.sources`
- `requires`

Does not own:

- package version
- runtime install state
- provenance snapshot

### `package.json`

Owns:

- package identity
- version
- package dependencies
- publication configuration

Does not own:

- source provenance history
- runtime materialization state

### `.agentpack/catalog.json`

Owns:

- generated authoring-side discovery index

### `.agentpack/build-state.json`

Owns:

- recorded source hashes
- recorded requires snapshot
- lifecycle provenance snapshot for stale detection

This file is required for reliable stale detection and must not be treated as an incidental side effect of one command path.

### `.agentpack/install.json`

Owns:

- direct vs transitive install state
- runtime materialization state

This is environment-local state, not authored provenance.

### `.claude-plugin/plugin.json`

Owns:

- plugin runtime contract

### `.claude-plugin/bundled-skills.json`

Owns:

- generated plugin bundle provenance

## File Ownership Rules

These rules are necessary to keep the system legible:

- `SKILL.md` owns authored dependency truth
- `package.json` owns distribution truth
- `.agentpack/build-state.json` owns recorded provenance truth
- `.agentpack/install.json` owns environment-local install/materialization truth
- plugin metadata owns plugin packaging truth only

The architecture must avoid:

- plugin metadata becoming the source of skill dependency truth
- install state acting like provenance state
- command handlers writing state ad hoc
- build-state logic being owned by one workflow in isolation

## Recommended Module Shape

Illustrative structure:

```text
src/
  cli.js
  commands/
    skills.js
    plugin.js
  application/
    skills/
      validate-skills.js
      inspect-skill.js
      list-stale-skills.js
      install-skills.js
    plugins/
      inspect-plugin-bundle.js
      validate-plugin-bundle.js
      build-plugin.js
  domain/
    skills/
      skill-model.js
      skill-graph.js
      skill-provenance.js
      skill-rules.js
  infrastructure/
    fs/
      skill-repository.js
      build-state-repository.js
      install-state-repository.js
      package-resolution.js
    runtime/
      materialize-skills.js
      watch-tree.js
    context/
      repo-context.js
      workbench-context.js
  utils/
    errors.js
    output.js
```

This is not a rewrite mandate. It is the target architecture to guide incremental extraction.

## Design Patterns

### Layered architecture / ports-and-adapters style

Commands and filesystem concerns sit outside the domain core. The skill domain remains the center.

### Application service / use-case pattern

Each user workflow is represented by a dedicated use case instead of open-coded orchestration inside command handlers or giant helper modules.

### Value objects / canonical records

Skill metadata, package metadata, build-state entries, and graph traversal results should have canonical normalized shapes.

### Repository-style persistence boundaries

File-backed state such as build-state and install-state should be loaded and written through narrow repository modules rather than ad hoc file access across the codebase.

### Orchestration over god modules

Use cases coordinate smaller domain and infrastructure modules. No single file should own every rule and every side effect.

## Migration Strategy

This should be delivered in slices.

### Slice 1: provenance extraction and bug fix anchoring

- extract provenance/build-state logic into a dedicated shared module
- make `skills validate` and `skills stale` consume it
- preserve current command behavior
- add regression tests around build-state recording and stale detection

### Slice 2: model and graph extraction

- extract skill model and skill graph modules from the current monolith
- make plugin inspection and validation reuse those shared modules
- reduce plugin code to packaging-specific responsibilities

### Slice 3: introduce application use cases

- place workflows behind application-layer entry points
- make command handlers thin adapters
- move file/package side effects behind narrower infrastructure modules

## Verification Strategy

Use TDD at two levels:

1. **Integration tests**
   Preserve user-story and CLI-contract coverage. Fixture-driven tests remain the contract layer.

2. **Focused module tests**
   Add smaller tests for:
   - provenance record creation
   - stale comparison
   - dependency graph closure
   - affected-state propagation
   - lifecycle validation rules

Success criteria:

- the build-state bug is fixed through shared lifecycle ownership
- plugin workflows consume shared skill-domain logic
- the old monolithic ownership in `skills.js` is reduced substantially
- a maintainer can reliably tell where new logic belongs

## User Story Coverage

The design is intended to cover current user stories by mapping them to use cases rather than command buckets.

Examples:

- authored skill validation
- stale detection after source changes
- dependency visibility and affected-state reporting
- consumer installation and environment inspection
- missing and outdated dependency visibility
- plugin bundle inspection, validation, and build

Each story should have:

- one primary use case owner
- shared domain services where appropriate
- integration test coverage protecting the externally visible behavior

## Recommendation

Proceed with the broader internal redesign direction, but execute it as staged refactoring rather than rewrite-by-big-bang.

The immediate bug should be handled in the new provenance/lifecycle boundary so it improves the architecture instead of adding another localized patch.
