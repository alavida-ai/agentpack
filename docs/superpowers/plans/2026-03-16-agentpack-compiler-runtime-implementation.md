# Agentpack Compiler Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-architect agentpack around package-scoped compilation, workspace-scoped semantic state, and package-local runtime build output.

**Architecture:** Build one canonical semantic workspace index in root `.agentpack/compiled.json`, keyed by package, while emitting package-local runtime `dist/` artifacts per export. Keep `build` and `validate` package-scoped, keep `dev` package-correct but selected-export focused, and make dashboard/runtime consumers read from the new layers instead of inventing ad hoc graph truth.

**Tech Stack:** Node.js, native `node:test`, existing repo-lab integration harness, Playwright, package-local runtime adapters

---

## Chunk 1: Package-Partitioned Semantic State

### Task 1: Lock failing coverage for package-indexed compiled state

**Files:**
- Modify: `test/integration/skills-build.test.js`
- Modify: `test/integration/skills-compiled-state.test.js`
- Modify: `test/infrastructure/compiled-state-repository.test.js`

- [ ] **Step 1: Write failing integration and repository tests**
- [ ] **Step 2: Run targeted tests to verify the current flat artifact fails**
- [ ] **Step 3: Implement package-indexed compiled state persistence and merge semantics**
- [ ] **Step 4: Re-run targeted tests to verify the new state shape passes**

### Task 2: Compile package truth instead of one export

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/domain/skills/workspace-graph.js`
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Modify: `test/integration/skills-compiled-state.test.js`

- [ ] **Step 1: Add failing tests for multi-export package compilation**
- [ ] **Step 2: Run targeted tests to verify sub-skill provenance is missing**
- [ ] **Step 3: Implement package-wide compilation and package entry generation**
- [ ] **Step 4: Re-run targeted tests to verify all exports/sources/edges are included**

### Task 3: Support modern no-import skills and correct relative target resolution

**Files:**
- Modify: `packages/agentpack/src/domain/compiler/skill-document-parser.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Modify: `test/domain/skill-document-parser.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-build.test.js`

- [ ] **Step 1: Add failing parser and integration tests for modern no-import skills and relative targets**
- [ ] **Step 2: Run targeted tests to verify current behavior rejects them**
- [ ] **Step 3: Implement package-aware modern skill detection and relative target resolution**
- [ ] **Step 4: Re-run targeted tests to verify the fixes**

## Chunk 2: Runtime Build and Materialization

### Task 4: Emit package-local runtime `dist/` artifacts per export

**Files:**
- Create: `packages/agentpack/src/application/skills/build-runtime-artifacts.js`
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `test/integration/skills-materialize.test.js`
- Create/Modify: runtime artifact build tests

- [ ] **Step 1: Add failing tests for package-local `dist/` output and runtime syntax stripping**
- [ ] **Step 2: Run targeted tests to verify `dist/` is not emitted today**
- [ ] **Step 3: Implement runtime artifact building per export**
- [ ] **Step 4: Re-run targeted tests to verify runtime `SKILL.md` artifacts are emitted**

### Task 5: Materialize built runtime artifacts instead of authored source

**Files:**
- Modify: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js`
- Modify: `test/integration/skills-materialize.test.js`

- [ ] **Step 1: Add failing integration tests proving materialization should read from `dist/`**
- [ ] **Step 2: Run targeted tests to verify the current adapters still point at authored source**
- [ ] **Step 3: Implement materialization from built artifacts**
- [ ] **Step 4: Re-run targeted tests to verify adapter outputs use built runtime artifacts**

## Chunk 3: Package-Correct Dev and Validate Semantics

### Task 6: Make build and validate explicitly package-scoped

**Files:**
- Modify: `packages/agentpack/src/application/skills/validate-skills.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add failing tests for package-scoped build/validate semantics**
- [ ] **Step 2: Run targeted tests to verify current scope is ambiguous**
- [ ] **Step 3: Implement package-scoped command semantics**
- [ ] **Step 4: Re-run targeted tests to verify package truth behavior**

### Task 7: Rebuild whole package in dev while exposing only selected closure

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Add failing tests for selected-export closure materialization**
- [ ] **Step 2: Run targeted tests to verify unrelated siblings are ambient today**
- [ ] **Step 3: Implement selected skill/source closure computation and dev materialization**
- [ ] **Step 4: Re-run targeted tests to verify focused dev exposure**

## Chunk 4: Discovery and Dashboard UX

### Task 8: Expand installed discovery and version visibility

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/installed-workspace-graph.js`
- Modify: `packages/agentpack/src/application/skills/runtime-activation.js`
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `test/integration/skills-enable-disable.test.js`
- Create/Modify: `test/integration/skills-list*.test.js`

- [ ] **Step 1: Add failing integration tests for nested `node_modules` discovery and version warnings**
- [ ] **Step 2: Run targeted tests to verify current root-only discovery**
- [ ] **Step 3: Implement workspace-level installed discovery and list warnings**
- [ ] **Step 4: Re-run targeted tests to verify the new inventory behavior**

### Task 9: Render edge context and internal/external distinctions in the workbench

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `test/application/build-skill-workbench-model.test.js`
- Modify: `test/e2e/skills-dev-workbench.spec.js`

- [ ] **Step 1: Add failing workbench model and e2e tests for edge contexts and dependency type markers**
- [ ] **Step 2: Run targeted tests to verify the current graph omits them**
- [ ] **Step 3: Implement canonical-state-driven model/UI updates with stable selectors**
- [ ] **Step 4: Re-run targeted tests to verify the dashboard behavior**

## Chunk 5: End-to-End Verification

### Task 10: Run full verification and live sandbox smoke suites

**Files:**
- Verify only

- [ ] **Step 1: Run affected unit, integration, and e2e suites**
- [ ] **Step 2: Run `npm run test:unit` and any required targeted commands**
- [ ] **Step 3: Run live sandbox validation in `agonda`**
- [ ] **Step 4: Run live sandbox validation in `/Users/alexandergirardet/alavida/superpowers`**
- [ ] **Step 5: Record any residual gaps before closing tickets**
