# Skills Runtime Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make installed-skill runtime behavior npm-like by treating install state as authoritative, materialized runtime entries as derived state, and drift as detectable/reconcilable instead of silently ignored.

**Architecture:** Keep `.agentpack/install.json` as the only source of truth. Add a small runtime-inspection layer that compares recorded targets to live filesystem state, wire that into `status` only, and fix uninstall/missing logic to operate on recorded exports and paths correctly. Keep `env` declarative, and reuse `skills install` as the primary repair path rather than adding hidden mutation to read commands.

**Tech Stack:** Node.js, commander CLI, filesystem symlinks, Node test runner

---

## Chunk 1: Lock the Current Failure Modes

### Task 1: Add characterization coverage for runtime drift

**Files:**
- Modify: `test/integration/skills-status.test.js`
- Modify: `test/integration/skills-uninstall.test.js`
- Create: `test/integration/skills-runtime-drift.test.js`
- Test: `test/integration/fixtures.js`

- [ ] **Step 1: Add reusable helpers for runtime drift setup**

Extend test fixtures with helpers to:
- install a multi-skill package fixture
- mutate recorded materialization paths after install
- inspect symlink target vs live target existence

- [ ] **Step 2: Write failing status drift tests**

Add tests that install a multi-skill package, then:
- delete one materialized symlink
- replace one materialized symlink with a plain directory
- retarget one materialized symlink to the wrong exported skill
- leave orphaned unmanaged entries under `.claude/skills/` or `.agents/skills/`

Assert that `skills status` reports runtime drift distinctly from missing dependencies.

- [ ] **Step 3: Run status drift tests to verify failure**

Run: `node --test test/integration/skills-status.test.js test/integration/skills-runtime-drift.test.js`
Expected: FAIL because status currently has no live materialization drift model.

- [ ] **Step 4: Write failing uninstall cleanup tests**

Add tests asserting uninstall removes:
- healthy symlinks
- dangling symlinks
- wrong-target symlinks
- plain directory replacements at recorded managed paths

- [ ] **Step 5: Run uninstall tests to verify failure**

Run: `node --test test/integration/skills-uninstall.test.js test/integration/skills-runtime-drift.test.js`
Expected: FAIL because current cleanup skips dangling symlinks.

- [ ] **Step 6: Write declarative env regression tests**

Add tests asserting `skills env` remains recorded-state only:
- recorded package/export/materialization entries still render
- runtime drift does not change the inventory output shape

- [ ] **Step 7: Run env tests to verify current behavior stays stable**

Run: `node --test test/integration/skills-env.test.js`
Expected: PASS or minimal adaptation only if current expectations need tightening.

## Chunk 2: Fix Exported-Skill Resolution for Missing/Status

### Task 2: Resolve `requires` against installed exported skill records

**Files:**
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-missing.test.js`
- Test: `test/integration/skills-status.test.js`

- [ ] **Step 1: Add the failing baseline regression**

Write a regression asserting that a healthy install of published or fixture multi-skill package `@alavida-ai/prd-development` does **not** report exported self-references like `@alavida-ai/prd-development:proto-persona` as missing.

- [ ] **Step 2: Run missing/status tests to verify failure**

Run: `node --test test/integration/skills-missing.test.js test/integration/skills-status.test.js`
Expected: FAIL because current code only tracks installed package names.

- [ ] **Step 3: Implement installed-export resolution**

Update missing/status logic so installed satisfaction includes:
- installed package names
- installed exported skill identifiers derived from install-state skill records

For package-backed exports, canonical requirements like `@scope/package:skill-name` should resolve against the install record for that package plus its exported skill list.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/integration/skills-missing.test.js test/integration/skills-status.test.js`
Expected: PASS with no false missing records for healthy multi-skill installs.

## Chunk 3: Add Live Materialization Verification

### Task 3: Build a small runtime-inspection layer

**Files:**
- Create: `src/infrastructure/runtime/inspect-materialized-skills.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-runtime-drift.test.js`

- [ ] **Step 1: Write the failing verification-unit tests**

Add targeted tests for a helper that inspects one recorded materialization path and returns:
- healthy
- `missing_path`
- `wrong_type`
- `wrong_target`
- `dangling_target`

- [ ] **Step 2: Run targeted drift tests to verify failure**

Run: `node --test test/integration/skills-runtime-drift.test.js`
Expected: FAIL because no such inspection layer exists yet.

- [ ] **Step 3: Implement minimal runtime inspection**

Add helper logic that, for each recorded materialization path:
- uses `lstatSync` semantics instead of `existsSync`
- checks whether the path exists as a symlink
- checks the symlink target against the recorded source skill path
- checks whether the symlink target resolves to a live path
- enumerates orphaned entries under managed runtime roots that are not owned by install state

- [ ] **Step 4: Run targeted drift tests to verify pass**

Run: `node --test test/integration/skills-runtime-drift.test.js`
Expected: PASS with correct drift classification.

### Task 4: Expose drift through `skills status` only

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/commands/skills.js`
- Test: `test/integration/skills-status.test.js`

- [ ] **Step 1: Write failing output expectations**

Add assertions that:
- `skills status` counts drifted installs and degrades health to `attention-needed`
- `skills status` reports drift codes for recorded materializations
- `skills status` reports orphaned materializations separately from owned drift

- [ ] **Step 2: Run status tests to verify failure**

Run: `node --test test/integration/skills-status.test.js test/integration/skills-runtime-drift.test.js`
Expected: FAIL because current output does not include live drift state.

- [ ] **Step 3: Implement minimal status-path adaptation**

Wire runtime inspection into status data models without mutating the filesystem.

- [ ] **Step 4: Run status tests to verify pass**

Run: `node --test test/integration/skills-status.test.js test/integration/skills-runtime-drift.test.js`
Expected: PASS with truthful drift reporting.

## Chunk 4: Make Uninstall Deterministic

### Task 5: Remove recorded owned paths even when they are dangling

**Files:**
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-uninstall.test.js`
- Test: `test/integration/skills-runtime-drift.test.js`

- [ ] **Step 1: Write failing cleanup-path assertions**

Add assertions that uninstall removes recorded materialization paths when those paths are:
- dangling symlinks
- wrong-target symlinks
- plain directories

- [ ] **Step 2: Run uninstall cleanup tests to verify failure**

Run: `node --test test/integration/skills-uninstall.test.js test/integration/skills-runtime-drift.test.js`
Expected: FAIL because current cleanup skips dangling symlinks via `existsSync()`.

- [ ] **Step 3: Implement minimal deterministic removal**

Replace pre-removal checks with logic that removes a recorded path when it is present according to `lstat`/`rmSync`, regardless of whether the target exists.

- [ ] **Step 4: Run uninstall cleanup tests to verify pass**

Run: `node --test test/integration/skills-uninstall.test.js test/integration/skills-runtime-drift.test.js`
Expected: PASS with full cleanup across all managed drift variants.

## Chunk 5: Reconcile and Stress-Test the npm-Like Model

### Task 6: Prove reinstall repairs runtime drift

**Files:**
- Modify: `test/integration/skills-reinstall.test.js`
- Test: `test/integration/skills-runtime-drift.test.js`

- [ ] **Step 1: Write failing reinstall characterization tests**

Add reinstall regressions covering:
- deleted symlink
- replaced directory
- wrong-target symlink
- dangling target after source deletion
- orphaned unmanaged runtime entry remaining report-only until explicit cleanup by install/uninstall affects owned state

Assert reinstall restores healthy materializations from install state.

- [ ] **Step 2: Run reinstall tests to verify behavior**

Run: `node --test test/integration/skills-reinstall.test.js test/integration/skills-runtime-drift.test.js`
Expected: PASS or reveal edge failures that must be fixed before claiming npm-like reconciliation works.

- [ ] **Step 3: Fix only if reinstall is not deterministic**

If any reinstall repair case fails, implement the smallest change needed in the materialization path to restore deterministic reconciliation.

- [ ] **Step 4: Re-run reinstall tests**

Run: `node --test test/integration/skills-reinstall.test.js test/integration/skills-runtime-drift.test.js`
Expected: PASS.

### Task 7: Run the full regression suite

**Files:**
- No code changes expected

- [ ] **Step 1: Run targeted integration coverage**

Run:
`node --test test/integration/skills-env.test.js test/integration/skills-status.test.js test/integration/skills-missing.test.js test/integration/skills-reinstall.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js test/integration/skills-runtime-drift.test.js`

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS with 0 failures.

- [ ] **Step 3: Re-run the published sandbox verification manually**

In `sandbox/acme-demo`:
- install published `@alavida-ai/prd-development`
- verify `skills env`
- delete a namespaced materialization manually
- verify `skills env` remains declarative
- verify `skills status` reports drift
- rerun `skills install @alavida-ai/prd-development`
- verify drift is repaired
- uninstall
- verify cleanup removes dangling links too

- [ ] **Step 4: Capture final handoff notes**

Record:
- exact observed CLI behavior before/after drift repair
- whether a dedicated `skills rebuild` command is still unnecessary
- any deferred follow-up that is intentionally out of scope
