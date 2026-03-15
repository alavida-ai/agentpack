# Agentpack Harness Design

**Date:** 2026-03-15

## Goal

Define the exact automated harness environment for rebuilding agentpack as a compiler/bundler for source-backed skill graphs, with no manual testing required.

The harness must let us:
- iterate quickly on parser/compiler behavior
- verify install/dev/staleness semantics formally
- exercise the real CLI in ephemeral repos
- test runtime materialization into `.claude`, `.agents`, and future adapters
- validate the dashboard/workbench in a headless browser
- run smoke suites against real sandbox repos:
  - `agonda`
  - `/Users/alexandergirardet/alavida/superpowers`

## Principles

- One semantic truth: `.agentpack/compiled.json`
- No manual testing as a delivery requirement
- Fast feedback at lower layers, high confidence at higher layers
- Real repos are smoke environments, not the only place behavior is discovered
- Formal state models gate stateful behavior changes

## Harness Layers

### 1. Formal Model Harness

Purpose:
- verify install, dev-session, and status propagation semantics before implementation

Scope:
- `tla/InstallFlow.tla`
- `tla/DevSession.tla`
- `tla/SkillStatus.tla`

Required tooling:
- `java`
- `tla2tools.jar`

Commands:

```bash
npm run test:models
```

Backed by:

```bash
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC ...
```

Pass criteria:
- all three models pass TLC
- any change to install/materialization/dev-session/status state requires this gate

### 2. Parser/Compiler Golden Harness

Purpose:
- lock the skill language and compiled semantic model

Scope:
- parse `SKILL.md`
- parse `agentpack` declaration blocks
- parse contextual body references
- resolve imports and source bindings
- emit compiled occurrences, edges, and diagnostics

Test style:
- golden input/output tests
- no filesystem scans
- no CLI
- exact diagnostics asserted

Target directories:
- `test/domain/`

Core cases:
- valid `agentpack` block
- primary vs named skill imports
- source bindings
- required `context`
- undeclared alias usage errors
- old `requires` / `metadata.sources` contract rejected

Commands:

```bash
npm run test:unit
```

### 3. Repo-Lab Integration Harness

Purpose:
- test the real CLI against realistic but fully synthetic repos

Scope:
- `build`
- `materialize`
- `install`
- `uninstall`
- `inspect`
- `stale`
- `status`
- `dev`

Implementation:
- every test gets a fresh temp repo
- each repo is assembled by a scenario builder, not ad hoc file writes

The scenario builder must support:
- authored packages with explicit primary exports
- multi-skill packages
- source files
- `SKILL.md` compiler syntax
- adapter configuration
- `.agentpack`, `.claude`, `.agents` directories

Target directories:
- `test/integration/`

Required helpers:
- `createScenario()`
- `publishScenarioPackage()`
- `runCLI()`
- `startCLI()`
- `readCompiledState()`
- `readMaterializationState()`
- `assertGraphEdge()`

Pass criteria:
- no test depends on ambient repo layout
- no test derives semantic truth from filesystem discovery

### 4. Registry Harness

Purpose:
- test real package install/publish flows without touching public or private production registries

Tool:
- Verdaccio

Why:
- local private npm registry
- supports publish/install/auth scenarios
- easy to run in CI and local development

Scope:
- `agentpack install @scope/pkg`
- publish source-backed skill packages
- auth/registry config resolution
- upgrade/outdated flows later

Target directories:
- `test/registry/` or `test/integration/registry-*`

Required helpers:
- `startRegistry()`
- `publishPackageToRegistry()`
- `withRegistryEnv()`

Command:

```bash
npm run test:registry
```

### 5. Dashboard/E2E Harness

Purpose:
- test the skill graph dashboard/workbench automatically

Tool:
- Playwright

Why:
- can boot a localhost server
- can inspect rendered DOM
- can assert graph labels/badges/details
- can capture screenshots
- can run headless in CI

Scope:
- `skills dev` starts workbench
- graph renders imported skills and source nodes
- contextual edge labels appear
- stale and affected states appear
- inspect panel reflects compiled graph state
- screenshots are saved on failure

Target directories:
- `test/e2e/`

Required helpers:
- `startWorkbenchScenario()`
- `awaitWorkbenchReady()`
- `openGraphPage()`
- `takeFailureScreenshot()`

Command:

```bash
npm run test:e2e
```

Note:
- yes, Playwright should test `localhost`
- it should use a `webServer` config or a harness helper that launches the local workbench server

### 6. Live Sandbox Harness

Purpose:
- validate the system against real repos with real authored content

These are smoke suites, not the main place bugs are found.

#### Sandbox A: `agonda`

Purpose:
- source-backed publishing and provenance

Must prove:
- real source bindings compile
- real source changes mark skills stale
- downstream compiled dependencies become affected
- `dev` works on representative authored skills
- publish/install pipeline works against a sandbox registry

#### Sandbox B: `superpowers`

Path:
- `/Users/alexandergirardet/alavida/superpowers`

Purpose:
- convert informal skills into explicit skill graphs

Must prove:
- converted skills compile
- contextual body usage becomes graph edges
- graph shape is useful on a real skill network
- representative `dev` sessions work
- no unresolved imports/usages remain

Command:

```bash
npm run test:sandboxes
```

## Toolchain

Required local tools:
- `node`
- `npm`
- `java`
- `rg`
- `git`
- `gh`

Project test dependencies:
- `@playwright/test`
- `verdaccio`
- `unified`
- `remark-parse`
- `unist-util-visit`

Recommended helper scripts:
- `scripts/test-models.sh`
- `scripts/start-test-registry.js`
- `scripts/run-sandbox-suite.js`

## Commands

The ideal command surface:

```bash
npm run test:models
npm run test:unit
npm run test:integration
npm run test:registry
npm run test:e2e
npm run test:sandboxes
npm test
```

Recommended meaning:
- `test:models`: TLA only
- `test:unit`: parser/compiler/domain tests
- `test:integration`: repo-lab CLI tests
- `test:registry`: Verdaccio-backed install/publish tests
- `test:e2e`: Playwright dashboard/workbench tests
- `test:sandboxes`: `agonda` + `superpowers` smoke suites
- `test`: runs all non-optional gates in CI order

## Scenario Matrix

### Highest-value Repo-Lab scenarios

1. Compile a valid source-backed multi-skill package
2. Reject legacy frontmatter-only authoring
3. Install package from registry and materialize to `.claude` and `.agents`
4. Change a bound source file and assert `stale`/`affected`
5. Run `dev`, rebuild on file change, and cleanup outputs on exit

### Highest-value `agonda` scenarios

1. Compile the repo’s authored skill graph successfully
2. Change one real knowledge file and assert stale output
3. Run `dev` on one representative authored skill
4. Open dashboard and assert source + skill edges
5. Publish/install one sandbox package through Verdaccio

### Highest-value `superpowers` scenarios

1. Compile a converted subset of skills
2. Assert contextual usage edges appear in the graph
3. Assert no unresolved imports in the converted subset
4. Run `dev` on one representative root skill
5. Open dashboard and assert graph readability on a real network

## CI Order

Recommended order:

1. `test:models`
2. `test:unit`
3. `test:integration`
4. `test:registry`
5. `test:e2e`
6. `test:sandboxes`

If runtime is a concern:
- run `test:sandboxes` in a slower lane
- keep the rest required on every PR

## What Remains After This Spec

After the harness spec is approved, the remaining work is:
- implement Chunk 0 from the compiler/bundler plan
- add the new harness scripts and dependencies
- replace the current fixture layer with the scenario builder
- add Playwright and Verdaccio configs
- wire `agonda` and `superpowers` smoke suites

There is no additional product design work required before starting harness implementation.
