# Skills Dev Session Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills dev` recover cleanly after abnormal termination by persisting single-session ownership for dev-linked skills and adding explicit cleanup flows.

**Architecture:** Add one repo-local session manifest at `.agentpack/dev-session.json`, let `src/lib/skills.js` own session lifecycle and stale-session reconciliation, and keep symlink creation/removal isolated in the runtime materialization layer.

**Tech Stack:** Node.js, Commander, JSON state files, integration tests with `node:test`

---

## File Map

- Create: `src/infrastructure/fs/dev-session-repository.js`
- Modify: `src/lib/skills.js`
- Modify: `src/commands/skills.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-unlink.test.js`

## Chunk 1: Session Persistence

### Task 1: Add the dev-session repository

**Files:**
- Create: `src/infrastructure/fs/dev-session-repository.js`
- Test: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Write the failing test**

Add an integration test that prewrites `.agentpack/dev-session.json` with a dead pid and recorded link paths, then starts `skills dev` and expects stale links to be removed before the new session starts.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL because stale-session reconciliation does not exist.

- [ ] **Step 3: Write minimal repository helpers**

Implement helpers to:

- read the session file
- write the session file
- remove the session file
- resolve the repo-local path `.agentpack/dev-session.json`

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL because lifecycle code does not yet use the repository.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/fs/dev-session-repository.js test/integration/skills-dev.test.js
git commit -m "refactor: add skills dev session repository"
```

## Chunk 2: Lifecycle Ownership

### Task 2: Reconcile and record one active session

**Files:**
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Write the failing tests**

Add integration coverage for:

- stale session cleanup on startup
- refusal to start when a live session already exists
- deletion of the session file on clean shutdown

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL on all new session-lifecycle scenarios.

- [ ] **Step 3: Implement session lifecycle in `src/lib/skills.js`**

Add logic to:

- reconcile `.agentpack/dev-session.json` before starting
- detect pid liveness
- create an active session record after link resolution
- update the record with exact linked skills and link paths
- mark cleanup in progress and remove links from the recorded session on close

Also move shutdown ownership fully into the session object so the CLI does not duplicate signal cleanup logic.

When a live session blocks startup, return an `AgentpackError` with structured `nextSteps` instead of ad hoc text so agent callers receive exact recovery commands in both text and JSON mode.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `node --test test/integration/skills-dev.test.js`
Expected: PASS for the new lifecycle tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills.js test/integration/skills-dev.test.js
git commit -m "feat: persist and reconcile skills dev sessions"
```

## Chunk 3: CLI Cleanup Surface

### Task 3: Add `skills dev cleanup`

**Files:**
- Modify: `src/commands/skills.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Write the failing test**

Add an integration test that prewrites a stale session file, runs `agentpack skills dev cleanup`, and expects the recorded links and session file to be removed.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL because the cleanup command does not exist.

- [ ] **Step 3: Implement the command and use case**

Add a `cleanup` subcommand under `skills dev` or an equivalent command shape consistent with Commander usage in the repo, and implement repository-backed cleanup behavior for stale sessions.

Use structured success and error responses that preserve the repo's existing CLI guidance model, including actionable `nextSteps` when cleanup cannot proceed.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `node --test test/integration/skills-dev.test.js`
Expected: PASS for cleanup command behavior.

- [ ] **Step 5: Commit**

```bash
git add src/commands/skills.js src/lib/skills.js test/integration/skills-dev.test.js
git commit -m "feat: add skills dev cleanup command"
```

## Chunk 4: Recursive Unlink

### Task 4: Add `skills unlink --recursive` for the active dev root

**Files:**
- Modify: `src/commands/skills.js`
- Modify: `src/lib/skills.js`
- Modify: `test/integration/skills-unlink.test.js`

- [ ] **Step 1: Write the failing tests**

Add integration coverage for:

- `skills unlink prd-development --recursive` removes the root plus recorded transitive links when it matches the active session root
- `skills unlink <non-root> --recursive` fails clearly
- `skills unlink <name>` without `--recursive` preserves current single-link behavior

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test test/integration/skills-unlink.test.js`
Expected: FAIL because recursive unlink is not implemented.

- [ ] **Step 3: Implement recursive unlink**

Use the session record as the source of truth for the active dev root and all linked dependency names. Restrict v1 recursive behavior to the active or stale session root.

If recursive unlink is requested for a non-root skill, return a clear structured error with `nextSteps` explaining which command to run instead.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `node --test test/integration/skills-unlink.test.js`
Expected: PASS for recursive unlink scenarios.

- [ ] **Step 5: Commit**

```bash
git add src/commands/skills.js src/lib/skills.js test/integration/skills-unlink.test.js
git commit -m "feat: support recursive skills unlink for dev sessions"
```

## Chunk 5: Full Verification

### Task 5: Run verification and regression checks

**Files:**
- Modify: only if regressions are discovered

- [ ] **Step 1: Run focused integration suites**

Run:

```bash
node --test test/integration/skills-dev.test.js
node --test test/integration/skills-unlink.test.js
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with no regressions

- [ ] **Step 3: Manually smoke-test the Product Manager Skills scenario**

Run from a controlled temp copy of `Product-Manager-Skills`:

```bash
npx agentpack skills dev skills/prd-development
```

Then terminate the process, restart, and confirm stale-session reconciliation or cleanup behaves as designed.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify skills dev session cleanup flow"
```
