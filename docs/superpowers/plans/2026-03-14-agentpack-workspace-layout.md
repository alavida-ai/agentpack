# Agentpack Workspace Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `@alavida/agentpack` from a special root package into a standard workspace package under `packages/agentpack`, and restore a standard Changesets release flow.

**Architecture:** Move the publishable CLI package into `packages/agentpack`, keep the repo root private, preserve root `bin/*` as thin development wrappers, and delete the tracker-package/custom release bridge so Changesets versions and publishes the real package directly.

**Tech Stack:** npm workspaces, Changesets, Node.js ESM, GitHub Actions

---

## Chunk 1: Lock The New Release Contract

### Task 1: Add failing contract coverage for the standard layout

**Files:**
- Modify: `test/integration/release-contract.test.js`

- [ ] **Step 1: Write the failing test**

Add assertions that expect:
- root `package.json` is `private: true`
- `packages/agentpack/package.json` exists with name `@alavida/agentpack`
- release workflow uses direct Changesets version/publish commands
- tracker package and custom release scripts are not required

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/release-contract.test.js`
Expected: FAIL because the repo still uses the root-package + tracker/custom release path.

## Chunk 2: Move The Published Package

### Task 2: Create the workspace package and keep root wrappers

**Files:**
- Create: `packages/agentpack/package.json`
- Create: `packages/agentpack/README.md`
- Move: `bin/*` into `packages/agentpack/bin/*`
- Move: `src/**` into `packages/agentpack/src/**`
- Move: `skills/**` into `packages/agentpack/skills/**`
- Modify: `bin/agentpack.js`
- Modify: `bin/intent.js`

- [ ] **Step 1: Move the publishable package contents**

Place the actual CLI package files under `packages/agentpack`.

- [ ] **Step 2: Leave thin root wrappers**

Make root `bin/agentpack.js` and `bin/intent.js` delegate to the workspace package entrypoints so local repo commands keep working.

- [ ] **Step 3: Run the release-contract test again**

Run: `node --test test/integration/release-contract.test.js`
Expected: still FAIL until manifests/workflow are simplified.

## Chunk 3: Simplify Manifests And Release Flow

### Task 3: Remove the custom root release bridge

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/release.yml`
- Modify: `.changeset/config.json`
- Delete: `packages/agentpack-release/package.json`
- Delete: `packages/agentpack-release/CHANGELOG.md`
- Delete: `scripts/version-packages.mjs`
- Delete: `scripts/release.mjs`

- [ ] **Step 1: Make the root private**

Convert the root manifest into a workspace manager package only.

- [ ] **Step 2: Make the workspace package the only published `@alavida/agentpack` package**

Put the package metadata, bin map, files list, dependencies, and version in `packages/agentpack/package.json`.

- [ ] **Step 3: Restore standard Changesets workflow**

Use direct Changesets version/publish commands in the release workflow and remove the tracker/custom publish path.

- [ ] **Step 4: Run the contract test**

Run: `node --test test/integration/release-contract.test.js`
Expected: PASS.

## Chunk 4: Retarget Imports, Scripts, And Tests

### Task 4: Update repo-local imports to the new source location

**Files:**
- Modify: `scripts/build-dashboard.mjs`
- Modify: `scripts/live-validation.mjs`
- Modify: `scripts/smoke-monorepo.mjs`
- Modify: `test/application/build-skill-workbench-model.test.js`
- Modify: `test/domain/*.test.js`
- Modify: `test/infrastructure/*.test.js`
- Modify: `test/integration/*.test.js`

- [ ] **Step 1: Update module imports from root `src/*` to `packages/agentpack/src/*`**

- [ ] **Step 2: Keep CLI integration tests pointed at the root wrapper unless a direct package path is required**

- [ ] **Step 3: Refresh any contract assertions that still refer to the removed tracker/custom release files**

- [ ] **Step 4: Run focused tests**

Run: `node --test test/integration/release-contract.test.js`
Run: `node --test test/integration/intent-bin.test.js`

Expected: PASS.

## Chunk 5: Refresh Install Metadata And Verify End To End

### Task 5: Regenerate lockfile/install metadata and run full verification

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Run install to refresh the workspace lockfile**

Run: `npm install`
Expected: `package-lock.json` reflects `packages/agentpack`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS with 0 failures.

- [ ] **Step 3: Manual CLI smoke checks**

Run:

```bash
node bin/agentpack.js --help
node bin/intent.js --help
npx changeset status
```

Expected:
- root wrapper CLI works
- root wrapper intent works
- Changesets sees the workspace package layout cleanly

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "refactor: move agentpack into a workspace package"
```
