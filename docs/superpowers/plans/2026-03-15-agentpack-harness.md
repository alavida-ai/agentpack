# Agentpack Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full automated harness environment for agentpack so parser/compiler work, runtime materialization, dashboard verification, and real sandbox smoke tests can all run without manual testing.

**Spec:** `docs/superpowers/specs/2026-03-15-agentpack-harness-design.md`

## Stress-Test Findings Built Into This Plan

- The harness needs a stable TLC bootstrap script; relying on an ad hoc jar path in `/tmp` is not acceptable.
- The dashboard harness needs deterministic selectors and stable graph test hooks, or Playwright will become brittle.
- Live sandboxes should be smoke suites, not always-on fast feedback gates.
- Repo-lab scenarios must replace the current fixture sprawl before large compiler refactors start.

## File Structure

- Create: `scripts/setup-tla.sh`
- Create: `scripts/test-models.sh`
- Create: `scripts/start-test-registry.js`
- Create: `scripts/run-sandbox-suite.js`
- Create: `playwright.config.js`
- Create: `test/e2e/workbench-graph.spec.js`
- Create: `test/e2e/workbench-staleness.spec.js`
- Create: `test/integration/scenario-builder.js`
- Create: `test/integration/registry-harness.js`
- Create: `test/integration/skills-registry-install.test.js`
- Create: `test/integration/skills-registry-publish.test.js`
- Modify: `packages/agentpack/package.json`
- Modify: `test/integration/fixtures.js`
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `packages/agentpack/src/dashboard/components/InspectorPanel.jsx`
- Modify: `packages/agentpack/src/dashboard/lib/api.js`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`

## Chunk 1: Tooling Bootstrap

### Task 1: Standardize the TLA toolchain

**Files:**
- Create: `scripts/setup-tla.sh`
- Create: `scripts/test-models.sh`
- Modify: `packages/agentpack/package.json`
- Modify: `README.md`

- [ ] **Step 1: Add a stable TLC bootstrap script**

Responsibilities:
- download `tla2tools.jar` into a stable local cache path
- avoid requiring contributors to create ad hoc temp dirs
- print the resolved jar path for reuse

- [ ] **Step 2: Add a `test:models` script**

Wrap:
- `MC_InstallFlow`
- `MC_DevSession`
- `MC_SkillStatus`

Use distinct `-metadir` paths so concurrent or repeated runs do not collide.

- [ ] **Step 3: Document the TLA bootstrap flow**

Explain:
- how the jar is acquired
- how to rerun models locally
- when model checks are mandatory

- [ ] **Step 4: Run the model harness**

Run:

```bash
npm run test:models
```

Expected: PASS

## Chunk 2: Repo-Lab Scenario Builder

### Task 2: Replace fixture sprawl with a scenario builder

**Files:**
- Create: `test/integration/scenario-builder.js`
- Modify: `test/integration/fixtures.js`
- Modify: `packages/agentpack/package.json`

- [ ] **Step 1: Add failing tests for scenario-builder behavior**

Cover:
- package creation with explicit primary exports
- source file creation
- generated `SKILL.md` compiler syntax
- adapter config creation
- reading compiled and materialization state

- [ ] **Step 2: Implement `createScenario()` and related helpers**

Helpers:
- `createScenario()`
- `publishScenarioPackage()`
- `readCompiledState()`
- `readMaterializationState()`
- `assertGraphEdge()`

- [ ] **Step 3: Migrate one existing integration test to the new builder**

Use a representative skills install or inspect test as the first migration target.

- [ ] **Step 4: Run focused integration tests**

Run:

```bash
node --test test/integration/skills-install.test.js test/integration/skills-inspect.test.js
```

Expected: PASS

## Chunk 3: Registry Harness

### Task 3: Add a Verdaccio-backed registry harness

**Files:**
- Create: `scripts/start-test-registry.js`
- Create: `test/integration/registry-harness.js`
- Create: `test/integration/skills-registry-install.test.js`
- Create: `test/integration/skills-registry-publish.test.js`
- Modify: `packages/agentpack/package.json`

- [ ] **Step 1: Add failing registry integration tests**

Cover:
- publish a sandbox package to Verdaccio
- install it with `agentpack skills install`
- materialize runtime outputs
- assert registry config is isolated to the test environment

- [ ] **Step 2: Implement the registry harness**

Responsibilities:
- start Verdaccio on a dynamic port
- expose env overrides for npm and agentpack
- shut down cleanly after tests

- [ ] **Step 3: Add `test:registry` script**

Run registry-backed tests separately from the fast integration lane.

- [ ] **Step 4: Run registry tests**

Run:

```bash
npm run test:registry
```

Expected: PASS

## Chunk 4: Dashboard/E2E Harness

### Task 4: Add Playwright localhost verification for the workbench

**Files:**
- Create: `playwright.config.js`
- Create: `test/e2e/workbench-graph.spec.js`
- Create: `test/e2e/workbench-staleness.spec.js`
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `packages/agentpack/src/dashboard/components/InspectorPanel.jsx`
- Modify: `packages/agentpack/src/dashboard/lib/api.js`
- Modify: `packages/agentpack/package.json`

- [ ] **Step 1: Add deterministic test hooks to the dashboard**

Requirements:
- stable selectors for nodes, edges, inspector sections, and stale badges
- stable graph-ready signal so tests know when rendering is complete

- [ ] **Step 2: Add failing Playwright tests**

Cover:
- workbench opens on localhost
- graph renders skill and source nodes
- contextual edge labels appear
- stale indicators render after source change

- [ ] **Step 3: Add `test:e2e` script and Playwright config**

Use:
- local server boot
- headless browser
- screenshot on failure

- [ ] **Step 4: Run e2e tests**

Run:

```bash
npm run test:e2e
```

Expected: PASS

## Chunk 5: Live Sandbox Smoke Suites

### Task 5: Add sandbox runners for `agonda` and `superpowers`

**Files:**
- Create: `scripts/run-sandbox-suite.js`
- Modify: `packages/agentpack/package.json`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`

- [ ] **Step 1: Add sandbox smoke scenario definitions**

`agonda`:
- compile authored graph
- mutate one bound source
- assert stale and affected output
- run `dev` on one representative skill

`superpowers`:
- compile converted skill subset
- assert contextual graph edges
- run `dev` on one representative root

- [ ] **Step 2: Implement `test:sandboxes`**

Requirements:
- skip gracefully with a clear message if a local sandbox path is unavailable
- support running one sandbox or both
- keep this lane separate from fast unit/integration feedback

- [ ] **Step 3: Run sandbox smoke suite**

Run:

```bash
npm run test:sandboxes
```

Expected: PASS when local sandbox repos are available and configured

## Chunk 6: Top-Level Test Command Surface

### Task 6: Wire the full harness into package scripts and docs

**Files:**
- Modify: `packages/agentpack/package.json`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`

- [ ] **Step 1: Add the final script surface**

Scripts:
- `test:models`
- `test:unit`
- `test:integration`
- `test:registry`
- `test:e2e`
- `test:sandboxes`
- `test`

- [ ] **Step 2: Define the execution order**

Recommended:
1. `test:models`
2. `test:unit`
3. `test:integration`
4. `test:registry`
5. `test:e2e`
6. `test:sandboxes`

- [ ] **Step 3: Document contributor expectations**

Make it explicit that:
- manual testing is not the required verification path
- new work should extend the harness rather than bypass it

- [ ] **Step 4: Run the complete harness**

Run:

```bash
npm test
```

Expected: PASS

## Remaining Issues Before Implementation

After stress testing the plans, only three non-product issues remain:

- We should decide whether `test:sandboxes` is required on every PR or only in a slower lane. My recommendation is slower lane.
- We should keep the initial Playwright assertions narrow and deterministic; do not start with visual-diff testing.
- We should implement the harness plan before the main compiler plan, at least through Chunk 4, so the compiler work lands into a usable test environment.

No additional product or architecture design work is required before implementation.
