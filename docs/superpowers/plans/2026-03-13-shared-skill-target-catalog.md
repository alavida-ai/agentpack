# Shared Skill Target Catalog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace command-specific skill target parsing with one shared package-and-export catalog, fix the multi-skill and local-discovery regressions in `skills inspect`, `skills validate`, and `skills dev`, add wrapper metadata groundwork, and repair the bundled `intent` CLI wrapper.

**Architecture:** Introduce a domain-level catalog that models both single-skill and multi-skill packages as packages exporting one or more `SkillExport` records, then route command behavior through a shared resolver. Keep command UX differences as thin policy logic after resolution, and treat `bin/intent.js` as a separate explicit integration boundary with regression coverage.

**Tech Stack:** Node.js, Commander, ESM modules, JSON/package metadata, `node:test`

---

## File Map

- Create: `src/domain/skills/skill-catalog.js`
- Create: `src/domain/skills/skill-target-resolution.js`
- Create: `test/integration/intent-bin.test.js`
- Modify: `src/domain/skills/skill-model.js`
- Modify: `src/domain/skills/skill-graph.js`
- Modify: `src/lib/skills.js`
- Modify: `src/application/skills/start-skill-dev-workbench.js`
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Modify: `src/commands/skills.js`
- Modify: `bin/intent.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-stale.test.js`
- Modify: `test/integration/skills-authoring-metadata.test.js`

## Chunk 1: Package And Export Catalog

### Task 1: Add failing catalog coverage for multi-skill authored packages

**Files:**
- Modify: `test/integration/skills-authoring-metadata.test.js`
- Test: `test/integration/skills-authoring-metadata.test.js`

- [ ] **Step 1: Write the failing tests**

Add fixture-backed coverage that expects authored catalog generation to include packages whose `package.json` exports multiple skills via `agentpack.skills`, and expects each export to retain its own `skill_file`, `name`, and `requires`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-authoring-metadata.test.js`
Expected: FAIL because authored catalog generation only emits root-`SKILL.md` package records.

- [ ] **Step 3: Implement minimal catalog primitives**

Create `src/domain/skills/skill-catalog.js` with focused helpers to:

- discover authored package roots from `package.json`
- load package metadata
- enumerate exported skills from either `agentpack.skills` or root `SKILL.md`
- return normalized `SkillPackage` and `SkillExport` objects

Keep file-system traversal in this module, not in command code.

- [ ] **Step 4: Extend model parsing just enough for export records**

Modify `src/domain/skills/skill-model.js` so parsed skill metadata can be attached to per-export records consistently, including optional wrapper fields `wraps` and `overrides`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/integration/skills-authoring-metadata.test.js`
Expected: PASS with deterministic authored catalog output for both single-skill and multi-skill packages.

- [ ] **Step 6: Commit**

```bash
git add src/domain/skills/skill-model.js src/domain/skills/skill-catalog.js test/integration/skills-authoring-metadata.test.js
git commit -m "refactor: add shared skill package catalog"
```

### Task 2: Add target resolver coverage across package and export shapes

**Files:**
- Create: `src/domain/skills/skill-target-resolution.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Write the failing tests**

Add integration coverage that uses the same multi-skill fixture to verify these targets all resolve coherently:

- package directory
- package name
- individual skill directory
- `SKILL.md` path

For `dev`, assert that package-level multi-export targets return a structured ambiguous-target error and that precise export targets succeed.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
node --test test/integration/skills-inspect.test.js
node --test test/integration/skills-validate.test.js
node --test test/integration/skills-dev.test.js
```

Expected: FAIL on the new multi-skill resolution cases.

- [ ] **Step 3: Implement the shared resolver**

Create `src/domain/skills/skill-target-resolution.js` with helpers to:

- resolve package names to catalog packages
- resolve package directories to packages
- resolve skill directories and `SKILL.md` paths to specific exports
- produce `ResolvedSkillTarget` records
- surface `ambiguous_skill_target` when a caller requires one export but multiple exports match

- [ ] **Step 4: Run targeted tests to verify resolution primitives are now driving the failures**

Run the same three test files again.
Expected: FAIL only where command-layer code still bypasses the new resolver.

- [ ] **Step 5: Commit**

```bash
git add src/domain/skills/skill-target-resolution.js test/integration/skills-inspect.test.js test/integration/skills-validate.test.js test/integration/skills-dev.test.js
git commit -m "refactor: add shared skill target resolution"
```

## Chunk 2: Command Rewiring

### Task 3: Rewire inspect, validate, and authored discovery to the shared catalog

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/domain/skills/skill-graph.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-stale.test.js`

- [ ] **Step 1: Write the failing tests**

Add or extend coverage for:

- `skills inspect @scope/pkg` on a multi-skill package
- `skills validate <package-dir>` validating every export in the package
- `skills validate` with no args discovering local authored multi-skill packages
- stale/build-state generation preserving export-specific records instead of assuming one root file per package

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
node --test test/integration/skills-inspect.test.js
node --test test/integration/skills-validate.test.js
node --test test/integration/skills-stale.test.js
node --test test/integration/skills-authoring-metadata.test.js
```

Expected: FAIL because `src/lib/skills.js` still assumes one `SKILL.md` per package root in multiple paths.

- [ ] **Step 3: Implement the command rewiring**

Modify `src/lib/skills.js` to:

- replace `listPackagedSkillDirs`-style discovery with catalog queries
- replace `resolvePackagedSkillTarget` and root-`SKILL.md` package-name assumptions with `ResolvedSkillTarget`
- validate all exports in a resolved package target
- generate authored catalog and build-state from export-aware package data
- make stale inspection resolve precise exports and package summaries consistently

Also update `src/domain/skills/skill-graph.js` so graph nodes can be built from catalog package data without re-assuming root `SKILL.md`.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run the same four test files again.
Expected: PASS for the new inspect, validate, catalog, and stale scenarios.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills.js src/domain/skills/skill-graph.js test/integration/skills-inspect.test.js test/integration/skills-validate.test.js test/integration/skills-stale.test.js test/integration/skills-authoring-metadata.test.js
git commit -m "feat: unify skill inspection and validation target handling"
```

### Task 4: Rewire `skills dev`, workbench startup, and runtime materialization

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/application/skills/start-skill-dev-workbench.js`
- Modify: `src/infrastructure/runtime/materialize-skills.js`
- Modify: `src/commands/skills.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Write the failing tests**

Add integration coverage for:

- `skills dev <skill-dir>` targeting an export inside a multi-skill package
- `skills dev <SKILL.md>` targeting the same export
- `skills dev <package-dir>` returning a clear `ambiguous_skill_target` error with export suggestions
- workbench state using the resolved package name and correct export identity

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test test/integration/skills-dev.test.js`
Expected: FAIL because dev resolution still requires sibling `package.json` and root-skill assumptions.

- [ ] **Step 3: Implement the `dev` rewiring**

Modify `src/lib/skills.js`, `src/application/skills/start-skill-dev-workbench.js`, and `src/infrastructure/runtime/materialize-skills.js` to:

- resolve dev targets through the shared resolver
- require exactly one export for active dev sessions
- derive package context from the resolved package object rather than the immediate skill directory
- preserve current symlink and workbench behavior for single-export packages

Update `src/commands/skills.js` text output only where needed to surface the new ambiguous-target guidance cleanly.

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `node --test test/integration/skills-dev.test.js`
Expected: PASS for precise multi-skill dev targets and clear ambiguity handling.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills.js src/application/skills/start-skill-dev-workbench.js src/infrastructure/runtime/materialize-skills.js src/commands/skills.js test/integration/skills-dev.test.js
git commit -m "feat: support shared target resolution in skills dev"
```

## Chunk 3: Wrapper Metadata Foundation

### Task 5: Add wrapper metadata parsing and inspection groundwork

**Files:**
- Modify: `src/domain/skills/skill-model.js`
- Modify: `src/lib/skills.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-stale.test.js`

- [ ] **Step 1: Write the failing tests**

Add coverage for:

- parsing `wraps` and `overrides` from skill frontmatter
- `skills inspect` surfacing wrapper metadata for a local wrapper export
- stale/build-state generation recording wrapped-target provenance fields without yet implementing full auto-refresh

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
node --test test/integration/skills-inspect.test.js
node --test test/integration/skills-stale.test.js
```

Expected: FAIL because wrapper metadata is not part of the normalized export model or CLI output.

- [ ] **Step 3: Implement the wrapper metadata foundation**

Modify model and orchestration code so:

- `wraps` is accepted as one upstream export identity
- `overrides` is accepted as a list of local reference paths
- inspection output includes wrapper metadata when present
- build-state can record wrapped-target identity and enough source context for future drift checks

Normalize wrapper metadata into one internal shape even if compatibility requires accepting both top-level and `metadata.*` forms during rollout.

Do not add `skills wrap` scaffolding in this task.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run the same two test files again.
Expected: PASS for wrapper metadata parsing and inspection groundwork.

- [ ] **Step 5: Commit**

```bash
git add src/domain/skills/skill-model.js src/lib/skills.js test/integration/skills-inspect.test.js test/integration/skills-stale.test.js
git commit -m "feat: add wrapper metadata groundwork for skill exports"
```

## Chunk 4: Intent Wrapper Contract

### Task 6: Lock down the bundled `intent` CLI wrapper

**Files:**
- Modify: `bin/intent.js`
- Create: `test/integration/intent-bin.test.js`

- [ ] **Step 1: Write the failing test**

Add a regression test that executes `bin/intent.js` against a controlled fixture or mocked `@tanstack/intent` package export and verifies:

- CLI arguments are forwarded
- stdout is emitted when the upstream CLI succeeds
- a clear error is printed when the package is absent

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/intent-bin.test.js`
Expected: FAIL because the current wrapper only imports `intent-library` and does not assert the real CLI contract.

- [ ] **Step 3: Implement the wrapper fix**

Update `bin/intent.js` to invoke the package's supported CLI entrypoint explicitly and preserve process IO behavior. Avoid hard-coding a brittle deep file path if the package exposes a stable public entrypoint; if that does not exist, centralize the fallback in one small compatibility branch with comments explaining the version constraint.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/intent-bin.test.js`
Expected: PASS for the wrapper contract scenarios.

- [ ] **Step 5: Commit**

```bash
git add bin/intent.js test/integration/intent-bin.test.js
git commit -m "fix: forward bundled intent binary to the upstream cli"
```

## Chunk 5: Full Verification

### Task 7: Run focused and full regressions

**Files:**
- Modify: only if regressions are discovered

- [ ] **Step 1: Run focused suites**

Run:

```bash
node --test test/integration/skills-authoring-metadata.test.js
node --test test/integration/skills-inspect.test.js
node --test test/integration/skills-validate.test.js
node --test test/integration/skills-dev.test.js
node --test test/integration/skills-stale.test.js
node --test test/integration/intent-bin.test.js
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with no regressions

- [ ] **Step 3: Smoke-test the issue scenarios**

Run against a controlled multi-skill fixture or live local package that mirrors the GitHub issues:

```bash
node bin/agentpack.js skills inspect <multi-skill-package>
node bin/agentpack.js skills validate <multi-skill-package>
node bin/agentpack.js skills validate
node bin/agentpack.js skills dev <multi-skill-export>
node bin/intent.js list
```

Expected:

- inspect resolves package and export targets consistently
- validate covers local authored multi-skill packages
- dev accepts precise export targets and rejects ambiguous package targets clearly
- intent wrapper prints upstream CLI output instead of blank output

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify shared skill target catalog rollout"
```
