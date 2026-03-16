# Latest GitHub Issues Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the current open GitHub issue backlog in an order that removes the shared multi-skill packaging regressions first, then improves the workbench UX, and only then takes on the broader wrapping/brand-overlay feature.

**Architecture:** Treat issue `#26` as the umbrella for command target resolution and fold `#24` and `#37` into the same implementation stream. Reuse the existing package catalog and target-resolution domain code instead of maintaining separate repo scans in `lib/skills.js` and `start-skill-dev-workbench.js`. Keep the larger wrapping feature (`#29`) behind an explicit design/spec step because it adds new authoring concepts and CLI surface area.

**Tech Stack:** Node.js, ESM modules, Commander CLI, React 19, D3, node:test

---

## File Structure

- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/application/skills/build-skill-workbench-model.js`
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `test/integration/fixtures.js`
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/skills-stale.test.js`
- Add: `test/integration/skills-wrap.test.js` if `#29` moves beyond spec work
- Add: `docs/superpowers/specs/2026-03-15-skill-wrap-brand-overlay-design.md` before implementing `#29`

## Chunk 1: Unify Skill Target Resolution (`#26`, `#24`, `#37`)

### Task 1: Lock the current failures into integration tests

**Files:**
- Modify: `test/integration/skills-dev.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Modify: `test/integration/skills-validate.test.js`
- Modify: `test/integration/fixtures.js`

- [ ] **Step 1: Add a fixture that matches the reported multi-skill package layout**

Create or extend a fixture with:

```js
addMultiSkillPackage(repo.root, 'workbenches/visual-explainer', {
  packageJson: {
    name: '@alavida/visual-explainer',
    agentpack: {
      skills: {
        'generate-web-diagram': { path: 'skills/generate-web-diagram/SKILL.md' },
      },
    },
  },
  skills: [{ path: 'skills/generate-web-diagram', skillMd: '---\nname: generate-web-diagram\n---\n' }],
});
```

- [ ] **Step 2: Add failing `skills dev` coverage for skill dir, `SKILL.md`, and package dir targets**

Run:

```bash
node --test test/integration/skills-dev.test.js
```

Expected: failures showing the current ambiguity and `/api/model` lookup gap for multi-skill packages.

- [ ] **Step 3: Add failing workbench contract coverage for `/api/model`**

Run:

```bash
node --test test/integration/skills-dev-workbench.test.js
```

Expected: failure when the selected multi-skill export resolves to `"Skill not found"`.

- [ ] **Step 4: Keep `skills validate` package-directory coverage green while adding export-path regression cases**

Run:

```bash
node --test test/integration/skills-validate.test.js
```

Expected: new target-resolution cases fail before implementation; existing authored multi-skill package cases stay green.

- [ ] **Step 5: Commit**

```bash
git add test/integration/fixtures.js test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js test/integration/skills-validate.test.js
git commit -m "test: capture multi-skill target resolution regressions"
```

### Task 2: Remove duplicated package scanning and route `skills dev` through shared resolution

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/lib/skills.js`

- [ ] **Step 1: Extend the resolver with enough context for workbench startup**

Return the canonical export entry and package metadata needed by `skills dev`:

```js
return {
  kind: 'export',
  package: pkg,
  export: skillExport,
  exports: [skillExport],
  defaultSkill: skillExport.key ?? `${pkg.packageName}:${skillExport.name}`,
};
```

- [ ] **Step 2: Replace `start-skill-dev-workbench`'s private repo scan**

Use the shared package catalog instead of:

```js
function listPackagedSkillDirs(repoRoot) { /* recursive SKILL.md + package.json scan */ }
```

with:

```js
const context = loadSkillTargetContext(repoRoot, { includeAuthored: true, includeInstalled: false });
const packageDirs = context.authoredPackages.map((pkg) => pkg.packageDir);
```

- [ ] **Step 3: Resolve the selected skill from the target before computing `defaultSkill`**

Replace:

```js
const packageMetadata = readPackageMetadata(skillDir);
const defaultSkill = packageMetadata.packageName;
```

with a single-export resolution derived from the shared resolver so skill directories inside multi-skill packages map to the correct export key.

- [ ] **Step 4: Reuse the same resolution in the workbench action path**

Ensure the `target` and `packageName` passed to `runSkillWorkbenchAction` describe the resolved export, not just the original directory path.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test test/integration/skills-dev.test.js
node --test test/integration/skills-dev-workbench.test.js
node --test test/integration/skills-inspect.test.js
```

Expected: multi-skill export targets work in `dev` and existing `inspect` flows remain green.

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/domain/skills/skill-target-resolution.js packages/agentpack/src/application/skills/start-skill-dev-workbench.js packages/agentpack/src/lib/skills.js test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js
git commit -m "fix: unify skills dev target resolution"
```

### Task 3: Sweep remaining duplicated packaged-skill scans

**Files:**
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `test/integration/skills-validate.test.js`

- [ ] **Step 1: Replace `listPackagedSkillDirs` callers in `lib/skills.js` with catalog-backed authored exports**

Use `listAuthoredSkillPackages(repoRoot)` or a new helper returning authored exports instead of reimplementing directory discovery.

- [ ] **Step 2: Confirm no command still depends on co-located `SKILL.md` plus `package.json`**

Run:

```bash
rg -n "listPackagedSkillDirs|package.json not found" packages/agentpack/src
```

Expected: only genuinely package-local code paths remain.

- [ ] **Step 3: Run the target-resolution regression suite**

Run:

```bash
node --test test/integration/skills-dev.test.js test/integration/skills-validate.test.js test/integration/skills-inspect.test.js
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/agentpack/src/lib/skills.js packages/agentpack/src/domain/skills/skill-catalog.js test/integration/skills-validate.test.js
git commit -m "refactor: remove legacy packaged skill discovery"
```

## Chunk 3: Improve Skill Graph Workbench Usability (`#10`)

### Task 6: Capture the large-graph UX issues in component-level tests

**Files:**
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `test/application/build-skill-workbench-model.test.js`
- Modify: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Add a regression test for large sibling sets in the workbench model or rendered graph**

Focus on the unreadable 10+ sibling case rather than pixel-perfect snapshots.

- [ ] **Step 2: Add a failing interaction test for drag or viewport transforms if the dashboard test harness supports it**

If no harness exists yet, add a narrow unit around the transform state helper before wiring UI events.

- [ ] **Step 3: Run the workbench tests**

Run:

```bash
node --test test/application/build-skill-workbench-model.test.js test/integration/skills-dev-workbench.test.js
```

Expected: new UX assertions fail before implementation.

- [ ] **Step 4: Commit**

```bash
git add packages/agentpack/src/dashboard/components/SkillGraph.jsx test/application/build-skill-workbench-model.test.js test/integration/skills-dev-workbench.test.js
git commit -m "test: capture skill graph readability regressions"
```

### Task 7: Implement spacing, drag, and viewport controls in the dashboard

**Files:**
- Modify: `packages/agentpack/src/dashboard/components/SkillGraph.jsx`
- Modify: `packages/agentpack/src/dashboard/App.jsx`
- Modify: `packages/agentpack/src/dashboard/components/ControlStrip.jsx`

- [ ] **Step 1: Increase default spacing for wide dependency layers**

Adjust layout constants as a function of sibling count before adding manual interactions.

- [ ] **Step 2: Add drag state for node repositioning**

Store per-node overrides in component state keyed by skill id so the layout stays deterministic until the user moves a node.

- [ ] **Step 3: Add zoom and pan controls**

Expose viewBox or transform state through the existing control strip rather than burying it inside D3 event handlers.

- [ ] **Step 4: Add a simple label-collision mitigation**

Start with vertical offsets or shortened labels before trying a more expensive collision solver.

- [ ] **Step 5: Rebuild the dashboard bundle and run targeted tests**

Run:

```bash
npm run build:dashboard
node --test test/integration/skills-dev-workbench.test.js
```

Expected: green, and the dashboard asset updates cleanly.

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/dashboard/components/SkillGraph.jsx packages/agentpack/src/dashboard/App.jsx packages/agentpack/src/dashboard/components/ControlStrip.jsx packages/agentpack/src/dashboard/dist/dashboard.js test/integration/skills-dev-workbench.test.js
git commit -m "feat: improve skill graph workbench ergonomics"
```

## Chunk 4: Design Then Implement Skill Wrapping / Brand Overlay (`#29`)

### Task 8: Write and review the wrapping spec before coding

**Files:**
- Add: `docs/superpowers/specs/2026-03-15-skill-wrap-brand-overlay-design.md`

- [ ] **Step 1: Use the brainstorming workflow to narrow the first slice**

Decide whether v1 is:
`wraps` metadata only, single-skill scaffolding only, or full bulk wrap generation.

- [ ] **Step 2: Write the spec before implementation**

Capture CLI shape, file generation rules, metadata semantics, stale-tracking behavior, and inspect/dev UX.

- [ ] **Step 3: Review and approve the spec**

Do not start CLI implementation until the spec is accepted.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-03-15-skill-wrap-brand-overlay-design.md
git commit -m "docs: specify skill wrapping workflow"
```

### Task 9: Implement the smallest useful wrapping slice

**Files:**
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/application/skills/inspect-skill.js`
- Add: `test/integration/skills-wrap.test.js`

- [ ] **Step 1: Write the failing wrapping tests for the approved v1**

Keep the first release narrow. A single-skill scaffold plus explicit `wraps` metadata is likely enough.

- [ ] **Step 2: Implement metadata parsing and inspect output**

Make `wraps` and `overrides` first-class in the model before generating files from the CLI.

- [ ] **Step 3: Implement the CLI scaffold path**

Generate a wrapper `SKILL.md` with correct upstream source references and override references.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test test/integration/skills-wrap.test.js test/integration/skills-inspect.test.js
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/commands/skills.js packages/agentpack/src/lib/skills.js packages/agentpack/src/domain/skills/skill-model.js packages/agentpack/src/application/skills/inspect-skill.js test/integration/skills-wrap.test.js
git commit -m "feat: add initial skill wrapping support"
```

## Recommended Order

1. Complete Chunk 1 first. It closes the highest-confidence bugs and should resolve `#24` and `#37` under the umbrella of `#26`.
2. Do Chunk 2 next. It broadens authored-skill support and improves stale tracking without introducing new CLI surface area.
3. Do Chunk 3 after the command semantics are stable. The dashboard improvements are valuable but not blocking the core authoring flow.
4. Start Chunk 4 only after the earlier bugs are merged. `#29` is a feature line, not a patch line, and needs a spec before implementation.

## Issue Mapping

- `#37` depends on the same resolver and workbench changes as `#26`; close it with the same branch if the tests prove coverage.
- `#24` is effectively the user-facing symptom statement for the same `skills dev` multi-skill bug.
- `#5` is independent from the multi-skill fix, but it touches build-state semantics and should not be mixed into the same branch.
- `#10` is dashboard-only and can move in parallel with `#5` if separate agents are available.
- `#29` should stay separate from bugfix work because it changes product shape and metadata semantics.

Plan complete and saved to `docs/superpowers/plans/2026-03-15-github-issues-backlog.md`. Ready to execute?
