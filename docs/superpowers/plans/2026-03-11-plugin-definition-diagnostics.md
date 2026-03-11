# Plugin Definition Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centralized plugin definition diagnostic boundary so plugin commands report structured, agent-friendly setup errors for missing or invalid plugin metadata.

**Architecture:** Introduce a plugin definition loader that validates plugin prerequisites by requirement level before bundle logic runs. Use a typed diagnostic error for expected setup failures, then update plugin inspect, validate, and build paths to reuse that boundary and add text/JSON integration coverage.

**Tech Stack:** Node.js, ES modules, Commander, Node test runner

---

## File Map

- Create: `src/domain/plugins/load-plugin-definition.js`
- Create: `src/domain/plugins/plugin-diagnostic-error.js`
- Create: `src/domain/plugins/plugin-requirements.js`
- Modify: `src/lib/plugins.js`
- Modify: `src/application/plugins/inspect-plugin-bundle.js`
- Modify: `src/application/plugins/validate-plugin-bundle.js`
- Modify: `src/application/plugins/build-plugin.js`
- Modify: `src/commands/plugin.js`
- Modify: `test/integration/plugin-bundle.test.js`
- Check for reuse: `test/integration/fixtures.js`

## Chunk 1: Add Plugin Diagnostic Boundary

### Task 1: Add typed diagnostic primitives

**Files:**
- Create: `src/domain/plugins/plugin-diagnostic-error.js`
- Create: `src/domain/plugins/plugin-requirements.js`

- [ ] **Step 1: Write the failing unit-style integration expectation**

Add a new integration test in `test/integration/plugin-bundle.test.js` that runs `plugin inspect` against a plugin fixture with no `package.json` and asserts a structured JSON diagnostic code of `missing_plugin_package_json`.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: FAIL because the command still returns `missing_plugin_package_metadata` or an equivalent generic error.

- [ ] **Step 3: Add the diagnostic error class**

Create `src/domain/plugins/plugin-diagnostic-error.js` exporting a typed error that carries:

```js
export class PluginDiagnosticError extends Error {
  constructor(message, { code, path, nextSteps = [], details = {} } = {}) {
    super(message);
    this.name = 'PluginDiagnosticError';
    this.code = code;
    this.path = path;
    this.nextSteps = nextSteps;
    this.details = details;
  }
}
```

- [ ] **Step 4: Add requirement-level definitions**

Create `src/domain/plugins/plugin-requirements.js` with explicit requirement-level metadata for `inspect`, `validate`, and `build`, including whether `.claude-plugin/plugin.json` is required.

- [ ] **Step 5: Run the targeted test again**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: still FAIL, but now the diagnostic primitives exist for the loader implementation.

- [ ] **Step 6: Commit the diagnostic primitives**

```bash
git add src/domain/plugins/plugin-diagnostic-error.js src/domain/plugins/plugin-requirements.js test/integration/plugin-bundle.test.js
git commit -m "feat: add plugin diagnostic primitives"
```

### Task 2: Implement plugin definition loader

**Files:**
- Create: `src/domain/plugins/load-plugin-definition.js`
- Modify: `src/lib/plugins.js`

- [ ] **Step 1: Write the next failing expectations**

Extend `test/integration/plugin-bundle.test.js` with coverage for:

- missing `package.json`
- invalid `package.json`
- existing `package.json` missing `name` and/or `version`
- missing `.claude-plugin/plugin.json`

Cover both human-readable stderr and JSON output where practical.

- [ ] **Step 2: Run the targeted test file and verify the new cases fail**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: FAIL on the new diagnostics because the loader is not wired in yet.

- [ ] **Step 3: Implement `loadPluginDefinition()`**

Create `src/domain/plugins/load-plugin-definition.js` with logic to:

- resolve repo root and plugin dir
- determine active requirement level
- check for `package.json`
- parse JSON with an `invalid_plugin_package_json` diagnostic on parse failure
- validate required package fields and include exact missing fields in `details.missingFields`
- check `.claude-plugin/plugin.json` when the requirement level needs it
- return normalized plugin metadata on success

Use `PluginDiagnosticError` for expected failures and reuse existing path normalization helpers where possible.

- [ ] **Step 4: Refactor plugin library entrypoints to use the loader**

Update `src/lib/plugins.js` so plugin inspection/build/validation paths call the new loader instead of directly reading package metadata for prerequisite checks.

- [ ] **Step 5: Run the targeted test file**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: PASS for the newly added diagnostics or expose remaining output-format mismatches.

- [ ] **Step 6: Commit the loader integration**

```bash
git add src/domain/plugins/load-plugin-definition.js src/lib/plugins.js test/integration/plugin-bundle.test.js
git commit -m "feat: centralize plugin definition diagnostics"
```

## Chunk 2: Render Diagnostics Consistently Across Plugin Commands

### Task 3: Update application and command layers

**Files:**
- Modify: `src/application/plugins/inspect-plugin-bundle.js`
- Modify: `src/application/plugins/validate-plugin-bundle.js`
- Modify: `src/application/plugins/build-plugin.js`
- Modify: `src/commands/plugin.js`

- [ ] **Step 1: Write failing command-level expectations**

Add or extend tests so `plugin inspect --json` returns the full structured diagnostic object and text mode renders:

- concise summary
- primary path
- explicit next step
- optional inline example for missing `package.json`

If `validate` and `build` already share the same top-level error handling path, add at least one regression case proving the same diagnostic contract reaches them.

- [ ] **Step 2: Run the targeted tests**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: FAIL because command rendering does not yet understand the richer diagnostic payload.

- [ ] **Step 3: Wire use cases and command output to the new diagnostic model**

Update the plugin application/use-case modules and `src/commands/plugin.js` so expected plugin definition failures:

- preserve `code`, `path`, `nextSteps`, and `details` in JSON mode
- render human-readable guidance in text mode without stringly-typed special casing spread across commands

Prefer one rendering helper or one common branch in command handling over duplicate formatting logic.

- [ ] **Step 4: Run the targeted tests again**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: PASS for inspect diagnostic rendering and any added validate/build coverage.

- [ ] **Step 5: Commit the command-layer wiring**

```bash
git add src/application/plugins/inspect-plugin-bundle.js src/application/plugins/validate-plugin-bundle.js src/application/plugins/build-plugin.js src/commands/plugin.js test/integration/plugin-bundle.test.js
git commit -m "feat: render structured plugin diagnostics"
```

## Chunk 3: Full Verification

### Task 4: Run regression coverage

**Files:**
- Test: `test/integration/plugin-bundle.test.js`
- Test: repository test suite via `package.json`

- [ ] **Step 1: Run the focused integration suite**

Run: `node --test test/integration/plugin-bundle.test.js`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS with no regressions in plugin, skill, or CLI behavior.

- [ ] **Step 3: Inspect the resulting diff**

Run: `git status --short && git diff --stat`
Expected: only the planned plugin diagnostic files and tests are changed.

- [ ] **Step 4: Commit the verified implementation**

```bash
git add src/domain/plugins src/lib/plugins.js src/application/plugins src/commands/plugin.js test/integration/plugin-bundle.test.js
git commit -m "fix: improve plugin definition diagnostics"
```

## Notes

- Keep the implementation agent-first internally: the diagnostic object is the source of truth, and human CLI text is a rendering of it.
- Do not introduce a shared generic loader for skills in this change.
- Keep stable diagnostic codes once introduced; treat them as a consumer-facing contract.
