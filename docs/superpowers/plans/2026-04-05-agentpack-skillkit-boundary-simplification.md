# Agentpack SkillKit Boundary Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow agentpack to a source-aware compiler/bundler that emits portable `dist/` bundles, rename `publish validate` to `validate`, and deprecate materialization-first workflows in favor of SkillKit/plugins for Claude Code and Codex.

**Architecture:** Keep compiled semantic state and authored dependency closure in agentpack, but move downstream runtime-folder installation out of the main product story. `author build` remains the build primitive, `validate` becomes the release gate, and `materialize` commands become compatibility-only surfaces with clear deprecation messaging while docs and tests shift to `build -> SkillKit/plugin`.

**Tech Stack:** Node.js, commander, native test runner (`node --test`), existing repo-lab integration harness, SkillKit compatibility smoke via CLI commands.

---

## Chunk 1: Command Surface Simplification

### Task 1: Add failing tests for `validate` as the primary release gate

**Files:**
- Modify: `test/integration/agentpack-bin.test.js`
- Modify: `test/integration/intent-bin.test.js`

- [ ] **Step 1: Add a failing integration test for `agentpack validate <target>`**

Assert:
- `agentpack validate <target>` exits the same way as `agentpack publish validate <target>`
- JSON output shape matches the current validate result
- text output preserves validation summary semantics

Run: `node --test test/integration/agentpack-bin.test.js`
Expected: FAIL because `validate` does not exist yet.

- [ ] **Step 2: Add a failing alias test for `agentpack publish validate <target>`**

Assert:
- command still works
- output includes a deprecation warning or metadata indicating legacy usage

Run: `node --test test/integration/agentpack-bin.test.js`
Expected: FAIL because deprecation behavior does not exist yet.

### Task 2: Implement top-level `validate` and deprecate the old publish wrapper

**Files:**
- Modify: `packages/agentpack/src/cli.js`
- Modify: `packages/agentpack/src/commands/publish.js`
- Create or Modify: `packages/agentpack/src/commands/validate.js`

- [ ] **Step 1: Write the minimal command implementation**

Implement a top-level `validate` command that directly calls the existing validation use case.

- [ ] **Step 2: Keep `publish validate` as a compatibility alias**

Add deprecation messaging in text output and JSON output if appropriate.

- [ ] **Step 3: Verify command behavior**

Run: `node --test test/integration/agentpack-bin.test.js`
Expected: PASS

## Chunk 2: Materialize Deprecation And SkillKit-First Flow

### Task 3: Add failing tests for deprecated materialize command messaging

**Files:**
- Modify: `test/integration/skills-materialize.test.js`
- Modify: `test/integration/materialize-command.test.js`

- [ ] **Step 1: Add a failing test for `author materialize` deprecation messaging**

Assert:
- command still succeeds
- output clearly marks it as compatibility-only
- output points users to `agentpack author build` plus SkillKit/plugins

Run: `node --test test/integration/skills-materialize.test.js`
Expected: FAIL because no deprecation messaging exists yet.

- [ ] **Step 2: Add a failing test for top-level `materialize` deprecation messaging**

Assert:
- command still succeeds
- output clearly marks it as legacy / compatibility-only

Run: `node --test test/integration/materialize-command.test.js`
Expected: FAIL because no deprecation messaging exists yet.

### Task 4: Implement deprecation messaging without breaking compatibility

**Files:**
- Modify: `packages/agentpack/src/commands/author.js`
- Modify: `packages/agentpack/src/commands/materialize.js`
- Modify: `packages/agentpack/src/utils/output.js` if needed

- [ ] **Step 1: Add minimal deprecation notices**

Keep the commands functional, but make it explicit that:
- preferred local install is SkillKit
- preferred plugin path is `"skills": "./dist"`

- [ ] **Step 2: Verify materialize compatibility**

Run: `node --test test/integration/skills-materialize.test.js test/integration/materialize-command.test.js`
Expected: PASS

## Chunk 3: Bundle Completeness For Portable Dist

### Task 5: Add failing tests for package runtime payload bundling

**Files:**
- Modify: `test/integration/skills-build.test.js`
- Modify: `test/integration/fixtures.js`

- [ ] **Step 1: Extend fixture coverage for runtime payload directories**

Create fixture packages with additional runtime payload such as:
- `scripts/`
- `lib/`
- `data/`

- [ ] **Step 2: Add a failing test proving the selected package payload is copied into `dist`**

Assert after `agentpack author build <target>`:
- runtime skills still exist
- package-level payload folders exist under target `dist`
- bundled reference files still exist

Run: `node --test test/integration/skills-build.test.js`
Expected: FAIL because agentpack currently only writes runtime skill artifacts and copied references.

- [ ] **Step 3: Add a failing test for dependency package payload folders when those packages are in the authored closure**

Assert closure dependencies bring their own runtime-supporting payload into the target bundle contract when required by the selected closure design.

Run: `node --test test/integration/skills-build.test.js`
Expected: FAIL

### Task 6: Implement package payload copying into built bundles

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-authored-runtime-bundle.js`
- Modify: `packages/agentpack/src/application/skills/build-runtime-artifacts.js`
- Create if needed: `packages/agentpack/src/application/skills/copy-runtime-payload.js`

- [ ] **Step 1: Implement a focused helper that copies package runtime payload into target `dist`**

Do not infer from prose. Keep the copy contract deterministic.

- [ ] **Step 2: Preserve manifest semantics**

Keep:
- `dist/agentpack.json` package-scoped
- `dist/.agentpack-bundle.json` authored/plugin-scoped

- [ ] **Step 3: Verify build behavior**

Run: `node --test test/integration/skills-build.test.js`
Expected: PASS

## Chunk 4: Documentation And SkillKit Workflow Shift

### Task 7: Update docs and built-in skills to the new workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/publishing.mdx`
- Modify: `docs/staleness.mdx`
- Modify: `packages/agentpack/skills/agentpack-cli/SKILL.md`
- Modify: `packages/agentpack/skills/getting-started-skillgraphs/SKILL.md`
- Modify: `packages/agentpack/skills/publishing-skill-packages/SKILL.md`

- [ ] **Step 1: Replace `publish validate` references with `validate`**

- [ ] **Step 2: Replace materialize-first instructions with `build -> SkillKit/plugin`**

Include concrete examples for:
- Claude Code plugin pointing at `./dist`
- SkillKit install from local `dist`
- Codex install from local `dist`

- [ ] **Step 3: Keep compatibility notes brief and explicit**

- [ ] **Step 4: Verify no stale command references remain**

Run: `rg -n "publish validate|author materialize|agentpack materialize" README.md docs packages/agentpack/skills`
Expected: only compatibility notes or explicit deprecation references remain.

## Chunk 5: Verification

### Task 8: Run focused verification for the simplified boundary

**Files:**
- No code changes

- [ ] **Step 1: Run targeted agentpack integration coverage**

Run:
```bash
node --test test/integration/agentpack-bin.test.js test/integration/skills-build.test.js test/integration/skills-materialize.test.js test/integration/materialize-command.test.js
```

Expected: PASS

- [ ] **Step 2: Run focused domain/application regression tests**

Run:
```bash
node --test test/application/compute-runtime-selection.test.js test/domain/installed-workspace-graph.test.js
```

Expected: PASS

- [ ] **Step 3: Re-run SkillKit compatibility smoke manually from the built workflow**

Run:
```bash
npx -y skillkit@latest install ./<built-dist> --yes --agent claude-code
npx -y skillkit@latest install ./<built-dist> --yes --agent codex
```

Expected:
- successful install into `.claude/skills`
- successful install into `.codex/skills`
- bundled references preserved
