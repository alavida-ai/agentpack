# Skill Lifecycle Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `agentpack` around a shared packaged-skill lifecycle core, fix build-state ownership in that core, and reduce architectural brittleness without changing the CLI contract unnecessarily.

**Architecture:** Introduce a layered internal structure where commands are thin adapters, application use cases orchestrate workflows, domain modules own skill model/graph/provenance/rules, and infrastructure modules own filesystem and package-resolution side effects. Land the redesign incrementally, starting with provenance/build-state so the current bug is fixed in the right boundary.

**Tech Stack:** Node.js 20+, ESM, Commander, Node test runner, fixture-based integration tests

---

## Chunk 1: Baseline And Provenance Boundary

### Task 1: Lock the current build-state contract with focused regression tests

**Files:**
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-stale.test.js`
- Test: `test/integration/skills-validate.test.js`
- Test: `test/integration/skills-stale.test.js`

- [ ] **Step 1: Add or tighten failing regression coverage for build-state recording**

Add assertions that successful validation:
- creates `.agentpack/build-state.json`
- records `package_version`, `skill_path`, `skill_file`, `sources`, and `requires`
- preserves unrelated existing entries when validating one skill

- [ ] **Step 2: Add or tighten failing stale-detection coverage**

Add assertions that:
- a changed source marks the validated skill stale
- a dependent skill can still surface as affected through shared graph status once later graph extraction lands

- [ ] **Step 3: Run only the targeted tests to verify expected baseline behavior**

Run: `node --test test/integration/skills-validate.test.js test/integration/skills-stale.test.js`

Expected:
- current build-state regression test passes
- any newly added assertions that expose missing preservation or shape behavior fail before implementation

- [ ] **Step 4: Commit the test-only baseline if it introduces new failing coverage**

```bash
git add test/integration/skills-validate.test.js test/integration/skills-stale.test.js
git commit -m "test: lock build-state lifecycle contract"
```

### Task 2: Extract provenance logic from `skills.js`

**Files:**
- Create: `src/domain/skills/skill-provenance.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-validate.test.js`
- Test: `test/integration/skills-stale.test.js`

- [ ] **Step 1: Create `src/domain/skills/skill-provenance.js`**

Move or introduce focused exports for:
- `hashFile`
- `readBuildState`
- `writeBuildState`
- `buildStateRecordForPackageDir`
- `compareRecordedSources`

Keep interfaces narrow and pure where possible.

- [ ] **Step 2: Update `src/lib/skills.js` to consume provenance helpers**

Replace the in-file provenance/build-state helpers with imports from `src/domain/skills/skill-provenance.js`.

- [ ] **Step 3: Keep `validateSkills()` recording build-state through the new module**

Ensure successful validation still records build-state and only valid skills are written.

- [ ] **Step 4: Run the targeted regression tests**

Run: `node --test test/integration/skills-validate.test.js test/integration/skills-stale.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit the provenance extraction**

```bash
git add src/domain/skills/skill-provenance.js src/lib/skills.js test/integration/skills-validate.test.js test/integration/skills-stale.test.js
git commit -m "refactor: extract skill provenance lifecycle"
```

### Task 3: Add small direct tests for provenance helpers

**Files:**
- Create: `test/domain/skill-provenance.test.js`
- Test: `test/domain/skill-provenance.test.js`

- [ ] **Step 1: Add focused tests around provenance helper behavior**

Cover:
- deterministic source hash shape
- record creation for a valid packaged skill dir
- stale comparison when one source changes

- [ ] **Step 2: Run the new provenance unit tests**

Run: `node --test test/domain/skill-provenance.test.js`

Expected:
- PASS

- [ ] **Step 3: Commit the domain-level provenance tests**

```bash
git add test/domain/skill-provenance.test.js
git commit -m "test: add skill provenance module coverage"
```

## Chunk 2: Skill Model And Graph Extraction

### Task 4: Extract skill model parsing and normalization

**Files:**
- Create: `src/domain/skills/skill-model.js`
- Modify: `src/lib/skills.js`
- Modify: `src/lib/plugins.js`
- Test: `test/integration/skills-validate.test.js`
- Test: `test/integration/skills-dependencies.test.js`
- Test: `test/integration/plugin-build.test.js`

- [ ] **Step 1: Create `src/domain/skills/skill-model.js`**

Move or introduce focused exports for:
- skill frontmatter parsing accessors
- package metadata normalization
- normalized authored skill record construction
- common path normalization used by both skills and plugin workflows

- [ ] **Step 2: Replace direct parsing helpers in `src/lib/skills.js`**

Update existing call sites to use the model module.

- [ ] **Step 3: Replace direct parsing helpers in `src/lib/plugins.js`**

Plugin code should stop reading/parsing skill metadata ad hoc where shared model helpers can be used.

- [ ] **Step 4: Run targeted tests**

Run: `node --test test/integration/skills-validate.test.js test/integration/skills-dependencies.test.js test/integration/plugin-build.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit the model extraction**

```bash
git add src/domain/skills/skill-model.js src/lib/skills.js src/lib/plugins.js test/integration/skills-validate.test.js test/integration/skills-dependencies.test.js test/integration/plugin-build.test.js
git commit -m "refactor: extract skill model module"
```

### Task 5: Extract graph resolution and affected-state logic

**Files:**
- Create: `src/domain/skills/skill-graph.js`
- Modify: `src/lib/skills.js`
- Modify: `src/lib/plugins.js`
- Create: `test/domain/skill-graph.test.js`
- Test: `test/domain/skill-graph.test.js`
- Test: `test/integration/skills-dependencies.test.js`
- Test: `test/integration/skills-missing.test.js`
- Test: `test/integration/plugin-build.test.js`

- [ ] **Step 1: Create `src/domain/skills/skill-graph.js`**

Extract or introduce focused exports for:
- dependency closure
- reverse dependency discovery
- affected-state propagation
- plugin bundle graph inputs where appropriate

- [ ] **Step 2: Update skills workflows to use the graph module**

Replace graph traversal and dependency-status logic in `src/lib/skills.js`.

- [ ] **Step 3: Update plugin workflows to use the graph module**

Plugin bundle inspection and validation should consume shared graph logic rather than parallel traversal where possible.

- [ ] **Step 4: Add focused domain tests**

Cover:
- direct dependency closure
- transitive dependency closure
- affected-state propagation from stale dependencies

- [ ] **Step 5: Run targeted graph and integration tests**

Run: `node --test test/domain/skill-graph.test.js test/integration/skills-dependencies.test.js test/integration/skills-missing.test.js test/integration/plugin-build.test.js`

Expected:
- PASS

- [ ] **Step 6: Commit the graph extraction**

```bash
git add src/domain/skills/skill-graph.js src/lib/skills.js src/lib/plugins.js test/domain/skill-graph.test.js test/integration/skills-dependencies.test.js test/integration/skills-missing.test.js test/integration/plugin-build.test.js
git commit -m "refactor: extract skill graph module"
```

## Chunk 3: Application Use Cases And Thin Commands

### Task 6: Introduce application use cases for skill workflows

**Files:**
- Create: `src/application/skills/validate-skills.js`
- Create: `src/application/skills/inspect-skill.js`
- Create: `src/application/skills/list-stale-skills.js`
- Modify: `src/commands/skills.js`
- Modify: `src/lib/skills.js`
- Test: `test/integration/skills-validate.test.js`
- Test: `test/integration/skills-json.test.js`
- Test: `test/integration/skills-stale.test.js`

- [ ] **Step 1: Create `validate-skills` use case**

Move workflow sequencing for dependency sync, validation, and provenance recording behind the application layer.

- [ ] **Step 2: Create `inspect-skill` and `list-stale-skills` use cases**

Move command-directed orchestration into application modules.

- [ ] **Step 3: Update `src/commands/skills.js` to call application use cases**

Commands should parse input and format output only.

- [ ] **Step 4: Keep `src/lib/skills.js` as compatibility shim or internal helper host temporarily**

Do not remove it entirely in this slice if that increases risk; shrink it and delegate outward.

- [ ] **Step 5: Run targeted integration tests**

Run: `node --test test/integration/skills-validate.test.js test/integration/skills-json.test.js test/integration/skills-stale.test.js`

Expected:
- PASS

- [ ] **Step 6: Commit the first application-layer extraction**

```bash
git add src/application/skills/validate-skills.js src/application/skills/inspect-skill.js src/application/skills/list-stale-skills.js src/commands/skills.js src/lib/skills.js test/integration/skills-validate.test.js test/integration/skills-json.test.js test/integration/skills-stale.test.js
git commit -m "refactor: add skill application use cases"
```

### Task 7: Introduce application use cases for plugin workflows

**Files:**
- Create: `src/application/plugins/inspect-plugin-bundle.js`
- Create: `src/application/plugins/validate-plugin-bundle.js`
- Create: `src/application/plugins/build-plugin.js`
- Modify: `src/commands/plugin.js`
- Modify: `src/lib/plugins.js`
- Test: `test/integration/plugin-build.test.js`
- Test: `test/integration/plugin-validate.test.js`

- [ ] **Step 1: Create plugin application use cases**

Move orchestration out of `src/lib/plugins.js`, leaving plugin-specific infrastructure and reusable helpers behind.

- [ ] **Step 2: Update `src/commands/plugin.js` to call use cases**

Keep command code thin and output-focused.

- [ ] **Step 3: Ensure plugin use cases consume shared skill model/graph/provenance rules**

Do not reintroduce parallel lifecycle logic.

- [ ] **Step 4: Run targeted plugin integration tests**

Run: `node --test test/integration/plugin-build.test.js test/integration/plugin-validate.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit the plugin use-case layer**

```bash
git add src/application/plugins/inspect-plugin-bundle.js src/application/plugins/validate-plugin-bundle.js src/application/plugins/build-plugin.js src/commands/plugin.js src/lib/plugins.js test/integration/plugin-build.test.js test/integration/plugin-validate.test.js
git commit -m "refactor: add plugin application use cases"
```

## Chunk 4: Infrastructure Boundaries And Cleanup

### Task 8: Extract file-backed repositories for build/install state

**Files:**
- Create: `src/infrastructure/fs/build-state-repository.js`
- Create: `src/infrastructure/fs/install-state-repository.js`
- Modify: `src/domain/skills/skill-provenance.js`
- Modify: `src/lib/skills.js`
- Test: `test/domain/skill-provenance.test.js`
- Test: `test/integration/skills-env.test.js`
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-uninstall.test.js`

- [ ] **Step 1: Create build-state repository module**

Encapsulate reading and writing `.agentpack/build-state.json`.

- [ ] **Step 2: Create install-state repository module**

Encapsulate reading and writing `.agentpack/install.json`.

- [ ] **Step 3: Update provenance and runtime workflows to use repositories**

Keep domain logic free of direct file persistence details where practical.

- [ ] **Step 4: Run targeted tests**

Run: `node --test test/domain/skill-provenance.test.js test/integration/skills-env.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit repository extraction**

```bash
git add src/infrastructure/fs/build-state-repository.js src/infrastructure/fs/install-state-repository.js src/domain/skills/skill-provenance.js src/lib/skills.js test/domain/skill-provenance.test.js test/integration/skills-env.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js
git commit -m "refactor: extract state repository modules"
```

### Task 9: Extract runtime/materialization helpers

**Files:**
- Create: `src/infrastructure/runtime/materialize-skills.js`
- Create: `src/infrastructure/runtime/watch-tree.js`
- Modify: `src/lib/skills.js`
- Modify: `src/lib/plugins.js`
- Test: `test/integration/skills-dev.test.js`
- Test: `test/integration/plugin-build.test.js`

- [ ] **Step 1: Create runtime materialization module**

Move local link/reconcile/materialization side effects into a dedicated infrastructure module.

- [ ] **Step 2: Create reusable watch-tree module**

Deduplicate or centralize filesystem watch behavior used by dev flows.

- [ ] **Step 3: Update skill and plugin dev/build flows**

Keep orchestration above these helpers; isolate side effects here.

- [ ] **Step 4: Run targeted tests**

Run: `node --test test/integration/skills-dev.test.js test/integration/plugin-build.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit runtime extraction**

```bash
git add src/infrastructure/runtime/materialize-skills.js src/infrastructure/runtime/watch-tree.js src/lib/skills.js src/lib/plugins.js test/integration/skills-dev.test.js test/integration/plugin-build.test.js
git commit -m "refactor: extract runtime materialization helpers"
```

## Chunk 5: Final Verification And Documentation

### Task 10: Update docs to reflect the new internal architecture

**Files:**
- Modify: `docs/architecture.mdx`
- Modify: `docs/current-state.mdx`
- Modify: `docs/implementation-plan.mdx`
- Test: documentation review only

- [ ] **Step 1: Update architecture docs**

Document:
- packaged skills as first-class domain
- plugin workflows as composition over the skill core
- explicit build-state/provenance ownership

- [ ] **Step 2: Update current-state and implementation docs**

Reflect the new internal structure without overstating any unimplemented future state.

- [ ] **Step 3: Commit docs updates**

```bash
git add docs/architecture.mdx docs/current-state.mdx docs/implementation-plan.mdx
git commit -m "docs: describe skill lifecycle architecture"
```

### Task 11: Run full verification before declaring success

**Files:**
- Test: `test/**/*.test.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected:
- PASS

- [ ] **Step 2: Spot-check the highest-risk CLI contracts**

Run:
- `node bin/agentpack.js skills validate --json`
- `node bin/agentpack.js skills stale --json`
- `node bin/agentpack.js plugin validate test/fixtures/...` (choose an existing passing fixture path)

Expected:
- valid JSON output
- no crashes
- behavior consistent with integration coverage

- [ ] **Step 3: Inspect the resulting diff and remaining monolith size**

Run:
- `git diff --stat`
- `wc -l src/lib/skills.js src/lib/plugins.js src/application/skills/*.js src/application/plugins/*.js src/domain/skills/*.js`

Expected:
- `src/lib/skills.js` materially smaller
- new module boundaries visible in the diff

- [ ] **Step 4: Commit final verification or cleanup changes if needed**

```bash
git add .
git commit -m "refactor: complete skill lifecycle architecture reshaping"
```
