# Skill Dev Workbench Design

**Date:** 2026-03-11

## Goal

Turn `agentpack skills dev <path>` into a development workbench for one selected skill.

The workbench should make skill lifecycle visibility first class during local development without replacing Claude Code as the primary authoring surface.

## Problem

`agentpack` now treats skills, skill graphs, and source provenance as first-class lifecycle concepts, but local development visibility is still mostly command-line driven.

Today, an author can inspect parts of the truth with commands such as:

- `skills stale`
- `skills dependencies`
- `skills validate`
- `skills inspect`

But the current workflow has several visibility gaps:

- it is hard to see one skill's full trust chain in one place
- dependency and provenance relationships are not visually legible
- stale and affected state require mentally combining multiple command outputs
- `skills dev` links the skill for runtime testing but does not provide a workbench for understanding the selected skill as it changes

The result is that authors can test a skill locally without having a clear mental model of what it is built from, what it depends on, and how change propagates.

## Product Boundary

This feature is a local development workbench.

It is not:

- a repo-wide graph explorer
- a replacement for authoring in Claude Code
- a general-purpose skill management UI
- a publishing surface

The workbench exists to help a skill author understand one selected skill during `skills dev`.

## Desired Outcome

Running `agentpack skills dev <path>` should:

1. keep the existing sync and materialization behavior
2. start a local workbench by default
3. open a localhost dashboard unless `--no-dashboard` is passed
4. watch the selected skill and related files for changes
5. refresh the displayed graph and lifecycle state as those files change

The workbench should make it easy to answer:

- what source files this skill is built from
- what skills it directly requires
- why it is current, stale, or affected
- what changed since the recorded build state
- which relationships come from `metadata.sources` versus `requires`

## Recommended Approach

Build the real feature as a small React app backed by a local dev server, with D3 used for graph layout and rendering.

Why this approach:

- the feature has real application state: selection, active view, action results, and watch-driven refresh
- it needs interactive graph behavior, not static HTML
- D3 is appropriate for the DAG canvas, but not for overall app state management
- React keeps the control surface, inspector, and action flows coherent as the workbench grows

Alternative approaches considered:

### Server-rendered HTML plus light client JS

Viable for a quick prototype, but likely to become awkward once the workbench has graph modes, selection state, buttons, and live refresh behavior.

### Regenerated static HTML on file changes

Too limited for an interactive graph explorer and not a good foundation for a lasting development tool.

## User Experience

### Entry point

The entry point remains:

```bash
agentpack skills dev <path>
```

Default behavior:

1. resolve the selected skill
2. sync managed dependencies as current `skills dev` does
3. materialize the skill into local runtime directories as current `skills dev` does
4. start the local workbench server
5. open the dashboard in the browser
6. begin watching relevant files

Opt-out behavior:

```bash
agentpack skills dev <path> --no-dashboard
```

This keeps the current CLI-only workflow available.

### Scope

V1 is limited to one selected skill and its immediate neighborhood:

- the selected skill
- its direct provenance sources from `metadata.sources`
- its direct required skills from `requires`

V1 does not support indefinite graph navigation or repo-wide graph exploration.

### Workbench UI

The dashboard should have three main surfaces:

1. **Graph canvas**
   A DAG view centered on the selected skill.

2. **Inspector**
   A details panel driven by the current selection.

3. **Action bar**
   A small set of read-only or inspection-first lifecycle actions.

The graph should distinguish:

- source nodes
- selected skill node
- required skill nodes
- provenance edges
- dependency edges
- lifecycle state such as `current`, `stale`, and `affected`

The graph is the primary visualization, but the inspector is what makes the graph useful. Authors should not need to infer exact meaning from node labels alone.

### V1 interactions

The workbench should support:

- click a node to inspect it
- click an edge to understand why that relationship exists
- highlight a node's immediate relationships
- refresh automatically when watched files change

The workbench should not become the editing surface. Skill content remains edited in Claude Code.

### V1 actions

The dashboard should expose a small set of lifecycle actions backed by existing application logic:

- `check stale`
- `show dependencies`
- `validate skill`
- `refresh graph`

These actions are not new lifecycle systems. They are alternative entrypoints into the same underlying use cases that the CLI already owns.

## Architecture

The feature should preserve the repo's existing layered architecture.

### Interface layer

Command handlers remain thin.

`skills dev` should:

- parse flags
- call the existing dev workflow
- optionally start the workbench runtime
- print useful startup information and fallback messages

The command layer should not own graph construction, watch orchestration, or browser UI logic.

### Application layer

Add a dedicated workbench use case for a selected skill.

Responsibilities:

- resolve the selected skill
- build a canonical single-skill workbench model
- run lifecycle actions requested by the UI
- coordinate watch-triggered refreshes

Proposed application concept:

- `start-skill-dev-workbench`
- `build-skill-workbench-model`
- `run-skill-workbench-action`

The workbench model should include:

- selected skill metadata
- direct provenance sources
- direct required skills
- lifecycle status for each node
- edge kinds and human-readable explanations
- change reasons when stale or affected state exists

### Domain layer

The domain layer should remain the owner of lifecycle truth.

The workbench should reuse, not reimplement:

- skill model parsing
- dependency graph reasoning
- provenance/build-state comparison
- lifecycle status derivation

The domain layer may need new shared helpers for a focused per-skill graph model, but the graph semantics must stay domain-owned rather than presentation-owned.

### Infrastructure layer

Infrastructure owns:

- local dev server startup
- browser launch
- file watching
- event streaming or polling transport to the UI
- fallback behavior for headless environments

This is the main architectural expansion in the feature. `agentpack` becomes a hybrid CLI plus local dev-server tool for this workflow.

### Presentation layer

Add a dedicated local dashboard UI.

Recommended shape:

- React for application state and UI composition
- D3 for graph layout/rendering inside the graph canvas

Why this split:

- React is well suited for inspector state, action state, loading state, and errors
- D3 is well suited for SVG graph layout, edge paths, and node interaction

## Data Flow

The workbench should follow this flow:

1. `skills dev` resolves and materializes the selected skill
2. application builds the selected-skill workbench model
3. infrastructure starts the local server and serves the dashboard
4. UI loads the workbench model
5. file watchers observe:
   - selected skill `SKILL.md`
   - selected skill `package.json`
   - direct `metadata.sources`
   - any immediate files required to refresh direct dependency state
6. on change, application rebuilds the workbench model
7. UI refreshes the graph and inspector state

This creates a "development workbench" feel similar in structure to `next dev`, while remaining much narrower in scope.

## Failure Handling

The dashboard must not become a single point of failure for `skills dev`.

If the dashboard cannot launch:

- the core sync/materialization behavior should still succeed
- the CLI should print a clear explanation
- the CLI should suggest `--no-dashboard` when appropriate

If the environment is headless:

- skip browser launch automatically
- keep the underlying dev workflow available

If watch refresh fails:

- keep the dashboard running
- show the error in the UI
- retain the last good graph instead of dropping to an unusable state

## Testing

Follow the repo's existing rule: fixture first, failing test first, smallest implementation, docs updated when behavior changes.

### Application-level tests

Add deterministic tests for the selected-skill workbench model:

- selected skill with direct sources
- selected skill with direct required skills
- stale selected skill due to changed source
- affected dependency status when direct relationships require it
- edge typing and explanation strings

These tests should not depend on the browser.

### Integration tests

Add integration coverage for:

- `skills dev` default workbench startup
- `skills dev --no-dashboard`
- headless fallback behavior
- watch-triggered graph/status refresh behavior

### UI tests

Keep UI tests light in v1. Verify:

- graph renders the selected model
- selection updates the inspector
- action buttons call the expected local endpoints

## Open Design Constraints

These are explicit constraints for implementation:

- the dashboard is a workbench, not an authoring surface
- V1 stays scoped to one selected skill
- the graph is limited to immediate provenance and immediate required skills
- lifecycle actions reuse existing application logic
- `--no-dashboard` preserves CLI-only usage

## Recommendation

Proceed with a single-skill local workbench launched from `skills dev`, backed by:

- existing dev sync/materialization behavior
- a dedicated application use case for a selected-skill workbench model
- infrastructure for local serving and watching
- a React plus D3 dashboard

This gives `agentpack` a visibility-first development surface without blurring lifecycle ownership or replacing Claude Code as the authoring tool.
