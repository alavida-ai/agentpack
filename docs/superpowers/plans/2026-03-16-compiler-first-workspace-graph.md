# Compiler-First Workspace Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace command-specific skill discovery with one compiler-first workspace graph so authored `inspect`, `validate`, `dev`, build, install, materialize, and skill-tree flows all resolve from the same compiled package/export model.

**Architecture:** Treat `package.json` as package-manager metadata plus one compiler config field, `agentpack.root` for named sub-skill discovery. Every compiler-first package has one root `SKILL.md` at the package root, which is the package's primary export, plus zero or more named exports discovered under `agentpack.root`. The compiler builds one workspace graph containing package nodes, primary exports, named exports, diagnostics, and a shared target/materialization index. All authored and install/materialization CLI commands read that graph; no command performs its own filesystem heuristics, export-table parsing, or legacy fallback.

**Tech Stack:** Node.js, ESM modules, existing `unified`/`remark` compiler pipeline, Node test runner, repo-lab integration harness in `test/integration/`

---

## File Structure

- Create: `packages/agentpack/src/domain/skills/workspace-graph.js`
  Compiler-first authored workspace loader. Discovers packages via `package.json` plus root `SKILL.md`, compiles the package primary export and every named export under `agentpack.root`, records diagnostics, and builds the shared target/materialization index.
- Create: `packages/agentpack/src/domain/skills/workspace-graph-types.js`
  Small focused helpers/constants for package/export status values, diagnostic/remediation shapes, and target key construction so graph shape stays stable across commands and tests.
- Create: `test/domain/workspace-graph.test.js`
  Unit coverage for package discovery, export discovery, canonical id indexing, and invalid-export preservation.
- Create: `test/domain/workspace-graph-diagnostics.test.js`
  Unit coverage for compiler/resolver diagnostics, attached `nextSteps`, and command-facing remediation payloads.
- Create: `test/integration/compiler-first-authored-workspace.test.js`
  Fixture-backed integration coverage for primary package exports, named exports, canonical ids, and invalid export diagnostics.
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
  Replace direct catalog scanning with graph-backed resolution only.
- Modify: `packages/agentpack/src/application/skills/validate-skills.js`
  Validate package targets and export targets from the workspace graph instead of forcing single-export resolution first.
- Modify: `packages/agentpack/src/application/skills/inspect-skill.js`
  Surface package/export diagnostics from the graph rather than returning `skill not found`.
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
  Resolve the requested export from the workspace graph and fail with typed export/package diagnostics when invalid.
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
  Build compiled state from the same workspace graph node selected by the shared resolver.
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
  Materialize primary exports as the package name and named exports as `package:skill-name` from the same graph metadata.
- Modify: `packages/agentpack/src/lib/skills.js`
  Remove remaining authored-source heuristics and route helper flows through the shared graph/resolver.
- Modify: `packages/agentpack/src/domain/compiler/skill-document-parser.js`
  Keep strict compiler-mode rules, but scope legacy-field detection to frontmatter only.
- Modify: `packages/agentpack/src/utils/errors.js`
  Reuse the existing `AgentpackError` / `nextSteps` transport shape as the CLI edge format for workspace-graph diagnostics.
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
  Strip out authored export discovery responsibilities that move into the workspace graph builder. Keep frontmatter parsing and package metadata helpers only.
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
  Delete or reduce to installed-package concerns only after authored resolution migrates to the workspace graph.
- Modify: `packages/agentpack/src/commands/skills.js`
  Render package/export diagnostics in human output for `inspect` and `validate`.
- Modify: `packages/agentpack/package.json`
  Update package examples/fixtures if release contract tests assert the compiler config shape.
- Modify: `test/integration/fixtures.js`
  Replace authored fixtures that currently write `agentpack.skills` export tables with `agentpack.root` package config and compiler-owned skill discovery.
- Modify: `test/integration/skills-inspect.test.js`
  Switch multi-skill fixtures to the new package config and add canonical id plus invalid-export diagnostics coverage.
- Modify: `test/integration/skills-validate.test.js`
  Add package-root validation coverage for compiler-first multi-skill packages and invalid export diagnostics.
- Modify: `test/integration/skills-dev.test.js`
  Add `skills dev <package-root>` ambiguity handling and invalid export failure coverage under the new graph.
- Modify: `test/integration/skills-install.test.js`
  Add compiler-first package install coverage with a root primary export plus named exports.
- Modify: `test/integration/skills-env.test.js`
  Verify environment and materialization output names follow primary/named export semantics from the graph.
- Modify: `test/integration/release-contract.test.js`
  Lock the package config contract so release artifacts and root/bin wrappers keep matching the compiler-first package layout.
- Modify: `docs/schema-package-json.mdx`
  Replace `agentpack.skills` with `agentpack.root` and remove legacy `metadata.sources` / `requires` ownership claims.
- Modify: `docs/schema-skill-md.mdx`
  Make `SKILL.md` the only authored semantic source and document repo-relative `source alias = "path"` syntax only.
- Modify: `packages/agentpack/skills/compiler-mode-authoring/SKILL.md`
- Modify: `packages/agentpack/skills/multi-skill-packages/SKILL.md`
- Modify: `packages/agentpack/skills/authoring-skillgraphs-from-knowledge/SKILL.md`
- Modify: `packages/agentpack/skills/getting-started-skillgraphs/SKILL.md`
- Modify: `packages/agentpack/skills/identifying-skill-opportunities/SKILL.md`
- Modify: `packages/agentpack/skills/publishing-skill-packages/SKILL.md`
  Rewrite bundled skill guidance so it teaches only the compiler-first contract.

## Unified Diagnostics Contract

Every authored package/export failure must travel through one structured model before it becomes CLI output. The workspace graph owns diagnostics as data; the CLI edge reuses `AgentpackError` and `nextSteps` for transport and rendering.

```js
type WorkspaceDiagnostic = {
  code: string,
  message: string,
  level: 'error' | 'warning',
  scope: 'workspace' | 'package' | 'export' | 'target',
  packageName?: string,
  exportId?: string,
  path?: string,
  location?: { line: number, column: number },
  suggestion?: string,
  nextSteps: Array<{
    action: 'edit_file' | 'run_command' | 'choose_target' | 'read_docs',
    reason: string,
    command?: string,
    path?: string,
    options?: string[],
    example?: unknown,
  }>,
};
```

Rules:

- Discovery and compilation do not erase authored packages on expected user errors.
- Invalid exports stay addressable in the graph and carry diagnostics plus `nextSteps`.
- Resolver errors such as unknown canonical ids or ambiguous package targets use the same shape.
- Commands add policy diagnostics only when needed, for example `dev` requiring one valid export.
- Human output and `--json` output must preserve the same structured remediation guidance.

## Harness Strategy

The implementation must iterate through the harness in layers and use real worktree verification as the final gate. Manual inspection is not a completion criterion by itself.

1. Domain harness
   - `test/domain/workspace-graph.test.js`
   - `test/domain/workspace-graph-diagnostics.test.js`
   - `test/domain/skill-document-parser.test.js`
   Fast contract tests for package discovery, export discovery, canonical ids, diagnostics, and frontmatter-only strictness.

2. Repo-lab integration harness
   - `test/integration/compiler-first-authored-workspace.test.js`
   - `test/integration/skills-inspect.test.js`
   - `test/integration/skills-validate.test.js`
   - `test/integration/skills-dev.test.js`
   - `test/integration/skills-build.test.js`
   - `test/integration/skills-compiled-state.test.js`
   These are the primary correctness gates for the authored CLI flow.

3. Existing contract and wrapper regression coverage
   - `test/integration/intent-bin.test.js`
   - `test/integration/release-contract.test.js`
   Keep the bundled wrapper and package contract stable while the authored graph architecture changes.

4. Formal model harness
   - Only if the implementation changes install, dev-session, or status-state semantics.
   - If those semantics change, run `npm run test:models` before claiming completion.

5. Real-repo verification gate
   - The branch is not complete until the CLI works against the real authored package in:
     `/Users/alexandergirardet/.superset/worktrees/Alavida/exploring-articles/workspace/active/architecture/agonda-monorepo/`
   - The minimum real commands are:
     - `agentpack skills inspect <package-root>`
     - `agentpack skills inspect <canonical-id>`
     - `agentpack skills validate <package-root>`
     - `agentpack skills dev <export-dir> --no-dashboard`
     - `agentpack skills install <package-name>` in a controlled consumer repo where the primary export materializes as the package name

Execution rule:

- Do not stop at “tests pass” if the real worktree still fails.
- Do not stop at “real repo mostly works” if the focused harness is red.
- Completion requires both harness evidence and real-repo CLI success.

## Chunk 1: Lock The Compiler-First Contract In Tests

### Task 1: Add failing domain coverage for package discovery from `agentpack.root`

**Files:**
- Create: `test/domain/workspace-graph.test.js`
- Create: `test/domain/workspace-graph-diagnostics.test.js`
- Reference: `packages/agentpack/src/domain/compiler/skill-compiler.js`
- Reference: `packages/agentpack/src/domain/compiler/skill-document-parser.js`
- Reference: `test/integration/fixtures.js`

- [ ] **Step 1: Write the failing package discovery test**

```js
it('discovers the root SKILL.md as the package primary export', () => {
  const repo = createScenario({
    name: 'workspace-graph-primary-export',
    packages: [{
      relPath: 'workbenches/brand',
      packageJson: {
        name: '@acme/brand',
        version: '0.1.0',
        agentpack: { root: 'skills' },
      },
      files: {
        'SKILL.md': validSkillDocument('brand'),
      },
    }],
  });

  const graph = buildAuthoredWorkspaceGraph(repo.root);
  assert.equal(graph.packages['@acme/brand'].primaryExport, '@acme/brand');
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test test/domain/workspace-graph.test.js`
Expected: FAIL because `buildAuthoredWorkspaceGraph` does not exist yet.

- [ ] **Step 3: Add the multi-skill discovery test**

```js
it('discovers named exports under agentpack.root alongside the primary export', () => {
  assert.deepEqual(
    graph.packages['@acme/brand'].exports.sort(),
    ['@acme/brand', '@acme/brand:editorial-principles', '@acme/brand:value-copywriting']
  );
});
```

- [ ] **Step 4: Add the invalid-export preservation test**

```js
it('keeps the package visible when one skill fails compilation', () => {
  const pkg = graph.packages['@acme/brand'];
  assert.equal(pkg.status, 'invalid');
  assert.equal(graph.exports['@acme/brand:value-copywriting'].status, 'valid');
  assert.equal(graph.exports['@acme/brand:broken-skill'].status, 'invalid');
});
```

- [ ] **Step 5: Add canonical target indexing assertions**

```js
assert.equal(graph.targets['@acme/brand'].kind, 'package');
assert.equal(graph.targets['@acme/brand:value-copywriting'].kind, 'export');
assert.equal(graph.targets['workbenches/brand/skills/value-copywriting'].kind, 'export');
assert.equal(graph.targets['workbenches/brand'].kind, 'package');
```

- [ ] **Step 6: Run the domain test file again**

Run: `node --test test/domain/workspace-graph.test.js`
Expected: FAIL with missing module or missing exports until the graph builder is implemented.

- [ ] **Step 7: Add the failing diagnostics contract test**

```js
it('attaches nextSteps to invalid exports', () => {
  const diagnostic = graph.exports['@acme/brand:broken-skill'].diagnostics[0];
  assert.equal(diagnostic.code, 'invalid_agentpack_declaration');
  assert.equal(diagnostic.nextSteps[0].action, 'edit_file');
  assert.match(diagnostic.nextSteps[0].reason, /replace unsupported source declaration/i);
});
```

- [ ] **Step 8: Run both domain test files**

Run: `node --test test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js`
Expected: FAIL until the graph builder and diagnostic model exist.

- [ ] **Step 9: Commit the test scaffold**

```bash
git add test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js
git commit -m "test: define compiler-first workspace graph and diagnostics contract"
```

### Task 2: Add failing integration coverage for authored CLI commands

**Files:**
- Create: `test/integration/compiler-first-authored-workspace.test.js`
- Modify: `test/integration/fixtures.js`
- Reference: `test/integration/skills-inspect.test.js`
- Reference: `test/integration/skills-validate.test.js`
- Reference: `test/integration/skills-dev.test.js`

- [ ] **Step 1: Add a fixture builder for `agentpack.root` packages**

```js
createCompilerFirstSkillPackage({
  relPath: 'workspace/active/architecture/agonda-monorepo',
  packageJson: {
    name: '@alavida/monorepo-architecture',
    version: '0.1.0',
    agentpack: { root: 'skills' },
    files: ['skills/'],
  },
});
```

- [ ] **Step 2: Write the failing package-root inspect test**

Run: `agentpack skills inspect workspace/active/architecture/agonda-monorepo`
Expected: root export result for the package primary skill, not a package-summary-only fallback.

- [ ] **Step 3: Write the failing package-root validate test**

Run: `agentpack skills validate workspace/active/architecture/agonda-monorepo`
Expected: validates all exports in the package and reports invalid exports explicitly.

- [ ] **Step 4: Write the failing canonical id inspect test**

Run: `agentpack skills inspect @alavida/monorepo-architecture:monorepo-overview`
Expected: resolves the exact export.

- [ ] **Step 5: Write the failing package-name inspect test for the primary export**

Run: `agentpack skills inspect @alavida/monorepo-architecture`
Expected: resolves the root primary export.

- [ ] **Step 6: Write the failing invalid-export diagnostic test**

Run: `agentpack skills inspect @alavida/monorepo-architecture:broken-skill`
Expected: typed invalid-export error with the compiler diagnostic and `nextSteps`, not `skill not found`.

- [ ] **Step 7: Write the failing `skills dev` invalid-export test**

Run: `agentpack skills dev workspace/active/architecture/agonda-monorepo/skills/broken-skill --no-dashboard`
Expected: exits with compiler diagnostic for the selected export.

- [ ] **Step 8: Run the focused integration file**

Run: `node --test test/integration/compiler-first-authored-workspace.test.js`
Expected: FAIL on all new expectations until the graph-backed command flow is in place.

- [ ] **Step 9: Commit**

```bash
git add test/integration/compiler-first-authored-workspace.test.js test/integration/fixtures.js
git commit -m "test: capture compiler-first authored CLI regressions"
```

## Chunk 2: Build The Compiler-First Workspace Graph

### Task 3: Implement package discovery from `package.json.agentpack.root`

**Files:**
- Create: `packages/agentpack/src/domain/skills/workspace-graph.js`
- Create: `packages/agentpack/src/domain/skills/workspace-graph-types.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Test: `test/domain/workspace-graph.test.js`
- Test: `test/domain/workspace-graph-diagnostics.test.js`

- [ ] **Step 1: Add the graph module skeleton**

```js
export function buildAuthoredWorkspaceGraph(repoRoot) {
  return {
    packages: {},
    exports: {},
    targets: {},
    diagnostics: [],
  };
}
```

- [ ] **Step 2: Add package scanning for `agentpack.root` only**
- [ ] **Step 2: Add package scanning for compiler-first packages**

```js
function readCompilerPackageConfig(packageDir) {
  const pkg = readPackageMetadata(packageDir);
  const root = pkg.raw?.agentpack?.root;
  return {
    namedRoot: typeof root === 'string' && root.length > 0 ? root : null,
    hasPrimary: existsSync(join(packageDir, 'SKILL.md')),
  };
}
```

- [ ] **Step 3: Discover the root primary export and named exports under the configured root**

```js
function listSkillFilesUnderRoot(packageDir, rootDir) {
  return walk(join(packageDir, rootDir)).filter((path) => path.endsWith('/SKILL.md'));
}
```

- [ ] **Step 4: Compile each discovered skill independently**

```js
for (const skillFile of skillFiles) {
  try {
    const compiled = readCompilerSkillExport(skillFile);
    addValidExport(...);
  } catch (error) {
    addInvalidExport(...toCompilerDiagnostic(error));
  }
}
```

- [ ] **Step 5: Normalize compiler diagnostics into graph diagnostics with `nextSteps`**

```js
function toWorkspaceDiagnostic(error, context) {
  return {
    code: error.code || 'compilation_failed',
    message: error.message,
    level: 'error',
    scope: 'export',
    packageName: context.packageName,
    exportId: context.exportId,
    path: context.skillFile,
    location: error.location || null,
    suggestion: buildSuggestion(error, context),
    nextSteps: buildDiagnosticNextSteps(error, context),
  };
}
```

- [ ] **Step 6: Register target keys for package path, skill path, skill file, package name, and canonical id**

```js
targets[packageName] = { kind: 'package', packageName };
targets[canonicalId] = { kind: 'export', exportId: canonicalId };
targets[displaySkillDir] = { kind: 'export', exportId: canonicalId };
```

Expected:
- package name target points at the primary export when present
- canonical ids point at named exports
- package path target resolves the package node and can promote to the primary export for commands that need one

- [ ] **Step 7: Mark packages invalid when any export is invalid**

```js
pkg.status = pkg.exports.some((id) => graph.exports[id].status === 'invalid') ? 'invalid' : 'valid';
```

- [ ] **Step 8: Run the domain tests**

Run: `node --test test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/agentpack/src/domain/skills/workspace-graph*.js packages/agentpack/src/domain/skills/skill-model.js packages/agentpack/src/domain/skills/skill-catalog.js test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js
git commit -m "feat: add compiler-first authored workspace graph"
```

### Task 4: Remove authored catalog heuristics

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-catalog.js`
- Modify: `packages/agentpack/src/domain/skills/skill-model.js`
- Test: `test/domain/workspace-graph.test.js`

- [ ] **Step 1: Delete authored export-table discovery from `readInstalledSkillExports()`**

```js
// keep this function installed-only or replace it with installed graph helpers
```

- [ ] **Step 2: Remove blanket `catch { return null }` authored package dropping**

```js
// authored graph builder owns diagnostics; catalog should not erase packages
```

- [ ] **Step 3: Keep `skill-catalog.js` only if installed-package flows still need it**

Expected: authored commands no longer import authored package lists from this file.

- [ ] **Step 4: Re-run domain tests**

Run: `node --test test/domain/workspace-graph.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/domain/skills/skill-catalog.js packages/agentpack/src/domain/skills/skill-model.js
git commit -m "refactor: remove authored discovery heuristics"
```

## Chunk 3: Route All Authored Commands Through The Graph

### Task 5: Replace target resolution with graph-backed lookup

**Files:**
- Modify: `packages/agentpack/src/domain/skills/skill-target-resolution.js`
- Test: `test/domain/workspace-graph.test.js`
- Test: `test/domain/workspace-graph-diagnostics.test.js`
- Test: `test/integration/compiler-first-authored-workspace.test.js`

- [ ] **Step 1: Replace context loading with workspace graph loading**

```js
const graph = buildAuthoredWorkspaceGraph(repoRoot);
const targetRef = graph.targets[normalizedTarget] || null;
```

- [ ] **Step 2: Parse canonical ids before filesystem resolution**

```js
if (target.startsWith('@') && graph.targets[target]) return resolveFromTargetRef(...);
```

- [ ] **Step 3: Return typed package and export resolutions with diagnostics attached**

```js
return {
  kind: 'export',
  package: graph.packages[pkgName],
  export: graph.exports[exportId],
  diagnostics: graph.exports[exportId].diagnostics,
};
```

- [ ] **Step 4: Add explicit `export_not_found` for unknown canonical ids inside an existing package with actionable `nextSteps`**

```js
throw new NotFoundError('skill export not found in package', {
  code: 'skill_not_found_in_package',
  suggestion: pkg.exports.join(', '),
  nextSteps: [{
    action: 'choose_target',
    reason: 'Select one of the available exports from this package',
    options: pkg.exports,
  }],
});
```

- [ ] **Step 5: Re-run domain and integration tests**

Run: `node --test test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js test/integration/compiler-first-authored-workspace.test.js`
Expected: package-root and canonical-id tests still fail in command flows until the application layer is ported.

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/domain/skills/skill-target-resolution.js test/domain/workspace-graph.test.js test/integration/compiler-first-authored-workspace.test.js
git commit -m "feat: resolve authored skill targets from workspace graph"
```

### Task 6: Port `inspect`, `validate`, and `dev` to graph-backed behavior

**Files:**
- Modify: `packages/agentpack/src/application/skills/inspect-skill.js`
- Modify: `packages/agentpack/src/application/skills/validate-skills.js`
- Modify: `packages/agentpack/src/application/skills/start-skill-dev-workbench.js`
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/lib/skills.js`
- Modify: `packages/agentpack/src/commands/skills.js`
- Modify: `packages/agentpack/src/utils/errors.js`
- Modify: `packages/agentpack/src/infrastructure/runtime/materialize-skills.js`
- Test: `test/integration/compiler-first-authored-workspace.test.js`
- Test: `test/integration/skills-inspect.test.js`
- Test: `test/integration/skills-validate.test.js`
- Test: `test/integration/skills-dev.test.js`
- Test: `test/integration/skills-install.test.js`
- Test: `test/integration/skills-env.test.js`

- [ ] **Step 1: Make `inspect` show package/export diagnostics from the graph**

```js
if (resolved.export.status === 'invalid') {
  return { kind: 'export', status: 'invalid', diagnostics: resolved.export.diagnostics };
}
```

- [ ] **Step 2: Make explicit-target `validate` accept package or export targets**

```js
const resolved = resolveSkillTarget(repoRoot, target, { includeInstalled: false });
const exportIds = resolved.kind === 'package' ? resolved.package.exports : [resolved.export.id];
```

- [ ] **Step 3: Make `validate` fail invalid exports with compiler diagnostics, not `skill not found`**

```js
issues: [...graph.exports[id].diagnostics, ...packageValidationIssues]
```

- [ ] **Step 4: Make `dev` require one valid export and preserve graph `nextSteps`**

```js
if (resolved.export.status === 'invalid') throw new ValidationError(...diagnostics...);
```

- [ ] **Step 5: Teach `formatError()` and JSON output to preserve graph-driven `nextSteps` consistently**

Expected: compiler/resolver/command failures all render the same remediation format.

- [ ] **Step 6: Make install/materialize use the same primary/named export model**

Expected:
- package primary export materializes as the package name
- named exports materialize as `package:skill-name`
- no install path re-derives “default” entrypoints outside the graph

- [ ] **Step 7: Remove authored command-local fallback heuristics from `lib/skills.js`**

Expected: no authored CLI path should scan for `SKILL.md` or package dirs on its own.

- [ ] **Step 8: Update human output formatting to print diagnostics and next actions**

Expected: `inspect` and `validate` print invalid exports and compiler locations cleanly.

- [ ] **Step 9: Run focused command tests**

Run: `node --test test/integration/compiler-first-authored-workspace.test.js test/integration/skills-inspect.test.js test/integration/skills-validate.test.js test/integration/skills-dev.test.js test/integration/skills-install.test.js test/integration/skills-env.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/agentpack/src/application/skills/inspect-skill.js packages/agentpack/src/application/skills/validate-skills.js packages/agentpack/src/application/skills/start-skill-dev-workbench.js packages/agentpack/src/application/skills/build-compiled-state.js packages/agentpack/src/lib/skills.js packages/agentpack/src/commands/skills.js packages/agentpack/src/utils/errors.js test/integration/compiler-first-authored-workspace.test.js test/integration/skills-inspect.test.js test/integration/skills-validate.test.js test/integration/skills-dev.test.js
git commit -m "feat: route authored CLI commands through workspace graph"
```

## Chunk 4: Make The Compiler Contract The Only Authored Contract

### Task 7: Scope strict legacy rejection to frontmatter only

**Files:**
- Modify: `packages/agentpack/src/domain/compiler/skill-document-parser.js`
- Modify: `test/domain/skill-document-parser.test.js`

- [ ] **Step 1: Add the failing body-example regression test**

```js
it('does not reject body examples that mention requires or metadata.sources', () => {
  assert.doesNotThrow(() => parseSkillDocument(documentWithBodyExample));
});
```

- [ ] **Step 2: Run the parser test**

Run: `node --test test/domain/skill-document-parser.test.js`
Expected: FAIL under the current whole-file regex.

- [ ] **Step 3: Change `assertNoLegacyFields()` to read frontmatter only**

```js
const { frontmatterText } = extractFrontmatterSections(content);
assertNoLegacyFields(frontmatterText);
```

- [ ] **Step 4: Keep rejection strict for actual frontmatter violations**

Expected: frontmatter with `requires` or `metadata.sources` still fails.

- [ ] **Step 5: Re-run parser tests**

Run: `node --test test/domain/skill-document-parser.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agentpack/src/domain/compiler/skill-document-parser.js test/domain/skill-document-parser.test.js
git commit -m "fix: scope legacy field checks to frontmatter"
```

### Task 8: Rewrite bundled skills and docs to match the compiler-only contract

**Files:**
- Modify: `docs/schema-package-json.mdx`
- Modify: `docs/schema-skill-md.mdx`
- Modify: `packages/agentpack/skills/compiler-mode-authoring/SKILL.md`
- Modify: `packages/agentpack/skills/multi-skill-packages/SKILL.md`
- Modify: `packages/agentpack/skills/authoring-skillgraphs-from-knowledge/SKILL.md`
- Modify: `packages/agentpack/skills/getting-started-skillgraphs/SKILL.md`
- Modify: `packages/agentpack/skills/identifying-skill-opportunities/SKILL.md`
- Modify: `packages/agentpack/skills/publishing-skill-packages/SKILL.md`
- Modify: `packages/agentpack/skills/authoring-skillgraphs-from-knowledge/references/authored-metadata.md`
- Create: `test/integration/skill-doc-contract.test.js`

- [ ] **Step 1: Add the failing doc-contract test**

```js
it('bundled authoring docs do not mention metadata.sources or frontmatter requires as the authored contract', () => {
  assert.equal(findForbiddenContractText(files).length, 0);
});
```

- [ ] **Step 2: Add the failing package-config doc assertion**

```js
assert.match(schemaPackageJson, /agentpack\.root/);
assert.doesNotMatch(schemaPackageJson, /agentpack\.skills/);
```

- [ ] **Step 3: Rewrite docs to describe one compiler-first model**

Expected content:
- `package.json.agentpack.root` declares the package skill root
- `SKILL.md` declares semantic edges
- canonical ids are compiler-derived
- no `metadata.sources`
- no frontmatter `requires`

- [ ] **Step 4: Re-run the doc-contract test**

Run: `node --test test/integration/skill-doc-contract.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/schema-package-json.mdx docs/schema-skill-md.mdx packages/agentpack/skills/compiler-mode-authoring/SKILL.md packages/agentpack/skills/multi-skill-packages/SKILL.md packages/agentpack/skills/authoring-skillgraphs-from-knowledge/SKILL.md packages/agentpack/skills/getting-started-skillgraphs/SKILL.md packages/agentpack/skills/identifying-skill-opportunities/SKILL.md packages/agentpack/skills/publishing-skill-packages/SKILL.md packages/agentpack/skills/authoring-skillgraphs-from-knowledge/references/authored-metadata.md test/integration/skill-doc-contract.test.js
git commit -m "docs: align bundled skills with compiler-first contract"
```

## Chunk 5: Unify Build Output And Verify End-To-End

### Task 9: Make `.agentpack/compiled.json` emit the workspace graph model

**Files:**
- Modify: `packages/agentpack/src/application/skills/build-compiled-state.js`
- Modify: `packages/agentpack/src/infrastructure/fs/compiled-state-repository.js`
- Modify: `test/integration/skills-build.test.js`
- Modify: `test/integration/skills-compiled-state.test.js`

- [ ] **Step 1: Add a failing compiled-state shape test**

```js
assert.deepEqual(result.artifact.packages[0].exports, ['@acme/brand:value-copywriting']);
```

- [ ] **Step 2: Run the compiled-state tests**

Run: `node --test test/integration/skills-build.test.js test/integration/skills-compiled-state.test.js`
Expected: FAIL until build output includes package/export graph metadata.

- [ ] **Step 3: Emit package/export graph metadata from the compiler-backed build path**

Expected: compiled artifact contains enough package/export identity to power authored and runtime flows from one schema, including the package primary export.

- [ ] **Step 4: Re-run the compiled-state tests**

Run: `node --test test/integration/skills-build.test.js test/integration/skills-compiled-state.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agentpack/src/application/skills/build-compiled-state.js packages/agentpack/src/infrastructure/fs/compiled-state-repository.js test/integration/skills-build.test.js test/integration/skills-compiled-state.test.js
git commit -m "feat: emit compiler-first workspace graph in compiled state"
```

### Task 10: Run the harness and real-worktree verification

**Files:**
- Reference: `docs/superpowers/specs/2026-03-15-agentpack-harness-design.md`
- Reference: `/Users/alexandergirardet/.superset/worktrees/Alavida/exploring-articles/workspace/active/architecture/agonda-monorepo/`

- [ ] **Step 1: Run the focused domain and integration tests**

Run: `node --test test/domain/workspace-graph.test.js test/domain/workspace-graph-diagnostics.test.js test/domain/skill-document-parser.test.js test/integration/compiler-first-authored-workspace.test.js test/integration/skills-inspect.test.js test/integration/skills-validate.test.js test/integration/skills-dev.test.js test/integration/skill-doc-contract.test.js test/integration/skills-build.test.js test/integration/skills-compiled-state.test.js test/integration/intent-bin.test.js`
Expected: PASS

- [ ] **Step 2: Run the full integration harness**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Verify the real authored package in the consumer worktree**

Run: `agentpack skills inspect /Users/alexandergirardet/.superset/worktrees/Alavida/exploring-articles/workspace/active/architecture/agonda-monorepo`
Expected: package output listing all compiled exports or export-specific diagnostics.

- [ ] **Step 4: Verify package-root validate in the real worktree**

Run: `agentpack skills validate /Users/alexandergirardet/.superset/worktrees/Alavida/exploring-articles/workspace/active/architecture/agonda-monorepo`
Expected: all exports validated; invalid exports reported explicitly with compiler diagnostics if present.

- [ ] **Step 5: Verify canonical id inspect in the real worktree**

Run: `agentpack skills inspect @alavida/monorepo-architecture:monorepo-overview`
Expected: exact export resolves.

- [ ] **Step 6: Verify package-name inspect for the primary export in the real worktree**

Run: `agentpack skills inspect @alavida/monorepo-architecture`
Expected: resolves the package primary export, not a flat package summary.

- [ ] **Step 7: Verify `skills dev` on one export in the real worktree**

Run: `agentpack skills dev /Users/alexandergirardet/.superset/worktrees/Alavida/exploring-articles/workspace/active/architecture/agonda-monorepo/skills/monorepo-onboarding --no-dashboard`
Expected: linked skill starts successfully or reports typed export diagnostics.

- [ ] **Step 8: Verify install/materialization of the primary export in a controlled consumer repo**

Expected:
- `agentpack skills install @alavida/monorepo-architecture` materializes the root skill as `monorepo-architecture`
- named exports remain available as `monorepo-architecture:...`

- [ ] **Step 9: Re-run the same real-worktree commands from the installed CLI context, not only the local source entrypoint**

Expected: the actual CLI binary used in the worktree succeeds after rebuilding/relinking the package, not just `node packages/agentpack/bin/agentpack.js`.

- [ ] **Step 10: Do not stop until both the harness and real-worktree CLI agree**

Completion criteria:
- focused domain/integration harness green
- `npm test` green
- real worktree package-root `inspect`, package-name `inspect`, canonical-id `inspect`, package-root `validate`, and `dev --no-dashboard` working from the installed CLI path
- controlled consumer install materializes the primary export and named exports from the same graph model

- [ ] **Step 11: Commit the final verification-backed branch state**

```bash
git status --short
git add .
git commit -m "refactor: move authored skill commands to compiler-first workspace graph"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-16-compiler-first-workspace-graph.md`. Ready to execute?
