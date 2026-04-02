# Skills Install Materialization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `skills install`/`skills env`/`skills uninstall` so package-backed installs materialize only the requested closure, support multi-skill package exports, safely replace stale links, and report accurate package-owned runtime entries.

**Architecture:** Keep package resolution and ownership package-based, but make runtime discoverability export-based. Extend install state to record exported skill entries per installed package, rebuild state from the resolved closure instead of ambient `node_modules`, and materialize one top-level discovery entry per exported skill with namespacing for sub-skills in multi-skill packages.

**Tech Stack:** Node.js, commander CLI, npm install flow, filesystem symlinks, Node test runner

---

## Chunk 1: Lock Regression Coverage

### Task 1: Add fixtures for multi-skill package installs

**Files:**
- Modify: `test/integration/fixtures.js`
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-env.test.js`
- Test: `test/integration/skills-uninstall.test.js`

- [ ] **Step 1: Write the failing fixture support**

Add helper fixture data for:
- one multi-skill package with `package.json.agentpack.skills`
- one direct dependency package
- one unrelated pre-existing package in `node_modules`

- [ ] **Step 2: Write failing install tests for multi-skill materialization**

Add tests asserting:
- root skill materializes as bare package entry
- sub-skills materialize as namespaced entries
- each entry points to a directory with `SKILL.md` at root

- [ ] **Step 3: Run install tests to verify failure**

Run: `node --test test/integration/skills-install.test.js`
Expected: FAIL because current install path assumes one root `SKILL.md` and scans unrelated installed packages.

- [ ] **Step 4: Write failing env tests**

Add tests asserting `skills env` shows:
- installed package row for the requested multi-skill package
- exported `skills:` list
- materialized runtime entry names/paths
- no unrelated ambient package rows

- [ ] **Step 5: Run env tests to verify failure**

Run: `node --test test/integration/skills-env.test.js`
Expected: FAIL because current env output is built from the old install-state shape and root-skill assumptions.

- [ ] **Step 6: Write failing uninstall tests**

Add tests asserting:
- uninstall removes all materialized entries owned by a removed multi-skill package
- orphaned dependency packages are removed
- shared dependency packages are preserved when still required by another direct install

- [ ] **Step 7: Run uninstall tests to verify failure**

Run: `node --test test/integration/skills-uninstall.test.js`
Expected: FAIL because current state/materialization model is one-package-one-skill.

## Chunk 2: Refactor Install State Around Exported Skills

### Task 2: Add installed-package export parsing helpers

**Files:**
- Modify: `src/domain/skills/skill-model.js`
- Modify: `src/lib/skills.js`
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Test: `test/integration/skills-install.test.js`

- [ ] **Step 1: Write the failing test for export-map parsing behavior**

Add coverage that installed package metadata can expose:
- export path map from `package.json.agentpack.skills`
- fallback to root `SKILL.md` for single-skill compatibility

- [ ] **Step 2: Run targeted test to verify failure**

Run: `node --test test/integration/skills-install.test.js`
Expected: FAIL because installed package metadata does not yet expose exported-skill records.

- [ ] **Step 3: Implement minimal export parsing**

Add helper logic that reads exported skills from installed package metadata and returns normalized records:
- canonical skill name
- relative source path
- absolute source dir
- whether the package is multi-skill

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/integration/skills-install.test.js`
Expected: PASS for export parsing expectations.

### Task 3: Extend install-state shape to record exported skills

**Files:**
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Modify: `src/infrastructure/fs/install-state-repository.js`
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-env.test.js`

- [ ] **Step 1: Write failing assertions against install.json**

Add assertions that each installed package record includes:
- package metadata
- exported skill records
- materialized targets per exported skill

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `node --test test/integration/skills-install.test.js test/integration/skills-env.test.js`
Expected: FAIL because install state only stores one flat materialization list per package.

- [ ] **Step 3: Implement minimal install-state shape update**

Persist exported skill records under each package while keeping the package itself as the ownership unit.

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/integration/skills-install.test.js test/integration/skills-env.test.js`
Expected: PASS for install-state structure.

## Chunk 3: Restrict Rebuild to the Resolved Closure

### Task 4: Make rebuild/materialization operate on the resolved package set

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Test: `test/integration/skills-install.test.js`

- [ ] **Step 1: Write the failing regression for unrelated ambient packages**

Add a test where `node_modules` contains an unrelated package before install, then assert it is not materialized or recorded after installing a different package closure.

- [ ] **Step 2: Run targeted test to verify failure**

Run: `node --test test/integration/skills-install.test.js`
Expected: FAIL because current rebuild scans all installed package dirs.

- [ ] **Step 3: Implement minimal resolved-closure rebuild**

Change install/uninstall rebuild flow so `rebuildInstallState()` consumes only the package dirs belonging to the resolved closure for the current direct requested set.

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/integration/skills-install.test.js`
Expected: PASS with no unrelated package materialization.

## Chunk 4: Materialize Multi-Skill Exports Correctly

### Task 5: Add runtime naming and per-export materialization

**Files:**
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-env.test.js`

- [ ] **Step 1: Write failing tests for runtime names**

Add assertions for:
- single-skill package -> one flat entry only
- multi-skill package root export -> bare runtime name
- multi-skill package sub-exports -> namespaced runtime names

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `node --test test/integration/skills-install.test.js test/integration/skills-env.test.js`
Expected: FAIL because current materialization links package roots only.

- [ ] **Step 3: Implement minimal naming/materialization logic**

Generate runtime entry names from exported skill records and materialize each export individually to `.claude/skills/` and `.agents/skills/`.

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/integration/skills-install.test.js test/integration/skills-env.test.js`
Expected: PASS with discoverable namespaced sub-skills.

### Task 6: Make materialization overwrite stale links safely

**Files:**
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Test: `test/integration/skills-install.test.js`

- [ ] **Step 1: Write failing stale-symlink regression**

Add a test that pre-creates managed symlinks in `.claude/skills/` and `.agents/skills/`, then reruns install and expects success.

- [ ] **Step 2: Run targeted test to verify failure**

Run: `node --test test/integration/skills-install.test.js`
Expected: FAIL with the current repeated `EEXIST` behavior.

- [ ] **Step 3: Implement minimal reconciliation**

Always remove and recreate managed target paths before linking.

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/integration/skills-install.test.js`
Expected: PASS with safe overwrite behavior.

## Chunk 5: Update Env and Uninstall to Use the New State Model

### Task 7: Make `skills env` package-oriented with exported/materialized entries

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/commands/skills.js`
- Test: `test/integration/skills-env.test.js`

- [ ] **Step 1: Write failing output expectations**

Add assertions for package-oriented env output that includes exported `skills:` and materialized runtime entries.

- [ ] **Step 2: Run targeted test to verify failure**

Run: `node --test test/integration/skills-env.test.js`
Expected: FAIL because current env lifecycle/read path assumes one root `SKILL.md`.

- [ ] **Step 3: Implement minimal env adaptation**

Render env from the new install-state shape, using exported-skill records instead of rescanning package roots.

- [ ] **Step 4: Run targeted test to verify pass**

Run: `node --test test/integration/skills-env.test.js`
Expected: PASS with accurate package-owned export/materialization data.

### Task 8: Make uninstall remove package-owned exported entries correctly

**Files:**
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-uninstall.test.js`

- [ ] **Step 1: Write failing uninstall assertions for per-export cleanup**

Add assertions that uninstall removes all owned exported runtime entries for removed packages and preserves shared dependencies when still needed.

- [ ] **Step 2: Run targeted test to verify failure**

Run: `node --test test/integration/skills-uninstall.test.js`
Expected: FAIL because current uninstall cleanup only reasons about one package-level materialization list.

- [ ] **Step 3: Implement minimal uninstall cleanup update**

Drive cleanup from the new package/export install-state shape and remaining closure targets.

- [ ] **Step 4: Run targeted test to verify pass**

Run: `node --test test/integration/skills-uninstall.test.js`
Expected: PASS with orphan cleanup and shared-dependency preservation.

## Chunk 6: Verification

### Task 9: Run focused and full verification

**Files:**
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-env.test.js`
- Test: `test/integration/skills-uninstall.test.js`

- [ ] **Step 1: Run focused regression suite**

Run: `node --test test/integration/skills-install.test.js test/integration/skills-env.test.js test/integration/skills-uninstall.test.js`
Expected: PASS

- [ ] **Step 2: Run broader test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Review generated state/output manually if needed**

Confirm install/env/uninstall behavior matches the approved spec for:
- single-skill packages
- multi-skill packages
- orphaned dependency removal
- no unrelated ambient package materialization
