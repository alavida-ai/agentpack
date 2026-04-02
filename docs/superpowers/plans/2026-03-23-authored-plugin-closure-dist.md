# Authored Plugin Closure Dist Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `agentpack author build <target>` produce a single self-contained `./dist` runtime bundle for the selected authored workbench/export closure so Claude Code plugins can point `"skills": "./dist/"`, without changing installed-package discovery or `agentpack enable` semantics in consumer repos.

**Architecture:** Keep canonical semantic truth package-scoped in `.agentpack/compiled.json`, but introduce a separate authored bundle emission path that writes the selected closure into the target package's `dist/`. Preserve installed discovery by keeping `dist/agentpack.json` package-scoped and manifest-first, add an authored-only `dist/.agentpack-bundle.json` that describes the closure bundle explicitly, and harden raw `dist/` fallback scanning so foreign bundled directories are ignored if a manifest is absent.

**Tech Stack:** Node.js, native test runner (`node --test`), agentpack compiler/runtime services, repo-lab integration harness, existing runtime adapters.

**Specs / Context:**
- [2026-03-15-agentpack-harness-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-15-agentpack-harness-design.md)
- [2026-03-17-agentpack-runtime-selection-refactor-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-17-agentpack-runtime-selection-refactor-design.md)
- [Issue #90](https://github.com/alavida-ai/agentpack/issues/90)

**TLA+ gate:** Skip TLA unless implementation changes dev-session lifecycle states, cleanup ordering, or install/materialization phase ordering. This change should stay below that threshold by changing emitted runtime artifacts and discovery guards only.

**Verification requirement:** Follow the harness-first order. Start with application + repo-lab integration coverage. Do not rely on manual plugin testing as the completion signal.

---

## Chunk 1: Lock the Plugin-Bundle Contract and Safety Boundaries

### Task 1: Add failing coverage for authored closure bundling

**Files:**
- Modify: `test/integration/skills-build.test.js`
- Modify: `test/integration/skills-materialize.test.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/fixtures.js`

- [ ] **Step 1: Extend the integration fixture set with an authored root package plus authored dependency package**

Add or reuse a fixture shaped like:

```js
createScenario({
  packages: [
    { relPath: 'skills/foundation-primer', packageJson: { name: '@alavida-ai/foundation-primer' }, skillMd: '...' },
    { relPath: 'workbenches/dashboard-creator', packageJson: { name: '@alavida-ai/dashboard-creator' }, skillMd: 'imports @alavida-ai/foundation-primer' },
  ],
});
```

- [ ] **Step 2: Add a failing build test proving the selected target `dist/` must contain the full closure**

Assert after `agentpack author build workbenches/dashboard-creator`:
- `workbenches/dashboard-creator/dist/dashboard-creator/SKILL.md` exists
- `workbenches/dashboard-creator/dist/foundation-primer/SKILL.md` exists
- `workbenches/dashboard-creator/dist/agentpack.json` exists
- `workbenches/dashboard-creator/dist/.agentpack-bundle.json` exists
- manifest `exports` lists only `dashboard-creator` package exports, not `foundation-primer`
- bundle manifest lists both `dashboard-creator` and `foundation-primer`

Run: `node --test test/integration/skills-build.test.js`
Expected: FAIL because dependency runtime directories are not bundled into the target `dist/`.

- [ ] **Step 3: Add a failing materialize test proving authored materialization must source the full closure from the target package `dist/`**

Assert after `agentpack author materialize`:
- `.claude/skills/dashboard-creator` points into `workbenches/dashboard-creator/dist/dashboard-creator`
- `.claude/skills/foundation-primer` points into `workbenches/dashboard-creator/dist/foundation-primer`
- no authored dependency symlink points at `skills/foundation-primer/dist/...`
- authored materialization reads closure entries from `dist/.agentpack-bundle.json`, not by inferring all `dist/*` folders

Run: `node --test test/integration/skills-materialize.test.js`
Expected: FAIL because authored materialization only exposes the root package or points dependencies at their own package-local dist.

- [ ] **Step 4: Add a failing dev test proving `author dev` uses the same bundled closure output**

Assert after `startSkillDev(...)`:
- linked closure includes root + dependency
- both runtime links point into the selected target package `dist/`
- rebuilds do not require dependency package-local dist paths to remain exposed

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL because dev currently materializes closure from per-package runtime paths.

### Task 2: Add failing safety coverage for installed discovery

**Files:**
- Modify: `test/domain/installed-workspace-graph.test.js`
- Modify: `test/integration/materialize-command.test.js`

- [ ] **Step 1: Add a failing domain test that raw `dist/` fallback must ignore foreign bundled runtime names**

Create a package fixture where:
- package name is `@alavida-ai/dashboard-creator`
- `dist/` contains `dashboard-creator/` and `foundation-primer/`
- `dist/agentpack.json` is missing

Assert installed discovery only returns runtime names in the package namespace, not `foundation-primer`.

Run: `node --test test/domain/installed-workspace-graph.test.js`
Expected: FAIL because raw `dist/` fallback currently scans every `dist/*/SKILL.md` directory.

- [ ] **Step 2: Add a non-regression integration test for installed `agentpack materialize`**

Keep asserting:
- direct package selection stays package-scoped
- transitive installed dependencies are still resolved through the installed graph
- materialized links still include dependency closure in consumer repos

Run: `node --test test/integration/materialize-command.test.js`
Expected: PASS before implementation. If it fails later, stop and fix before proceeding.

---

## Chunk 2: Separate Canonical Package State from Authored Bundle Emission

### Task 3: Introduce an authored runtime bundle emitter

**Files:**
- Create: `packages/agentpack/src/application/skills/build-authored-runtime-bundle.js`
- Create: `packages/agentpack/src/application/skills/read-authored-runtime-bundle.js`
- Modify: `packages/agentpack/src/application/skills/build-runtime-artifacts.js`
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Test: `test/integration/skills-build.test.js`

- [ ] **Step 1: Implement a bundle emitter that accepts an explicit authored runtime selection**

Target shape:

```js
buildAuthoredRuntimeBundle(repoRoot, {
  targetPackageDir,
  targetPackagePath,
  targetPackageName,
  selection,
});
```

Return:

```js
{
  distRoot: 'workbenches/dashboard-creator/dist',
  bundleManifestPath: 'workbenches/dashboard-creator/dist/.agentpack-bundle.json',
  entries: [
    {
      exportId: '@alavida-ai/dashboard-creator',
      runtimeName: 'dashboard-creator',
      runtimePath: 'workbenches/dashboard-creator/dist/dashboard-creator',
      runtimeFile: 'workbenches/dashboard-creator/dist/dashboard-creator/SKILL.md'
    },
    {
      exportId: '@alavida-ai/foundation-primer',
      runtimeName: 'foundation-primer',
      runtimePath: 'workbenches/dashboard-creator/dist/foundation-primer',
      runtimeFile: 'workbenches/dashboard-creator/dist/foundation-primer/SKILL.md'
    }
  ]
}
```

- [ ] **Step 2: Refactor runtime artifact generation so one code path can emit to arbitrary output roots**

Do not duplicate markdown rewriting logic. Extract helpers from `build-runtime-artifacts.js` so the package-local build and bundle emitter share:
- runtime body rewriting
- reference file copying
- runtime document generation

- [ ] **Step 3: Keep `dist/agentpack.json` package-scoped even when foreign closure dirs are present**

Manifest rule:
- `packageName` remains the owning package name
- `exports` lists only the owning package's actual exports
- bundled dependency runtime dirs are present on disk but omitted from `exports`
- `dist/.agentpack-bundle.json` becomes the authored/plugin contract and lists the selected closure explicitly

- [ ] **Step 4: Define the authored bundle manifest schema**

Write `dist/.agentpack-bundle.json` with a stable shape like:

```json
{
  "version": 1,
  "targetPackageName": "@alavida-ai/dashboard-creator",
  "selectedExportId": "@alavida-ai/dashboard-creator",
  "mode": "closure",
  "exports": [
    {
      "exportId": "@alavida-ai/dashboard-creator",
      "packageName": "@alavida-ai/dashboard-creator",
      "runtimeName": "dashboard-creator",
      "runtimeDir": "dist/dashboard-creator",
      "runtimeFile": "dist/dashboard-creator/SKILL.md",
      "sourceSkillPath": "workbenches/dashboard-creator/SKILL.md"
    },
    {
      "exportId": "@alavida-ai/foundation-primer",
      "packageName": "@alavida-ai/foundation-primer",
      "runtimeName": "foundation-primer",
      "runtimeDir": "dist/foundation-primer",
      "runtimeFile": "dist/foundation-primer/SKILL.md",
      "sourceSkillPath": "skills/foundation-primer/SKILL.md"
    }
  ]
}
```

The bundle manifest is authored-only. Installed discovery must ignore it completely.

- [ ] **Step 5: Make `author build <target>` compile local authored dependency packages before bundling**

Use existing authored dependency walking to ensure closure packages are compiled into `.agentpack/compiled.json` before bundle emission.

Run: `node --test test/integration/skills-build.test.js`
Expected: PASS

### Task 4: Keep canonical selection package-scoped and add bundle-aware materialization inputs

**Files:**
- Modify: `packages/agentpack/src/application/skills/compute-runtime-selection.js`
- Modify: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Modify: `packages/agentpack/src/application/skills/read-authored-runtime-bundle.js`
- Test: `test/application/compute-runtime-selection.test.js`

- [ ] **Step 1: Preserve `computeRuntimeSelectionFromCompiledState(...)` as canonical semantic selection only**

Do not mutate canonical compiled entries to point dependency exports at the target bundle `dist/`. That would pollute package truth.

- [ ] **Step 2: Add an explicit bundle-resolution layer after selection**

Use a flow like:

```js
const selection = computeRuntimeSelectionUseCase({ cwd, mode: 'closure', ... });
const bundle = buildAuthoredRuntimeBundleUseCase({ cwd, selection, ... });
const authoredBundle = readAuthoredRuntimeBundleUseCase({ cwd, packageDir: bundle.targetPackageDir });
```

so materialization consumes bundle paths, not canonical compiled `runtimePath` for dependencies.

- [ ] **Step 3: Keep bundle resolution outside installed graph code**

Do not make installed discovery, installed workspace graph, or `runtime-activation.js` aware of `.agentpack-bundle.json`.

- [ ] **Step 4: Add/adjust application tests proving package selection remains deterministic and bundle resolution is a separate concern**

Run: `node --test test/application/compute-runtime-selection.test.js`
Expected: PASS

---

## Chunk 3: Make Authored Materialization and Dev Consume the Bundle

### Task 5: Materialize authored closure from the selected target bundle

**Files:**
- Modify: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Modify: `packages/agentpack/src/application/skills/materialize-runtime-selection.js`
- Modify: `packages/agentpack/src/application/skills/read-authored-runtime-bundle.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js`
- Test: `test/integration/skills-materialize.test.js`

- [ ] **Step 1: Extend the materialization contract so authored adapter entries can use explicit bundle paths**

Add adapter input support for entries like:

```js
{
  exportId,
  runtimeName,
  source: 'workbenches/dashboard-creator/dist/foundation-primer',
  sourceSkillPath: 'skills/foundation-primer/SKILL.md',
  target: '.claude/skills/foundation-primer'
}
```

- [ ] **Step 2: Make `author materialize` read the authored bundle manifest for the active target**

Flow:
1. resolve active authored target / selected export
2. compute closure selection
3. emit or refresh bundle
4. read `dist/.agentpack-bundle.json`
5. materialize adapter links from explicit bundle entries

- [ ] **Step 3: Make `author materialize` select closure mode for the active authored target**

Do not use `mode: 'package'` for authored materialization anymore when the target contract is plugin-ready closure bundling.

- [ ] **Step 4: Materialize from the bundle output rooted at the selected target package `dist/`**

Do not symlink dependency skills from their own package-local `dist/`.

Run: `node --test test/integration/skills-materialize.test.js`
Expected: PASS

### Task 6: Make `author dev` use the same closure bundle and nothing else

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Replace dev-time per-package runtime exposure with the bundle emitter**

Flow should be:
1. resolve selected export
2. compile target + local dependency packages
3. compute closure selection
4. emit selected target bundle `dist/`
5. read `dist/.agentpack-bundle.json`
6. materialize from that bundle

- [ ] **Step 2: Keep session cleanup and workbench behavior unchanged except for bundle source paths**

Session records may still track linked skills individually, but their `path` values should now point into the selected target package `dist/`.

- [ ] **Step 3: Verify dev rebuild/rematerialize keeps the bundle clean**

Add a rebuild assertion where removing a dependency import removes the corresponding bundled dependency dir and runtime link on rebuild.

Run: `node --test test/integration/skills-dev.test.js`
Expected: PASS

---

## Chunk 4: Protect Installed Discovery and `agentpack enable`

### Task 7: Harden installed raw-`dist` fallback scanning

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Test: `test/domain/installed-workspace-graph.test.js`

- [ ] **Step 1: Restrict raw `dist/` fallback to runtime directories that belong to the package namespace**

Accept only:
- primary runtime dir equal to package namespace
- named runtime dirs prefixed with `${namespace}:`

Ignore foreign directories like `foundation-primer/` under `dashboard-creator/dist/`.

- [ ] **Step 2: Keep manifest-first behavior unchanged**

If `dist/agentpack.json` exists:
- read only manifest exports
- never infer extra exports from foreign bundled directories
- ignore `dist/.agentpack-bundle.json` completely in installed-package discovery

Run: `node --test test/domain/installed-workspace-graph.test.js`
Expected: PASS

### Task 8: Re-run installed consumer flows unchanged

**Files:**
- Modify only if regression appears: `packages/agentpack/src/application/skills/runtime-activation.js`
- Test: `test/integration/materialize-command.test.js`
- Test: `test/integration/skills-enable-disable.test.js`

- [ ] **Step 1: Verify installed runtime activation still resolves dependency closure through installed package metadata**

Run: `node --test test/integration/materialize-command.test.js test/integration/skills-enable-disable.test.js`
Expected: PASS

- [ ] **Step 2: Only touch `runtime-activation.js` if authored bundle changes accidentally leak into installed activation**

If changes are needed, keep them minimal and package-scoped. Do not unify authored closure bundling with installed graph resolution.

---

## Chunk 5: Docs and Regression Harness

### Task 9: Document the new authored/plugin bundling behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/cli-skills.mdx`
- Modify: `docs/publishing.mdx`

- [ ] **Step 1: Document `author build <target>` as producing a plugin-ready closure bundle in the target package `dist/`**

Clarify:
- plugin/runtime bundle lives in one folder
- `plugin.json` can point `"skills": "./dist/"`
- `dist/agentpack.json` remains package-scoped for installed discovery
- `dist/.agentpack-bundle.json` is the authored/plugin bundle contract

- [ ] **Step 2: Document that consumer `agentpack materialize` / `skills enable` behavior is unchanged**

Run: `node --test test/integration/skills-build.test.js test/integration/skills-materialize.test.js`
Expected: PASS

### Task 10: Run full verification in harness order

**Files:**
- Verify only

- [ ] **Step 1: Run targeted authored-package suites**

Run:

```bash
node --test \
  test/application/compute-runtime-selection.test.js \
  test/integration/skills-build.test.js \
  test/integration/skills-materialize.test.js \
  test/integration/skills-dev.test.js \
  test/domain/installed-workspace-graph.test.js \
  test/integration/materialize-command.test.js \
  test/integration/skills-enable-disable.test.js
```

Expected: PASS

- [ ] **Step 2: Run broader unit/integration regression coverage**

Run:

```bash
npm run test:unit
npm run test:integration
```

Expected: PASS

- [ ] **Step 3: Run formal model suite only if lifecycle or state-transition semantics changed**

Run if needed:

```bash
npm run test:models
```

Expected: PASS

- [ ] **Step 4: Run sandbox smoke suites before closing**

Run:

```bash
npm run test:sandboxes -- --no-browser-checks
```

Expected: PASS

- [ ] **Step 5: Record residual risks if browser/e2e coverage for plugin consumers is still missing**

If plugin installation itself is still untested end-to-end, call that out explicitly as the remaining harness gap rather than substituting manual testing.

---

## Stress-Test Notes

### Why this should fix the plugin issue

- Claude Code plugin discovery wants one folder of runtime-visible skills.
- This plan makes the selected target `dist/` a closure bundle, so `"skills": "./dist/"` contains root + transitive dependencies together.
- `author materialize` and `author dev` both consume `dist/.agentpack-bundle.json`, so local verification matches plugin packaging without relying on raw directory inference.

### Why this should not break installed repos

- Installed discovery stays manifest-first.
- `dist/agentpack.json` remains package-scoped and does not advertise bundled dependency dirs as exports.
- `dist/.agentpack-bundle.json` is authored-only and ignored by installed discovery.
- Raw `dist/` fallback scanning is hardened so even a missing manifest does not misattribute foreign bundled dirs to the package.
- `agentpack enable` and `agentpack materialize` keep resolving dependency closure from the installed package graph, not from authored bundle layout.

### Main risks to watch

- Accidentally overwriting canonical compiled `runtimePath` with bundle-local paths
- Emitting bundled dependency dirs but also listing them in the package manifest
- Letting authored bundle manifest semantics leak into installed discovery
- Leaving raw `dist/` fallback permissive enough to treat bundled foreign dirs as installed exports
- Making dev rebuild bundle output stale when imports are removed

### Success condition

The change is successful when all of the following are true:

1. `author build <workbench>` emits one `dist/` containing the exact selected closure.
2. `plugin.json` can point `"skills": "./dist/"` and get root + dependencies.
3. `author materialize` and `author dev` expose the same closure from that one `dist/`.
4. Installed `agentpack materialize` / `skills enable` behavior is unchanged in consumer repos.
