# Runtime Materialization And Command Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make npm the sole package/auth interface, move installed/runtime flows onto a graph-backed model, and split the CLI into clear authoring, publishing, and consumer/runtime surfaces with minimal overlap.

**Architecture:** npm owns package fetch/version/lockfile state and registry authentication. Agentpack owns compiler-backed discovery of authored and installed skill packages plus runtime materialization state. The authored graph already exists in this branch; this batch adds an installed/runtime graph and moves consumer commands onto it. Command taxonomy becomes persona-driven: `author` for local source iteration, `publish validate` for release checks, and `skills` for installed-package discovery and runtime activation only. Agentpack no longer exposes package-management or registry-auth command spaces.

**Tech Stack:** Node.js, ESM modules, existing compiler pipeline, Node test runner, repo-lab integration harness, registry harness, TLA models only if install/dev-session state semantics change.

---

## Scope

This batch covers:

- installed package discovery from `node_modules`
- runtime materialization/enable/disable/list/status flows
- command-surface cleanup so authoring and consumption stop overlapping
- removal of `skills install` / `skills uninstall` / `skills registry` / `auth`

This batch does **not** cover:

- new compiler syntax
- dashboard redesign
- doc/content cleanup beyond command and package-model docs needed for the new runtime flow

## Target Command Model

### Authoring

- `agentpack author inspect`
- `agentpack author dev`
- `agentpack author build` (only if compiled artifact remains useful to authors)

### Publishing

- `agentpack publish validate`

### Consumption / Runtime

- `agentpack skills list`
- `agentpack skills enable`
- `agentpack skills disable`
- `agentpack skills status`

## File Structure

- Create: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`
  Installed-package graph builder for packages discovered in `node_modules`, mirroring the authored graph shape where practical.
- Create: `packages/agentpack/src/application/skills/list-installed-skills.js`
  Consumer-facing listing use case built from the installed graph.
- Create: `packages/agentpack/src/application/skills/enable-installed-skills.js`
  Materialization use case for enabling exports into runtimes.
- Create: `packages/agentpack/src/application/skills/disable-installed-skills.js`
  Dematerialization use case for disabling exports while leaving packages installed.
- Create: `test/domain/installed-workspace-graph.test.js`
  Domain coverage for installed package discovery, primary/named export indexing, and runtime target naming.
- Create: `test/integration/skills-list.test.js`
  Consumer-facing installed package listing coverage.
- Create: `test/integration/skills-enable-disable.test.js`
  End-to-end enable/disable behavior coverage across `.claude` / `.agents`.
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
  Remove local runtime naming heuristics and drive materialization from graph-owned names and identities.
- Modify: `packages/agentpack/src/lib/skills.js`
  Move installed/env/status/missing/outdated flows onto the installed graph.
- Modify: `packages/agentpack/src/commands/skills.js`
  Add `list`, `enable`, `disable`; remove `install`, `uninstall`, `registry`, `env`, `missing`, and `outdated` from the public CLI surface.
- Modify: `packages/agentpack/src/cli.js`
  Register a new `author` command group and a `publish` command group. Remove `auth`.
- Create or Modify: `packages/agentpack/src/commands/author.js`
  Move source-oriented commands here.
- Create or Modify: `packages/agentpack/src/commands/publish.js`
  Expose publish validation cleanly.
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
  Repoint any lingering package-name identity assumptions to export ids.
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
  Use export ids as the stable selected node identity.
- Modify: `packages/agentpack/src/application/skills/run-skill-workbench-action.js`
  Repoint workbench actions to `author` semantics.
- Modify: `test/integration/skills-env.test.js`
  Replace with `skills list` coverage or delete if fully superseded.
- Modify: `test/integration/skills-status.test.js`
  Assert installed vs enabled vs drift state from the installed graph.
- Modify: `test/integration/skills-missing.test.js`
  Fold into `skills status` tests or delete if fully superseded.
- Modify: `test/integration/skills-install.test.js`
  Replace with npm install + `skills enable` integration coverage.
- Modify: `test/integration/skills-uninstall.test.js`
  Replace with npm uninstall + `skills disable` integration coverage or delete if redundant.
- Modify: `test/integration/auth-commands.test.js`
  Delete or replace with a command-surface test asserting `auth` is no longer exposed.
- Modify: `test/integration/skills-registry.test.js`
  Delete; npm owns registry config.
- Modify: `test/integration/skills-registry-install.test.js`
  Reframe as npm install + `skills enable` registry harness.
- Modify: `test/integration/skills-runtime-drift.test.js`
  Keep, but drive expectations from graph-owned runtime state rather than local heuristics.
- Modify: `test/integration/skills-json.test.js`
  Add `list` / `enable` / `disable` JSON coverage and updated `status` shape.
- Modify: `docs/schema-package-json.mdx`
  Ensure installed/runtime docs reference `agentpack.root`, root primary export, and runtime activation flow.
- Modify: `docs/` and bundled skills that currently tell users to use `skills install` as the normal path.

## Core Invariants

1. npm manages package presence and auth.
2. Agentpack manages runtime activation.
3. Runtime names come from one graph-owned identity model:
   - primary export -> package namespace
   - named export -> `namespace:skill`
4. Installed skill discovery must not invent package/export semantics independently from authored discovery.
5. Consumer commands must not reinterpret filesystem layout ad hoc.
6. `author` commands operate on local source only.
7. `skills` commands operate on installed packages only.
8. `publish validate` is the release gate; it is not a consumer command.
9. `skills status` is runtime health only; it does not inspect npm registry/auth config.

## Approach Options

### Option A: Minimal rename, keep current install engine

- Keep `skills install` fetching packages internally
- Add `enable` / `disable` on top
- Low migration cost, but leaves responsibility split muddy

Why reject:
- still conflates package management and activation
- still leaves overlapping consumer commands

### Option B: Hard cutover

- Add installed graph
- Add `list` / `enable` / `disable`
- Remove `install` / `uninstall` / `registry` / `auth`
- Move authored commands under `author`

Why recommend:
- clearest architectural boundary
- removes overlapping models immediately
- matches the responsibilities split the user requested

### Option C: Softer transition
- Add installed graph and new runtime commands
- Keep deprecated wrappers temporarily

Why reject for now:
- leaves overlapping responsibilities
- keeps npm concerns inside agentpack longer than necessary

**Recommendation:** Option B.

## Harness Strategy

### Layer 1: Domain

- `test/domain/installed-workspace-graph.test.js`
- existing authored graph tests remain green

Focus:
- installed package discovery from `node_modules`
- primary export + named export indexing
- runtime name derivation from graph, not heuristics

### Layer 2: Repo-Lab Integration

- `test/integration/skills-list.test.js`
- `test/integration/skills-enable-disable.test.js`
- `test/integration/skills-status.test.js`
- updated `skills-runtime-drift.test.js`
- updated npm-install + runtime-enable integration tests

Focus:
- installed package visibility
- enabled vs disabled state
- runtime drift recovery
- consumer/runtime behavior without package fetching

### Layer 3: Registry Harness

- keep registry harness only as npm install + runtime enable verification

Focus:
- npm install through real registry
- then `agentpack skills enable`

### Layer 4: TLA

Only required if this batch changes persisted install/materialization state semantics:

- `InstallFlow.tla`
- `DevSession.tla` only if dev-session cleanup/recording behavior changes

### Layer 5: Real-Repo Verification

The batch is not complete until:

1. A package installed via npm into a controlled consumer repo is discoverable via `skills list`.
2. `skills enable <pkg>` materializes primary and named exports correctly.
3. `skills disable <pkg>` removes runtime links without uninstalling the npm package.
4. `agentpack auth` is gone.
5. `skills status` no longer reports registry/auth configuration.
6. The real authored Agonda package, once migrated to `agentpack.root`, can be:
   - published/validated from source
   - installed into a consumer sandbox
   - listed/enabled/disabled through the runtime commands

## Chunk 1: Introduce Installed Graph And New Runtime Surface

### Task 1: Add failing installed-graph tests

**Files:**
- Create: `test/domain/installed-workspace-graph.test.js`
- Modify: `test/integration/fixtures.js`

- [ ] **Step 1: Write the failing test for installed package discovery**

```js
it('discovers installed primary and named exports from node_modules', () => {
  const fixture = createInstalledMultiSkillFixture('installed-graph');
  const graph = buildInstalledWorkspaceGraph(fixture.consumer.root);

  assert.equal(graph.packages['@alavida-ai/prd-development'].primaryExport, '@alavida-ai/prd-development');
  assert.ok(graph.exports['@alavida-ai/prd-development:proto-persona']);
});
```

- [ ] **Step 2: Add runtime-name assertions**

```js
assert.equal(graph.exports['@alavida-ai/prd-development'].runtimeName, 'prd-development');
assert.equal(graph.exports['@alavida-ai/prd-development:proto-persona'].runtimeName, 'prd-development:proto-persona');
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/domain/installed-workspace-graph.test.js`
Expected: FAIL until installed graph exists.

- [ ] **Step 4: Commit the failing test scaffold**

```bash
git add test/domain/installed-workspace-graph.test.js test/integration/fixtures.js
git commit -m "test: define installed workspace graph contract"
```

### Task 2: Implement installed graph builder

**Files:**
- Create: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`

- [ ] **Step 1: Implement installed package discovery using the compiler-first package shape**
- [ ] **Step 2: Reuse package/export identity rules from the authored graph**
- [ ] **Step 3: Expose graph-owned runtime names**
- [ ] **Step 4: Run domain tests**

Run: `node --test test/domain/installed-workspace-graph.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/domain/skills/installed-workspace-graph.js packages/agentpack/src/domain/skills/skill-model.js packages/agentpack/src/domain/skills/skill-catalog.js
git commit -m "feat: add installed workspace graph"
```

## Chunk 2: Add Consumer Runtime Commands

### Task 3: Add `skills list`

**Files:**
- Create: `packages/agentpack/src/application/skills/list-installed-skills.js`
- Modify: `packages/agentpack/src/commands/skills.js`
- Create: `test/integration/skills-list.test.js`

- [ ] **Step 1: Write failing integration coverage for `skills list`**
- [ ] **Step 2: Implement the list use case from the installed graph**
- [ ] **Step 3: Render enabled runtime state per export**
- [ ] **Step 4: Run tests**

Run: `node --test test/integration/skills-list.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/application/skills/list-installed-skills.js packages/agentpack/src/commands/skills.js test/integration/skills-list.test.js
git commit -m "feat: add installed skills list command"
```

### Task 4: Add `skills enable` / `skills disable`

**Files:**
- Create: `packages/agentpack/src/application/skills/enable-installed-skills.js`
- Create: `packages/agentpack/src/application/skills/disable-installed-skills.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
- Create: `test/integration/skills-enable-disable.test.js`

- [ ] **Step 1: Write failing enable/disable integration tests**
- [ ] **Step 2: Remove local runtime naming heuristics from materialization**
- [ ] **Step 3: Materialize selected exports by graph identity**
- [ ] **Step 4: Remove materializations without touching npm install state**
- [ ] **Step 5: Run tests**

Run: `node --test test/integration/skills-enable-disable.test.js test/integration/skills-runtime-drift.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/application/skills/enable-installed-skills.js packages/agentpack/src/application/skills/disable-installed-skills.js packages/agentpack/src/infrastructure/runtime/materialize-skills.js test/integration/skills-enable-disable.test.js test/integration/skills-runtime-drift.test.js
git commit -m "feat: separate runtime enable and disable from package install"
```

## Chunk 3: Split Command Surface By Persona

### Task 5: Introduce `author` and `publish` groups

**Files:**
- Create or Modify: `packages/agentpack/src/commands/author.js`
- Create or Modify: `packages/agentpack/src/commands/publish.js`
- Modify: `packages/agentpack/src/cli.js`
- Modify: existing authored command tests

- [ ] **Step 1: Move source-oriented inspect/dev/build under `author`**
- [ ] **Step 2: Add `publish validate` as the publish gate**
- [ ] **Step 3: Keep existing commands as aliases initially if needed**
- [ ] **Step 4: Add/update tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/commands/author.js packages/agentpack/src/commands/publish.js packages/agentpack/src/cli.js
git commit -m "feat: split authoring and publishing command surfaces"
```

### Task 6: Deprecate overlapping consumer commands

**Files:**
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `test/integration/skills-install.test.js`
- Modify: `test/integration/skills-uninstall.test.js`
- Modify: `test/integration/skills-env.test.js`
- Modify: `test/integration/skills-missing.test.js`

- [ ] **Step 1: Decide final fate**
  - keep `status`
  - add `list`
  - fold `env` / `missing` into `status` if practical
  - convert `install` / `uninstall` into wrappers or deprecate fully
- [ ] **Step 2: Update tests to the new shape**
- [ ] **Step 3: Run the affected integration suites**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agentpack/src/commands/skills.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js test/integration/skills-env.test.js test/integration/skills-missing.test.js
git commit -m "refactor: simplify consumer skill commands"
```

## Chunk 4: Docs And Real Workflow Verification

### Task 7: Update docs and bundled guidance

**Files:**
- Modify: `docs/schema-package-json.mdx`
- Modify: relevant bundled skills and consumer docs

- [ ] **Step 1: Replace `skills install` happy path with npm + enable**
- [ ] **Step 2: Document `author`, `publish validate`, and runtime `skills` commands**
- [ ] **Step 3: Run doc/release-contract tests**

Run: `node --test test/integration/release-contract.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/schema-package-json.mdx packages/agentpack/skills
git commit -m "docs: align runtime workflow with npm and skills enable"
```

### Task 8: Final verification

- [ ] **Step 1: Run TLA models if state semantics changed**

Run: `npm run test:models`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Verify the real consumer flow manually**

Run:

```bash
npm install <migrated-skill-package>
agentpack skills list
agentpack skills enable <package>
agentpack skills status
agentpack skills disable <package>
```

Expected:
- package remains installed in `node_modules`
- runtime links appear only after `enable`
- runtime links are removed by `disable`
- status clearly distinguishes installed vs enabled

- [ ] **Step 4: Commit final verification fixes**

```bash
git add .
git commit -m "test: verify runtime materialization command split end to end"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-16-runtime-materialization-command-split.md`. Ready to execute?
