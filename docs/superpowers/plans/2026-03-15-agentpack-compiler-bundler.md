# Agentpack Compiler/Bundler Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild agentpack as a hard-cut compiler/bundler for source-backed skills with one canonical compiled artifact, adapter-driven runtime materialization, a compiler-backed `dev` workflow, and no plugin surface or legacy authoring compatibility.

**Architecture:** Build a compiler core under `packages/agentpack/src/domain/compiler`, make `.agentpack/compiled.json` the only semantic truth, derive runtime outputs from compiled state through adapters, preserve registry/auth for package installation, and reject legacy `requires` / `metadata.sources` authoring immediately.

**Hard-Cut Rules:**
- No migration layer
- No backward compatibility for legacy skill syntax
- No dual-write to `build-state.json`
- No filesystem discovery as semantic truth
- No plugin support in the new model

**Tech Stack:** Node.js ESM, Commander, unified/remark-parse/unist AST tooling, React 19, D3, node:test, TLA+

---

**Spec:** `docs/superpowers/specs/2026-03-15-agentpack-compiler-bundler-design.md`
**Harness Plan Dependency:** `docs/superpowers/plans/2026-03-15-agentpack-harness.md`

## File Structure

- Modify: `tla/InstallFlow.tla`
- Modify: `tla/InstallFlow.cfg`
- Modify: `tla/MC_InstallFlow.cfg`
- Modify: `tla/DevSession.tla`
- Modify: `tla/DevSession.cfg`
- Modify: `tla/MC_DevSession.cfg`
- Modify: `tla/SkillStatus.tla`
- Modify: `tla/SkillStatus.cfg`
- Modify: `tla/MC_SkillStatus.tla`
- Modify: `tla/MC_SkillStatus.cfg`
- Create: `packages/agentpack/src/domain/compiler/skill-document-parser.js`
- Create: `packages/agentpack/src/domain/compiler/agentpack-block-parser.js`
- Create: `packages/agentpack/src/domain/compiler/body-reference-parser.js`
- Create: `packages/agentpack/src/domain/compiler/compile-diagnostics.js`
- Create: `packages/agentpack/src/domain/compiler/skill-compiler.js`
- Create: `packages/agentpack/src/domain/compiler/compiled-graph.js`
- Create: `packages/agentpack/src/infrastructure/fs/compiled-state-repository.js`
- Create: `packages/agentpack/src/infrastructure/fs/materialization-state-repository.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/adapter-registry.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js`
- Create: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Create: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Create: `packages/agentpack/src/application/skills/inspect-compiled-skill.js`
- Create: `test/domain/skill-document-parser.test.js`
- Create: `test/domain/skill-compiler.test.js`
- Create: `test/infrastructure/compiled-state-repository.test.js`
- Create: `test/infrastructure/materialization-state-repository.test.js`
- Create: `test/integration/skills-build.test.js`
- Create: `test/integration/skills-materialize.test.js`
- Modify: `packages/agentpack/package.json`
- Modify: `packages/agentpack/src/cli.js`
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Modify: `packages/agentpack/src/domain/skills/skill-provenance.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/inspect-materialized-skills.js`
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `packages/agentpack/src/dashboard/components/InspectorPanel.jsx`
- Modify: `packages/agentpack/src/dashboard/lib/api.js`
- Modify: `test/integration/fixtures.js`
- Modify: `test/domain/skill-provenance.test.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Modify: `test/integration/skills-install.test.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-stale.test.js`
- Modify: `test/integration/skills-status.test.js`
- Modify: `test/integration/skills-uninstall.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/release-contract.test.js`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`
- Modify: `docs/cli-skills.mdx`
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/skill-graph.mdx`
- Modify: `docs/staleness.mdx`
- Delete: `packages/agentpack/src/infrastructure/fs/build-state-repository.js`
- Delete: `packages/agentpack/src/commands/plugin.js`
- Delete: `packages/agentpack/src/application/plugins/build-plugin.js`
- Delete: `packages/agentpack/src/application/plugins/inspect-plugin-bundle.js`
- Delete: `packages/agentpack/src/application/plugins/validate-plugin-bundle.js`
- Delete: `packages/agentpack/src/domain/plugins/load-plugin-definition.js`
- Delete: `packages/agentpack/src/domain/plugins/plugin-diagnostic-error.js`
- Delete: `packages/agentpack/src/domain/plugins/plugin-requirements.js`
- Delete: `test/integration/plugin-build.test.js`
- Delete: `test/integration/plugin-bundle.test.js`
- Delete: `test/integration/plugin-dev.test.js`
- Delete: `docs/building-plugins.mdx`

## Chunk 0: Formal Models And Hard-Cut Harness

### Task 0: Lock the new state machine in TLA+

**Files:**
- Modify: `tla/InstallFlow.tla`
- Modify: `tla/InstallFlow.cfg`
- Modify: `tla/MC_InstallFlow.cfg`
- Modify: `tla/DevSession.tla`
- Modify: `tla/DevSession.cfg`
- Modify: `tla/MC_DevSession.cfg`
- Modify: `tla/SkillStatus.tla`
- Modify: `tla/SkillStatus.cfg`
- Modify: `tla/MC_SkillStatus.tla`
- Modify: `tla/MC_SkillStatus.cfg`

- [x] **Step 1: Update the install model to `fetch -> compile -> materialize`**

The model now treats:
- compiled state as canonical semantic truth
- materialization state as derived from compiled state
- adapter outputs as the runtime truth

- [x] **Step 2: Update the dev-session model to own compiled slice + adapter outputs**

The model now treats `dev` as:
- compile local graph slice
- materialize session-owned outputs
- reconcile and cleanup those outputs after crash/restart

- [x] **Step 3: Update the status model to use bound source files + compiled skill dependencies**

The model now treats:
- source-file changes as the direct cause of `stale`
- compiled imported skills as the path for `affected`

- [x] **Step 4: Run TLC**

Commands run:

```bash
cd tla && java -XX:+UseParallelGC -cp /tmp/agentpack-tla/tla2tools.jar tlc2.TLC -workers auto MC_InstallFlow.tla -config MC_InstallFlow.cfg
cd tla && java -XX:+UseParallelGC -cp /tmp/agentpack-tla/tla2tools.jar tlc2.TLC -metadir /tmp/agentpack-tla/devsession-states-2 -workers auto MC_DevSession.tla -config MC_DevSession.cfg
cd tla && java -XX:+UseParallelGC -cp /tmp/agentpack-tla/tla2tools.jar tlc2.TLC -metadir /tmp/agentpack-tla/skillstatus-states -workers auto MC_SkillStatus.tla -config MC_SkillStatus.cfg
```

Expected: PASS

### Task 1: Replace the test harness and orchestration seam before compiler work

**Files:**
- Modify: `test/integration/fixtures.js`
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `test/integration/skills-validate.test.js`

- [ ] **Step 1: Add failing regression tests that reject the legacy authoring contract**

Cover:
- `requires` without an `agentpack` block is invalid
- `metadata.sources` without explicit `source` bindings is invalid
- commands do not write or read `.agentpack/build-state.json`

Run:

```bash
node --test test/integration/skills-validate.test.js test/integration/skills-inspect.test.js test/integration/skills-stale.test.js
```

Expected: FAIL under the legacy implementation.

- [ ] **Step 2: Replace fixture helpers with compiler-first fixtures**

Add helpers for:
- `agentpack` declarations blocks
- explicit primary skill exports in package metadata
- source bindings
- body references with required `context`

Do not preserve legacy fixture creation as a supported path in new tests.

- [ ] **Step 3: Carve command-to-use-case seams out of `lib/skills.js`**

Before compiler implementation, make `commands/skills.js` depend on focused application entrypoints rather than growing `lib/skills.js` further.

- [ ] **Step 4: Run focused harness tests**

Run:

```bash
node --test test/domain/skill-provenance.test.js test/integration/skills-validate.test.js
```

Expected: PASS for the hard-cut harness shape and failing legacy assertions.

- [ ] **Step 5: Commit**

```bash
git add test/integration/fixtures.js packages/agentpack/src/commands/skills.js packages/agentpack/src/lib/skills.js test/integration/skills-validate.test.js test/domain/skill-provenance.test.js
git commit -m "test: hard-cut harness for compiler-driven skills"
```

## Chunk 1: Compiler Syntax And Parsing

### Task 2: Freeze the new skill language in parser tests

**Files:**
- Create: `test/domain/skill-document-parser.test.js`
- Modify: `test/integration/fixtures.js`
- Modify: `packages/agentpack/package.json`

- [ ] **Step 1: Add parser fixtures for valid declarations and body references**

Cover:

```md
```agentpack
import prd, { proto-persona as persona } from skill "@alavida/prd-development"
source principles = "domains/product/knowledge/prd-principles.md"
```

Use [the PRD method](skill:prd){context="for structuring and reviewing the PRD"}.
Ground this in [our PRD principles](source:principles){context="primary source material"}.
```

- [ ] **Step 2: Add failing tests for invalid syntax and compiler-facing errors**

Cover:
- missing `agentpack` block
- duplicate aliases
- missing `context`
- malformed `import` statement
- malformed `source` binding
- legacy frontmatter-only contract rejected

Run:

```bash
node --test test/domain/skill-document-parser.test.js
```

Expected: FAIL because the parser modules do not exist yet.

- [ ] **Step 3: Add markdown AST dependencies**

Add `unified`, `remark-parse`, and `unist-util-visit` to `packages/agentpack/package.json`.

- [ ] **Step 4: Implement the parser modules**

Create:
- `packages/agentpack/src/domain/compiler/skill-document-parser.js`
- `packages/agentpack/src/domain/compiler/agentpack-block-parser.js`
- `packages/agentpack/src/domain/compiler/body-reference-parser.js`

Implementation notes:
- use `unified().use(remarkParse)` to parse Markdown into an AST
- extract minimal frontmatter separately
- parse one top ` ```agentpack ` fenced block as the declaration zone
- parse body links plus trailing `{context="..."}` metadata through one explicit parser path
- do not infer semantics from arbitrary prose

- [ ] **Step 5: Run parser tests to green**

Run:

```bash
node --test test/domain/skill-document-parser.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/package.json packages/agentpack/src/domain/compiler/skill-document-parser.js packages/agentpack/src/domain/compiler/agentpack-block-parser.js packages/agentpack/src/domain/compiler/body-reference-parser.js test/domain/skill-document-parser.test.js test/integration/fixtures.js
git commit -m "feat: add skill language parser"
```

### Task 3: Add explicit primary-skill manifest support and compiler import resolution

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Create: `packages/agentpack/src/domain/compiler/compile-diagnostics.js`
- Create: `packages/agentpack/src/domain/compiler/skill-compiler.js`
- Create: `test/domain/skill-compiler.test.js`

- [ ] **Step 1: Add failing tests for primary/default and named skill imports**

Cover:
- `import prd from skill "@pkg"` requires explicit primary export
- `import { proto-persona as persona } from skill "@pkg"` resolves a named export
- package with multiple exports and no primary rejects default import
- undeclared body alias use is a compiler error

Run:

```bash
node --test test/domain/skill-compiler.test.js
```

Expected: FAIL because the compiler resolver does not exist yet.

- [ ] **Step 2: Extend package metadata parsing to expose the explicit primary skill**

Support a manifest shape like:

```json
{
  "agentpack": {
    "primarySkill": "prd-development",
    "skills": {
      "prd-development": { "path": "skills/prd-development/SKILL.md" },
      "proto-persona": { "path": "skills/proto-persona/SKILL.md" }
    }
  }
}
```

- [ ] **Step 3: Implement compiler-facing skill import resolution**

Use existing catalog/resolution logic as the package/export authority, but make the compiler own:
- alias resolution
- primary vs named import validation
- explicit usage validation
- compile diagnostics

- [ ] **Step 4: Run compiler tests only**

Run:

```bash
node --test test/domain/skill-compiler.test.js test/domain/skill-document-parser.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/domain/skills/skill-model.js packages/agentpack/src/domain/skills/skill-catalog.js packages/agentpack/src/domain/skills/skill-target-resolution.js packages/agentpack/src/domain/compiler/compile-diagnostics.js packages/agentpack/src/domain/compiler/skill-compiler.js test/domain/skill-compiler.test.js
git commit -m "feat: add compiler import resolution"
```

## Chunk 2: Canonical Compiled State And Hard Switch

### Task 4: Emit the canonical compiled artifact and delete legacy semantic state

**Files:**
- Create: `packages/agentpack/src/domain/compiler/compiled-graph.js`
- Create: `packages/agentpack/src/infrastructure/fs/compiled-state-repository.js`
- Create: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/domain/skills/skill-provenance.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/domain/skill-provenance.test.js`
- Delete: `packages/agentpack/src/infrastructure/fs/build-state-repository.js`

- [ ] **Step 1: Add failing tests for compiled artifact shape and hard-cut semantics**

Cover:
- parsed imports and source bindings
- exact usage occurrences with `context`
- summarized skill/source edges derived from occurrences
- persisted `.agentpack/compiled.json`
- `.agentpack/build-state.json` no longer exists or is written

Run:

```bash
node --test test/infrastructure/compiled-state-repository.test.js test/domain/skill-compiler.test.js test/integration/skills-validate.test.js
```

Expected: FAIL because compiled state and hard-cut persistence do not exist yet.

- [ ] **Step 2: Implement the canonical compiled graph builder**

The compiled artifact should include:

```json
{
  "version": 1,
  "skills": {},
  "sources": {},
  "occurrences": [],
  "edges": [],
  "diagnostics": []
}
```

- [ ] **Step 3: Implement the compiled-state repository**

`.agentpack/compiled.json` becomes the only semantic state file used by commands.

- [ ] **Step 4: Remove legacy build-state persistence immediately**

Delete `build-state-repository.js` and stop writing semantic truth anywhere except `compiled.json`.

- [ ] **Step 5: Update provenance helpers to read compiled source bindings**

Stop treating `metadata.sources` or filesystem scans as authored provenance truth.

- [ ] **Step 6: Run focused state tests**

Run:

```bash
node --test test/domain/skill-compiler.test.js test/infrastructure/compiled-state-repository.test.js test/domain/skill-provenance.test.js test/integration/skills-validate.test.js
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agentpack/src/domain/compiler/compiled-graph.js packages/agentpack/src/infrastructure/fs/compiled-state-repository.js packages/agentpack/src/application/skills/build-compiled-state.js packages/agentpack/src/domain/skills/skill-provenance.js test/infrastructure/compiled-state-repository.test.js test/domain/skill-compiler.test.js test/domain/skill-provenance.test.js test/integration/skills-validate.test.js
git rm packages/agentpack/src/infrastructure/fs/build-state-repository.js
git commit -m "feat: make compiled state canonical"
```

### Task 5: Rebuild inspect, stale, and status on compiled state

**Files:**
- Modify: `packages/agentpack/src/application/skills/list-stale-skills.js`
- Create: `packages/agentpack/src/application/skills/inspect-compiled-skill.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `test/integration/skills-stale.test.js`
- Modify: `test/integration/skills-inspect.test.js`
- Modify: `test/integration/skills-status.test.js`

- [ ] **Step 1: Add failing integration coverage for compiled-state-backed inspect and stale**

Cover:
- explicit source bindings become provenance nodes
- stale output cites bound source aliases, paths, and usage contexts
- inspect reports compiled imports and source bindings, not `requires`
- status reports graph health from compiled state

Run:

```bash
node --test test/integration/skills-stale.test.js test/integration/skills-inspect.test.js test/integration/skills-status.test.js
```

Expected: FAIL under the legacy implementation.

- [ ] **Step 2: Implement compiled-state-backed inspect and stale flows**

Stop reading semantic truth from direct `SKILL.md` frontmatter parsing in these commands.

- [ ] **Step 3: Update `skills status` to report compiled graph health**

Preserve registry/auth status, but source dependency, stale, missing, and graph-health output should come from compiled state.

- [ ] **Step 4: Run integration tests to green**

Run:

```bash
node --test test/integration/skills-stale.test.js test/integration/skills-inspect.test.js test/integration/skills-status.test.js test/integration/skills-json.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/application/skills/list-stale-skills.js packages/agentpack/src/application/skills/inspect-compiled-skill.js packages/agentpack/src/lib/skills.js test/integration/skills-stale.test.js test/integration/skills-inspect.test.js test/integration/skills-status.test.js
git commit -m "refactor: read inspect and stale data from compiled state"
```

## Chunk 3: Install And Materialization Pipeline

### Task 6: Add runtime adapter infrastructure and materialization state

**Files:**
- Create: `packages/agentpack/src/infrastructure/fs/materialization-state-repository.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/adapter-registry.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js`
- Create: `packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js`
- Create: `packages/agentpack/src/application/skills/materialize-compiled-state.js`
- Create: `test/infrastructure/materialization-state-repository.test.js`
- Create: `test/integration/skills-materialize.test.js`

- [ ] **Step 1: Add failing tests for adapter emission and cleanup**

Cover:
- compiled skill emission into `.claude/skills`
- compiled skill emission into `.agents/skills`
- materialization-state tracking
- cleanup/rematerialize semantics

Run:

```bash
node --test test/infrastructure/materialization-state-repository.test.js test/integration/skills-materialize.test.js
```

Expected: FAIL because adapters and materialization state do not exist yet.

- [ ] **Step 2: Implement adapter registry and built-in adapters**

Per the TLA model, adapters must:
- read compiled state
- emit runtime-specific outputs
- never re-resolve semantics from the filesystem

- [ ] **Step 3: Implement materialization-state persistence**

Persist emitted targets per adapter so uninstall and dev cleanup can remove only managed outputs.

- [ ] **Step 4: Wire `materialize-compiled-state` through the new adapter layer**

Keep the existing symlink behavior for `claude` and `agents` as the emitted runtime shape.

- [ ] **Step 5: Run materialization tests to green**

Run:

```bash
node --test test/infrastructure/materialization-state-repository.test.js test/integration/skills-materialize.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/infrastructure/fs/materialization-state-repository.js packages/agentpack/src/infrastructure/runtime/adapters/adapter-registry.js packages/agentpack/src/infrastructure/runtime/adapters/claude-adapter.js packages/agentpack/src/infrastructure/runtime/adapters/agents-adapter.js packages/agentpack/src/application/skills/materialize-compiled-state.js test/infrastructure/materialization-state-repository.test.js test/integration/skills-materialize.test.js
git commit -m "feat: add runtime materialization adapters"
```

### Task 7: Rebuild `install`, `build`, `materialize`, and `uninstall` around compiled state

**Files:**
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/infrastructure/fs/install-state-repository.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/inspect-materialized-skills.js`
- Create: `test/integration/skills-build.test.js`
- Modify: `test/integration/skills-install.test.js`
- Modify: `test/integration/skills-uninstall.test.js`
- Modify: `test/integration/skills-env.test.js`

- [ ] **Step 1: Add failing CLI tests for the new command surface**

Cover:
- `agentpack skills build`
- `agentpack skills materialize`
- `agentpack skills install` materializes by default
- `agentpack skills install --no-materialize`
- uninstall removes emitted adapter outputs from materialization state

Run:

```bash
node --test test/integration/skills-build.test.js test/integration/skills-materialize.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js test/integration/skills-env.test.js
```

Expected: FAIL under the legacy command implementation.

- [ ] **Step 2: Add `build` and `materialize` command handlers**

Expose compile-only and emit-only paths from the CLI while keeping `install` as the full default pipeline.

- [ ] **Step 3: Rewrite install and uninstall to use `fetch -> compile -> materialize`**

Keep existing registry/auth resolution from `lib/skills.js`, but make compiled state the source of truth after resolution.

- [ ] **Step 4: Update env/runtime inspection to read materialization state**

Treat ambient filesystem scans only as drift diagnostics, never as the source of ownership truth.

- [ ] **Step 5: Run integration tests to green**

Run:

```bash
node --test test/integration/skills-build.test.js test/integration/skills-materialize.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js test/integration/skills-env.test.js test/integration/skills-runtime-drift.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/commands/skills.js packages/agentpack/src/lib/skills.js packages/agentpack/src/infrastructure/fs/install-state-repository.js packages/agentpack/src/infrastructure/runtime/materialize-skills.js packages/agentpack/src/infrastructure/runtime/inspect-materialized-skills.js test/integration/skills-build.test.js test/integration/skills-install.test.js test/integration/skills-uninstall.test.js test/integration/skills-env.test.js
git commit -m "refactor: drive install and materialize from compiled state"
```

## Chunk 4: Dev Workflow And Graph Workbench

### Task 8: Rebuild `dev` on the compiler core and adapter ownership model

**Files:**
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Modify: `test/application/build-skill-workbench-model.test.js`

- [ ] **Step 1: Add failing tests for compiled-state-backed dev behavior**

Cover:
- selected authored skill compiles as the dev root
- dependency closure is materialized or symlinked into `.claude` and `.agents`
- source changes rebuild compiled state and refresh outputs
- dashboard reads usage contexts and source edges from compiled graph
- dev session records owned outputs, not guessed links

Run:

```bash
node --test test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js test/application/build-skill-workbench-model.test.js
```

Expected: FAIL under the legacy workflow.

- [ ] **Step 2: Rewrite `dev` to compile a local graph slice**

The dev root should be an authored local skill, but the graph slice must come from the compiler pipeline, not bespoke direct parsing.

- [ ] **Step 3: Rematerialize the dev dependency closure on rebuild**

Keep dev-session tracking and cleanup semantics, but record adapter outputs and compiled-session ownership together.

- [ ] **Step 4: Update the workbench model and dashboard to show compiled usage contexts**

Expose:
- skill imports
- source bindings
- explicit usage context labels on edges
- stale and affected states from compiled provenance

- [ ] **Step 5: Rebuild the dashboard bundle and run tests**

Run:

```bash
npm run build:dashboard
node --test test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js test/application/build-skill-workbench-model.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/application/skills/start-skill-dev-workbench.js packages/agentpack/src/application/skills/build-skill-workbench-model.js packages/agentpack/src/lib/skills.js packages/agentpack/src/dashboard/components/SkillGraph.jsx packages/agentpack/src/dashboard/components/InspectorPanel.jsx packages/agentpack/src/dashboard/lib/api.js packages/agentpack/src/dashboard/dist/dashboard.js test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js test/application/build-skill-workbench-model.test.js
git commit -m "feat: rebuild dev workflow on compiler core"
```

## Chunk 5: Remove Plugins And Finish The Hard Cut

### Task 9: Remove plugin commands, plugin docs, and plugin tests

**Files:**
- Modify: `packages/agentpack/src/cli.js`
- Delete: `packages/agentpack/src/commands/plugin.js`
- Delete: `packages/agentpack/src/application/plugins/build-plugin.js`
- Delete: `packages/agentpack/src/application/plugins/inspect-plugin-bundle.js`
- Delete: `packages/agentpack/src/application/plugins/validate-plugin-bundle.js`
- Delete: `packages/agentpack/src/domain/plugins/load-plugin-definition.js`
- Delete: `packages/agentpack/src/domain/plugins/plugin-diagnostic-error.js`
- Delete: `packages/agentpack/src/domain/plugins/plugin-requirements.js`
- Delete: `test/integration/plugin-build.test.js`
- Delete: `test/integration/plugin-bundle.test.js`
- Delete: `test/integration/plugin-dev.test.js`
- Delete: `docs/building-plugins.mdx`
- Modify: `test/integration/release-contract.test.js`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`

- [ ] **Step 1: Add or update release-surface tests to assert plugins are gone**

Cover:
- CLI help no longer shows `plugin`
- docs no longer market plugin support
- release contract refers to compiler/build/materialize workflows instead

Run:

```bash
node --test test/integration/release-contract.test.js
```

Expected: FAIL until the plugin surface is removed.

- [ ] **Step 2: Remove plugin command registration and delete plugin implementation files**

Delete the plugin command and its supporting application/domain modules from the package.

- [ ] **Step 3: Delete plugin integration tests and update docs**

Replace plugin positioning with the compiler/bundler/runtime-materializer product definition from the approved spec.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test test/integration/release-contract.test.js test/integration/intent-bin.test.js test/integration/auth-commands.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/cli.js test/integration/release-contract.test.js README.md packages/agentpack/README.md
git rm packages/agentpack/src/commands/plugin.js packages/agentpack/src/application/plugins/build-plugin.js packages/agentpack/src/application/plugins/inspect-plugin-bundle.js packages/agentpack/src/application/plugins/validate-plugin-bundle.js packages/agentpack/src/domain/plugins/load-plugin-definition.js packages/agentpack/src/domain/plugins/plugin-diagnostic-error.js packages/agentpack/src/domain/plugins/plugin-requirements.js test/integration/plugin-build.test.js test/integration/plugin-bundle.test.js test/integration/plugin-dev.test.js docs/building-plugins.mdx
git commit -m "refactor: remove plugin support from agentpack"
```

### Task 10: Remove leftover legacy discovery assumptions and finish docs

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`
- Modify: `docs/cli-skills.mdx`
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/skill-graph.mdx`
- Modify: `docs/staleness.mdx`

- [ ] **Step 1: Add final regression tests that reject the old contract**

Cover:
- `requires` / `metadata.sources` do not define the compiler language
- commands expect the `agentpack` declaration block and explicit body references
- no command rebuilds semantic truth by repo scan

Run:

```bash
node --test test/integration/skills-build.test.js test/integration/skills-inspect.test.js test/integration/skills-stale.test.js
```

Expected: FAIL until leftover legacy paths are removed.

- [ ] **Step 2: Remove leftover filesystem-discovery-as-truth code paths**

Delete or replace:
- direct repo scans as semantic truth
- command-specific discovery branches that bypass compiled state
- lingering legacy frontmatter semantic assumptions

- [ ] **Step 3: Update end-user docs to the new language and command model**

Document:
- `agentpack` declarations block
- `source alias = "path"`
- explicit body references with `context`
- `install` / `build` / `materialize` / `dev`
- runtime adapters and compiled-state truth

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with plugin tests removed and the compiler/bundler behavior covered end-to-end.

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/domain/skills/skill-model.js packages/agentpack/src/lib/skills.js README.md packages/agentpack/README.md docs/cli-skills.mdx docs/how-it-works.mdx docs/skill-graph.mdx docs/staleness.mdx test/integration/skills-build.test.js test/integration/skills-inspect.test.js test/integration/skills-stale.test.js
git commit -m "docs: finalize compiler-driven skill model"
```

## Recommended Execution Notes

- Execute the harness plan first, at least through the repo-lab, registry, and Playwright layers needed to support compiler work.
- Start with Chunk 0. The TLA models are already updated and green; use them as the contract for implementation order.
- Do not preserve or emulate the old authoring contract. Reject it explicitly in tests and code.
- Do not dual-write semantic state. As soon as `compiled.json` lands, it becomes the only semantic truth.
- Prefer keeping auth and registry code intact while swapping the semantic pipeline underneath it.
- Treat `skills dev` as an author workflow, not a separate discovery implementation. It should compile, materialize, and visualize from the same canonical state as `install`.
- Use runtime filesystem scans only for drift detection, never for semantic ownership.

Plan complete and saved to `docs/superpowers/plans/2026-03-15-agentpack-compiler-bundler.md`. Ready to execute.
