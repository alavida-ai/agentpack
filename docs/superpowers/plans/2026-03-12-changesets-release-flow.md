# Changesets Release Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual tag-driven npm releases with a Changesets-managed release PR flow that publishes automatically when the generated release PR merges.

**Architecture:** Add Changesets as the single source of truth for versioning and release notes in this single-package repo. GitHub Actions will run on `main`, maintain a release PR when pending changesets exist, and publish to npm when the Changesets release commit lands on `main`.

**Tech Stack:** GitHub Actions, Changesets, npm, Node.js

---

## Chunk 1: Release Contract

### Task 1: Add release contract coverage for the new workflow

**Files:**
- Modify: `test/integration/release-contract.test.js`
- Reference: `.github/workflows/release.yml`
- Reference: `package.json`

- [ ] **Step 1: Write a failing test for the new release trigger**

Add assertions that the release workflow listens to pushes on `main` instead of only tag pushes, and that `package.json` exposes changesets scripts.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/integration/release-contract.test.js`
Expected: FAIL because the workflow and scripts still describe the tag-based release flow.

- [ ] **Step 3: Implement the minimal release-contract assertions**

Update the test file with string assertions against `.github/workflows/release.yml` and `package.json`.

- [ ] **Step 4: Run the focused test to confirm the new assertions still fail for the old config**

Run: `node --test test/integration/release-contract.test.js`
Expected: FAIL on the newly-added assertions until the workflow/scripts are updated.

## Chunk 2: Changesets Wiring

### Task 2: Add Changesets package/config and scripts

**Files:**
- Modify: `package.json`
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

- [ ] **Step 1: Add `@changesets/cli` and scripts**

Add dev dependency and scripts for `changeset`, `version-packages`, and `release`.

- [ ] **Step 2: Add single-package Changesets config**

Create `.changeset/config.json` with a simple single-package release setup suitable for npm publishing from `main`.

- [ ] **Step 3: Add a brief local maintainer note**

Create `.changeset/README.md` that explains how to add a changeset and what the bot-managed release PR does.

### Task 3: Replace the release workflow with the standard Changesets flow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Update workflow trigger and permissions**

Trigger on `push` to `main` plus manual dispatch, and add the permissions Changesets needs for PRs and contents.

- [ ] **Step 2: Add the Changesets action**

Use the official `changesets/action` step to either open/update the release PR or publish when a release commit reaches `main`.

- [ ] **Step 3: Preserve verification and npm publish**

Keep `npm install` and `npm test` in the job before publish, and configure npm auth through `NPM_TOKEN`.

## Chunk 3: Repository Docs and Seed Changeset

### Task 4: Document the new maintainer workflow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace manual tag release docs**

Document the new flow: add changeset in feature PR, merge feature PR, merge generated release PR, automatic publish.

- [ ] **Step 2: Mention local maintainer commands**

Include the commands maintainers will run locally: `npx changeset`, optionally `npx changeset version`, and the fact that tagging is no longer the normal path.

### Task 5: Add one seed changeset for the workflow migration

**Files:**
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Add a patch changeset for `@alavida/agentpack`**

Describe the release-process migration so the new workflow has pending release content to act on.

## Chunk 4: Verification

### Task 6: Verify focused and repo-wide behavior

**Files:**
- Verify only

- [ ] **Step 1: Run focused release-contract coverage**

Run: `node --test test/integration/release-contract.test.js`
Expected: PASS with the new workflow contract.

- [ ] **Step 2: Run the existing core test suite**

Run: `npm test`
Expected: PASS with zero failures.

- [ ] **Step 3: Run intent validation**

Run: `npm run intent:validate`
Expected: PASS.

- [ ] **Step 4: Confirm package metadata and workflow content**

Run: `node -p "require('./package.json').version"` and inspect `.github/workflows/release.yml`
Expected: package version unchanged by this migration, workflow now tied to `main` pushes and Changesets.

- [ ] **Step 5: Commit**

```bash
git add .changeset .github/workflows/release.yml README.md package.json test/integration/release-contract.test.js docs/superpowers/plans/2026-03-12-changesets-release-flow.md
git commit -m "feat: adopt changesets release flow"
```
