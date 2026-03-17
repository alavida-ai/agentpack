# Agentpack Runtime Selection Refactor Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor agentpack so `author dev`, authored-package materialization, and workbench refresh all sit on top of shared build, runtime-selection, and materialization services instead of each carrying their own closure/materialization logic.

**Specs:**
- [2026-03-16-agentpack-workspace-compiler-runtime-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-16-agentpack-workspace-compiler-runtime-design.md)
- [2026-03-17-agentpack-runtime-selection-refactor-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-17-agentpack-runtime-selection-refactor-design.md)

**Architecture constraint:** Do not try to unify authored-package and installed-package graph resolution in the same slice. First centralize authored-package selection/materialization, then let installed activation reuse only the stable materialization primitives.

**Verification requirement:** Keep the harness-first order. Add failing integration/application tests first. Re-run `npm run test:models` and `npm run test:sandboxes -- --no-browser-checks` before declaring the refactor complete.

---

## Chunk 1: Canonical Runtime Selection for Authored Packages

### Task 1: Lock failing coverage for authored runtime selection

**Files:**
- Create: `test/application/compute-runtime-selection.test.js`
- Modify: `test/integration/skills-materialize.test.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add failing tests for package selection and selected-export closure selection**
- [ ] **Step 2: Add failing tests proving dev and authored materialize should expose the same built runtime artifacts**
- [ ] **Step 3: Run targeted tests to verify closure/materialization logic is still duplicated today**

### Task 2: Introduce `compute-runtime-selection-use-case`

**Files:**
- Create: `packages/agentpack/src/application/skills/compute-runtime-selection.js`
- Modify: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Modify: `packages/agentpack/src/lib/skills.js`

- [ ] **Step 1: Implement canonical selection shape for authored package entries**
- [ ] **Step 2: Support `package` and `closure` selection modes**
- [ ] **Step 3: Re-run targeted tests to verify selection outputs are deterministic and correct**

---

## Chunk 2: Shared Authored-Package Materialization

### Task 3: Introduce `materialize-runtime-selection-use-case`

**Files:**
- Create: `packages/agentpack/src/application/skills/materialize-runtime-selection.js`
- Modify: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js`
- Modify: `packages/agentpack/src/infrastructure/fs/materialization-state-repository.js` if needed

- [ ] **Step 1: Add failing tests proving authored materialization should consume an explicit runtime selection contract**
- [ ] **Step 2: Implement selection-driven adapter materialization**
- [ ] **Step 3: Ensure removal of no-longer-selected links is handled centrally**
- [ ] **Step 4: Re-run targeted tests to verify authored materialize now uses the shared service**

### Task 4: Remove authored-package direct linking from dev

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add failing tests proving dev must not link authored skill directories directly**
- [ ] **Step 2: Replace direct `ensureSkillLink(...)` calls in dev with the shared materialization service**
- [ ] **Step 3: Delete `resolveDevLinkedSkills` or reduce it to selection service delegation**
- [ ] **Step 4: Re-run targeted dev tests to verify dev and authored materialize share the same adapter behavior**

---

## Chunk 3: Thin Dev Orchestration

### Task 5: Collapse `author dev` onto shared build + selection + materialization services

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/commands/author.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add failing tests for package-wide rebuild with selected-export-focused runtime exposure**
- [ ] **Step 2: Make `startSkillDev` orchestrate only**
- [ ] **Step 3: Restrict dev-owned logic to session lifecycle, cleanup, and watch scheduling**
- [ ] **Step 4: Re-run targeted dev tests to verify dev is now a client of shared services**

### Task 6: Align dev session state with canonical selection output

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/infrastructure/fs/dev-session-repository.js` if needed
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add failing tests for session records reflecting selected runtime artifacts rather than ad hoc linked skill state**
- [ ] **Step 2: Update dev session record generation to derive from canonical selection/materialization outputs**
- [ ] **Step 3: Re-run targeted tests to verify cleanup/reconciliation still work**

---

## Chunk 4: Workbench Watch and Model Cleanup

### Task 7: Replace workbench direct parsing with compiled/selection-driven watch inputs

**Files:**
- Modify: `packages/agentpack/src/infrastructure/runtime/watch-skill-workbench.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Add failing tests proving the watcher should track package skill files and selected closure sources without reparsing source directly**
- [ ] **Step 2: Remove direct `compileSkillDocument(...)` watcher logic**
- [ ] **Step 3: Make watch inputs come from canonical selection state**
- [ ] **Step 4: Re-run targeted tests to verify watch-driven rebuild behavior**

### Task 8: Make workbench model construction consume canonical selection/compiled state

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `test/application/build-skill-workbench-model.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Add failing tests for selected-export closure nodes, source nodes, and edge rendering from canonical state**
- [ ] **Step 2: Remove older compiled-state shape assumptions from workbench model building**
- [ ] **Step 3: Re-run targeted application and integration tests to verify workbench graph correctness**

---

## Chunk 5: Follow-On Service Cleanup

### Task 9: Move remaining authored-package inspect/validate/stale helpers out of `lib/skills.js`

**Files:**
- Modify: `packages/agentpack/src/application/skills/inspect-compiled-skill.js`
- Modify: `packages/agentpack/src/application/skills/inspect-skill.js`
- Modify: `packages/agentpack/src/application/skills/validate-skills.js`
- Modify: `packages/agentpack/src/application/skills/list-stale-skills.js`
- Modify: `packages/agentpack/src/lib/skills.js`

- [ ] **Step 1: Add failing tests only where behavior changes or contract cleanup is observable**
- [ ] **Step 2: Move helper logic behind application use cases**
- [ ] **Step 3: Reduce `lib/skills.js` to orchestration/session/install concerns**
- [ ] **Step 4: Re-run affected tests to verify no behavior regressions**

### Task 10: Reuse stable materialization primitives in installed runtime activation

**Files:**
- Modify: `packages/agentpack/src/application/skills/runtime-activation.js`
- Modify: shared materialization service files created above
- Modify: `test/integration/skills-enable-disable.test.js`

- [ ] **Step 1: Add failing tests proving authored and installed flows share adapter application semantics**
- [ ] **Step 2: Reuse stable materialization primitives without unifying authored and installed graph resolution**
- [ ] **Step 3: Re-run targeted installed-runtime tests to verify no regression**

---

## Chunk 6: Verification and Sandboxes

### Task 11: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted local suites for runtime selection, materialization, dev, and workbench**
- [ ] **Step 2: Run broader regression suites affected by the refactor**
- [ ] **Step 3: Run `npm run test:models`**
- [ ] **Step 4: Run `npm run test:sandboxes -- --no-browser-checks`**
- [ ] **Step 5: If localhost/browser conditions are stable, run `npm run test:sandboxes`**
- [ ] **Step 6: Record residual gaps before closing the refactor ticket**

---

## Stress-Test Notes

### Why this sequence is safe

- It centralizes authored-package selection first, where the current duplication is worst.
- It delays installed-runtime alignment until the authored contract is stable.
- It avoids mixing workbench refactors with closure/materialization extraction in the same first slice.

### Main implementation risks

- Creating a new selection service without deleting the old dev walker
- Letting workbench watch logic continue to parse source directly
- Attempting to merge authored and installed graph resolution instead of only sharing materialization primitives

### Success condition

The refactor is successful when `author dev` becomes:

1. build package
2. compute closure selection
3. materialize selection
4. manage session/watch/workbench lifecycle

and nothing more.
