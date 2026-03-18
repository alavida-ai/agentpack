# Issues 82 and 85 Convention Materialization And Dev Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix external-package navigation in `author dev` and simplify authored/installed skill discovery by replacing `agentpack.root`-driven dual-use discovery with convention-based source and compiled package layouts.

**Architecture:** Split discovery by package lifecycle stage instead of forcing one metadata field to serve both. Authored packages resolve exports from source conventions (`SKILL.md` at package root plus optional `skills/**/SKILL.md`), installed packages resolve exports from published compiled runtime artifacts under `dist/`. Workbench navigation, runtime activation, and consumer materialization all build on the same authored-first / installed-fallback target model.

**Tech Stack:** Node.js, Commander, compiler-mode `SKILL.md` parser/compiler, repo integration harness, dashboard workbench model tests.

---

## File Map

### Discovery and resolution core

- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
  - Replace `agentpack.root`-dependent package entry discovery with convention helpers for authored source packages and installed compiled packages.
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
  - Build authored package records from source conventions and installed package records from compiled `dist/` conventions.
- Modify: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`
  - Build installed graph from compiled runtime outputs instead of raw source-shaped exports.
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
  - Keep authored-package preference, but resolve installed canonical export ids and package targets cleanly.
- Modify: `packages/agentpack/src/domain/skills/workspace-graph.js`
  - Discover authored exports from root `SKILL.md` plus `skills/**/SKILL.md`, remove `agentpack.root` assumptions and related diagnostics.

### Compiled-state and workbench

- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
  - Generalize compiled package artifact building so the workbench can compile missing external packages on demand.
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
  - Resolve external targets through the shared authored/installed resolver and materialize compiled package state on demand before selecting graphs.
- Modify: `packages/agentpack/src/application/skills/inspect-compiled-skill.js`
  - Align authored/installed target resolution with the new conventions.
- Modify: `packages/agentpack/src/application/skills/compute-runtime-selection.js`
  - Only if needed to tolerate on-demand package compilation for installed packages without disturbing existing compiled-state semantics.

### Consumer runtime materialization and CLI

- Modify: `packages/agentpack/src/application/skills/runtime-activation.js`
  - Replace target-based `skills enable/disable` assumptions with workspace-level dependency materialization semantics.
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
  - Materialize compiled runtime directories from installed `dist/` outputs and preserve namespaced runtime names.
- Modify: `packages/agentpack/src/commands/skills.js`
  - Remove or de-emphasize `skills enable/disable`, keep status/list if still useful during transition.
- Modify: `packages/agentpack/src/commands/author.js`
  - Only if command descriptions or output need to mention updated authored discovery conventions.
- Create or modify: `packages/agentpack/src/commands/materialize.js` or equivalent top-level command registration site
  - Add `agentpack materialize` as the primary consumer workflow.

### Tests

- Modify: `test/application/resolve-skill-dev-workbench-model.test.js`
  - Keep red coverage for sibling external package navigation and installed external package navigation.
- Modify: `test/domain/workspace-graph.test.js`
  - Replace `agentpack.root` expectations with root-plus-`skills/` convention coverage.
- Modify: `test/domain/installed-workspace-graph.test.js`
  - Assert installed graph discovery from published `dist/` runtime outputs.
- Modify: `test/integration/skills-dev-workbench.test.js`
  - Add end-to-end workbench navigation coverage for external local or installed packages.
- Modify: `test/integration/skills-enable-disable.test.js`
  - Replace or migrate to `materialize`-oriented coverage.
- Create: `test/integration/materialize-command.test.js`
  - Cover workspace dependency scanning, transitive closure handling, and namespaced runtime outputs.
- Modify: `test/integration/fixtures.js`
  - Update fixture normalization to stop injecting `agentpack.root`.

### Docs and bundled skills

- Modify: `docs/schema-package-json.mdx`
  - Remove required `agentpack.root` config guidance.
- Modify: `docs/how-it-works.mdx`
  - Replace `skills enable` workflow with `npm install` + `agentpack materialize`.
- Modify: `docs/publishing.mdx`
  - Document publish shape as `dist/**`-only and the compiled/runtime discovery contract.
- Modify: `docs/cli-skills.mdx`
  - Remove or deprecate `skills enable`, add `materialize`.
- Modify: `packages/agentpack/skills/compiler-mode-authoring/SKILL.md`
  - Update package layout examples to root `SKILL.md` plus optional `skills/**`.
- Modify: `packages/agentpack/skills/multi-skill-packages/SKILL.md`
  - Replace `agentpack.root` explanations with fixed `skills/` convention.

## Architecture Stress Test

### What this simplifies

- One field no longer tries to describe both source layout and published runtime layout.
- Consumer workflows stop asking users to repeat package targets already present in `package.json`.
- Workbench external navigation can reuse the same target-resolution model the rest of the system uses.

### What must stay stable

- Runtime names remain namespaced for named exports, e.g. `research-analyst:research-flow`.
- `.agentpack/compiled.json` remains the semantic source of truth after compilation.
- `author dev` still points runtimes at generated runtime artifacts, not raw authored source.

### Main risks

- Broad authored-package walking could accidentally export stray `SKILL.md` files.
  - Mitigation: restrict named export discovery to `skills/**/SKILL.md`.
- Installed-package discovery from `dist/` could diverge from source-package export naming.
  - Mitigation: derive installed export ids from runtime directory names and validate primary/named naming rules in tests.
- Replacing `skills enable` could break stateful install/materialization flows.
  - Mitigation: keep state repository compatibility while adding `materialize`, then deprecate old commands in a controlled phase.

## Phases

## Chunk 1: Lock the Behavior in Tests

### Task 1: Workbench regression coverage for issue 82

**Files:**
- Modify: `test/application/resolve-skill-dev-workbench-model.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Keep the failing workbench-model tests for sibling external and installed external navigation**

- [ ] **Step 2: Add or update an integration test that drives `author dev`, requests `/api/model?skill=<external-target>`, and expects a resolved graph instead of a dead-end error**

- [ ] **Step 3: Run focused tests to verify they fail for the current reasons**

Run: `node --test test/application/resolve-skill-dev-workbench-model.test.js test/integration/skills-dev-workbench.test.js`

Expected:
- FAIL with `compiled state not found` for sibling external package navigation without prebuild
- FAIL with `skill not found` for installed external package navigation

### Task 2: Convention-based discovery coverage for issue 85

**Files:**
- Modify: `test/domain/workspace-graph.test.js`
- Modify: `test/domain/installed-workspace-graph.test.js`
- Create: `test/integration/materialize-command.test.js`

- [ ] **Step 1: Write failing domain tests for authored discovery from root `SKILL.md` plus `skills/**/SKILL.md` without `agentpack.root`**

- [ ] **Step 2: Write failing installed-graph tests for packages whose published shape is `dist/<runtime>/SKILL.md`**

- [ ] **Step 3: Write a failing integration test for `agentpack materialize` scanning workspace dependencies and materializing transitive runtime skills**

- [ ] **Step 4: Run those tests and confirm they fail because the current code still expects `agentpack.root` and `skills enable`**

Run: `node --test test/domain/workspace-graph.test.js test/domain/installed-workspace-graph.test.js test/integration/materialize-command.test.js`

## Chunk 2: Refactor Discovery Without Changing CLI Surface Yet

### Task 3: Replace authored package discovery with conventions

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/workspace-graph.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`

- [ ] **Step 1: Add helper(s) that discover authored skill entries from package root `SKILL.md` and optional `skills/**/SKILL.md`**

- [ ] **Step 2: Remove `agentpack.root` as the source of named export discovery**

- [ ] **Step 3: Preserve current export-id and runtime-name conventions for primary and named exports**

- [ ] **Step 4: Run authored discovery tests and keep the rest of the suite red only where expected**

### Task 4: Add installed compiled-package discovery

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`

- [ ] **Step 1: Add helper(s) that read installed exports from `dist/<runtime>/SKILL.md` directories**

- [ ] **Step 2: Build installed export ids from runtime directory names and package metadata**

- [ ] **Step 3: Keep authored packages preferred over installed packages when both exist**

- [ ] **Step 4: Run target-resolution and installed-graph tests**

Run: `node --test test/domain/workspace-graph.test.js test/domain/installed-workspace-graph.test.js test/application/resolve-skill-dev-workbench-model.test.js`

## Chunk 3: Fix Workbench Navigation on the New Resolver

### Task 5: Compile missing external packages on demand for workbench selection

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/application/skills/inspect-compiled-skill.js`

- [ ] **Step 1: Generalize compiled package artifact creation so authored and installed packages can both be compiled into `.agentpack/compiled.json`**

- [ ] **Step 2: Make `resolveSkillDevWorkbenchModel` build missing package state on demand before selecting the graph**

- [ ] **Step 3: Ensure installed packages can be compiled for graph/inspect use without emitting authored runtime `dist/` outputs back into `node_modules`**

- [ ] **Step 4: Run the workbench-model and workbench integration harness until they pass**

Run: `node --test test/application/resolve-skill-dev-workbench-model.test.js test/integration/skills-dev-workbench.test.js`

## Chunk 4: Replace Consumer Activation Flow With `materialize`

### Task 6: Rebuild installed runtime activation around workspace dependency scanning

**Files:**
- Modify: `packages/agentpack/src/application/skills/runtime-activation.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
- Modify: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`

- [ ] **Step 1: Add a workspace materialization entry point that scans installed dependencies rather than requiring an explicit target**

- [ ] **Step 2: Follow transitive skill requirements through the installed compiled graph**

- [ ] **Step 3: Materialize runtime entries using namespaced runtime names, preserving collision safety**

- [ ] **Step 4: Keep materialization/install state repositories compatible enough to inspect health during the transition**

### Task 7: Add the new CLI command and migrate tests

**Files:**
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: top-level command registration files as needed
- Modify: `test/integration/skills-enable-disable.test.js`
- Create: `test/integration/materialize-command.test.js`

- [ ] **Step 1: Add `agentpack materialize`**

- [ ] **Step 2: Decide whether `skills enable/disable` become hidden aliases, hard deprecations, or are removed immediately**

- [ ] **Step 3: Update integration coverage to drive the new command as the primary workflow**

- [ ] **Step 4: Run the command-surface and runtime activation tests**

Run: `node --test test/integration/materialize-command.test.js test/integration/skills-enable-disable.test.js test/integration/skills-status.test.js`

## Chunk 5: Docs, Skills, and Full Verification

### Task 8: Update docs and bundled skills to the new conventions

**Files:**
- Modify: `docs/schema-package-json.mdx`
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/publishing.mdx`
- Modify: `docs/cli-skills.mdx`
- Modify: `packages/agentpack/skills/compiler-mode-authoring/SKILL.md`
- Modify: `packages/agentpack/skills/multi-skill-packages/SKILL.md`

- [ ] **Step 1: Remove `agentpack.root` guidance**

- [ ] **Step 2: Document source layout convention and installed `dist/` layout convention**

- [ ] **Step 3: Update consumer examples from `skills enable` to `materialize`**

- [ ] **Step 4: Regenerate any bundled dashboard or docs artifacts if the repo expects them**

### Task 9: Verification and merge readiness

**Files:**
- No new code files

- [ ] **Step 1: Run focused harness suites for discovery, workbench, and materialization**

Run: `node --test test/domain/workspace-graph.test.js test/domain/installed-workspace-graph.test.js test/application/resolve-skill-dev-workbench-model.test.js test/integration/skills-dev-workbench.test.js test/integration/materialize-command.test.js test/integration/skills-status.test.js`

- [ ] **Step 2: Run broader verification**

Run: `npm test`

- [ ] **Step 3: If the known `intent-bin` baseline failure is still present, document it explicitly and keep it out of the fix claims**

- [ ] **Step 4: Prepare PR summary grouped by**
  - discovery convention simplification
  - workbench external navigation fix
  - consumer materialization command migration

