# Implementation Plan Review

Status: review complete
Date: 2026-03-10
Reviewer: Senior Engineering Reviewer

This document is a stress-test of the PRD, stories, and rename-spec against the actual source code. Every finding is actionable.

---

## 1. Story Coverage Gaps

### 1.1 PRD requirements not covered by any story

- **`agentpack plugin dev` watch mode** -- WATCH-01 through WATCH-04 cover the happy path, but there is no story for what happens when the initial build fails during `plugin dev`. Does it exit? Does it print the error and still start watching? The PRD does not specify, and no story covers this.

- **`plugin build --clean` when output directory does not exist** -- BUILD-08 tests `--clean` when a previous build exists, but there is no story for `--clean` on a fresh repo where `.agentpack/dist/` does not exist yet. The implementation must handle `rmSync` on a nonexistent path.

- **`skills dev` repo root resolution** -- The PRD says `skills dev <path>` resolves relative to the repo root, but no story tests what happens when the command is run from a subdirectory (e.g., `cd skills && agentpack skills dev copywriting`). The `findRepoRoot` walks up to find `.git`, but the `<path>` argument resolution relative to cwd vs repo root is unspecified and untested.

- **`writeInstallState` mkdirSync** -- The rename-spec (note 2) says `writeInstallState` must create `.agentpack/` before writing. No story explicitly verifies this. RENAME-02 tests the result but does not test a cold-start scenario where `.agentpack/` does not exist yet and an install is the first operation.

### 1.2 Edge cases the stories miss

- **Concurrent `skills dev` operations** -- No story tests what happens if two `skills dev` commands run simultaneously targeting the same skill name. Symlink creation is not atomic.

- **Symlink target is a relative vs absolute path** -- DEV-01 checks that the symlink exists and resolves, but does not specify whether the symlink should use a relative or absolute path. On macOS, absolute symlinks break when the repo is moved. The implementation should probably use relative symlinks, and a story should test this.

- **`skills unlink` on a non-symlink** -- UNLINK-02 tests a missing skill, but what if `.claude/skills/<name>` exists as a real directory (not a symlink)? The `unlink` command should refuse to remove it to avoid data loss. No story covers this.

- **`plugin build` output includes `package.json` from vendored skills** -- BUILD-02 and BUILD-03 test that SKILL.md is vendored, but the PRD says only SKILL.md is copied for standalone skill packages. What happens if a vendored skill also has a `package.json`? It should NOT be copied (to avoid confusing npm). No story verifies this exclusion.

### 1.3 Contradictions between stories

- **RENAME-07 vs rename-spec on `.gitignore` content** -- RENAME-07 says `.gitignore` contains `.agentpack/dist/`. The rename-spec section 6 says the same. But the build-lifecycle.mdx consistently uses `.agentpack/out/` as the build output path (lines 93, 156, 159, 164, 176, 201, 238, 306). The PRD uses `.agentpack/dist/`. **This is an unresolved naming conflict.** The implementing agent must pick one and update the other document. Recommendation: use `dist/` as the PRD specifies, and update build-lifecycle.mdx.

- **DEV-08 exit code vs PRD exit codes** -- DEV-08 says exit code 1 for invalid SKILL.md. The PRD says exit code 1 for "target not found or SKILL.md invalid" and exit code 2 for "validation error." An invalid SKILL.md (no frontmatter) is arguably a validation error. The boundary between exit code 1 and 2 is unclear. Recommendation: exit 1 for structural failures (file missing, unparseable), exit 2 for semantic validation failures (bad status field, etc.).

- **BUILD-11 tests dep sync on local skills, but local plugin skills have no `package.json`** -- The fixture in `createPluginBundleFixture()` (fixtures.js lines 229-257) creates local plugin skills with only SKILL.md and no `package.json`. The dep sync function requires a `package.json` to exist. BUILD-11 is testing a scenario that may not apply: local plugin skills under `plugins/*/skills/` do not have individual `package.json` files in the current fixture. The PRD's "perform dep sync for each local skill's `package.json`" is inapplicable to plugin-local skills that lack `package.json`. The PRD needs to clarify: does dep sync only run for skills that HAVE a `package.json`, or is it an error if they lack one?

- **Plugin validation checks `devDependencies`, but dep sync writes to `dependencies`** -- The existing `validatePluginBundle` (plugins.js line 196) checks `packageMetadata.devDependencies[packageName]` for plugin-level bundle input validation. But the dep sync in the PRD writes to `dependencies`. The PRD's dep sync runs on individual skill `package.json` files (which use `dependencies`), not on the plugin-level `package.json` (which uses `devDependencies`). This is not a contradiction per se, but it is confusing and warrants a note: plugin-level `package.json` declares standalone skill packages in `devDependencies` (for npm resolution), while skill-level `package.json` uses `dependencies` (for publishing). The stories do not test this distinction.

---

## 2. Rename Risks

### 2.1 Missing files or references in the rename-spec

- **`src/lib/context.js` line 31 and 32** -- The rename-spec lists these. Verified correct.

- **`src/lib/skills.js` line 155** -- The function `findPackageDirByName` has a loop that skips `.git` and `node_modules` but does NOT skip `.agonda` or `.agentpack`. This is not a rename issue, but it becomes a problem after plugin build is implemented (see section 5.1).

- **`src/lib/plugins.js` line 173** -- The `bundleManifestPath` references `.claude-plugin/bundled-skills.json`. This is not an agonda reference, so the rename-spec correctly omits it. Verified.

- **Grep for remaining `agonda` references** -- The rename-spec covers all source files. However, it does not cover comments or JSDoc in `src/lib/skills.js`. A manual `grep -ri agonda src/` after the rename should be part of the verification step.

### 2.2 Runtime paths that would break

- **Existing consumer repos with `agonda.skills.json`** -- If a user upgrades agentpack after having already installed skills, their `agonda.skills.json` file will be orphaned and the new code will read from `.agentpack/install.json` (which won't exist). The next `skills install` will create a fresh state, but all previously installed skills will be "forgotten." The PRD has no migration path. See section 7.

- **CI scripts that reference `agonda.skills.json` or `.agonda/`** -- Any external CI pipeline (not in this repo) that checks for these paths will break silently.

### 2.3 AGONDA_DISCOVERY_ROOT environment variable

The rename-spec (line 52-56, 106-107, 116-117) renames `AGONDA_DISCOVERY_ROOT` to `AGENTPACK_DISCOVERY_ROOT`. This is correct. However:

- There is no backwards-compatible fallback. Any external script or CI job using `AGONDA_DISCOVERY_ROOT` will silently lose the override.
- Recommendation: add a one-time warning if `AGONDA_DISCOVERY_ROOT` is set but `AGENTPACK_DISCOVERY_ROOT` is not. This is a minor ergonomic issue, not a blocking risk.

### 2.4 `.agentpack/` directory collisions

**Critical finding:** The `.agentpack/` directory serves three purposes after the rename:

1. `.agentpack/install.json` -- consumer install state (runtime, gitignored)
2. `.agentpack/catalog.json` and `.agentpack/build-state.json` -- authoring metadata (committed)
3. `.agentpack/dist/` -- plugin build output (gitignored)

The `.gitignore` entry `.agentpack/install.json` uses a specific file path, and `.agentpack/dist/` uses a directory glob. This means `catalog.json` and `build-state.json` are NOT ignored and will be committed. This is correct and intentional.

However, there is a **structural ambiguity**: in an authoring repo that also builds plugins, `.agentpack/` will contain both committed files (catalog.json, build-state.json) and gitignored files (install.json, dist/). This is manageable but warrants a comment in the `.gitignore` file explaining the dual purpose.

No collision risk between `dist/` and the metadata files because they have distinct paths.

---

## 3. Dependency Sync Risks

### 3.1 Non-managed-scope dependencies

The PRD (line 296) and SYNC-04 correctly specify that only `@alavida/*` and `@alavida-ai/*` dependencies are eligible for removal. Unscoped and third-party dependencies are preserved. This is correct.

However, the add side is unrestricted: if `requires` contains `lodash` (a non-scoped package), dep sync will add `"lodash": "*"` to dependencies. This is arguably correct but unexpected. No story tests adding a non-scoped package via requires. Recommendation: add a SYNC story for this case, or document that `requires` is intended only for managed-scope packages.

### 3.2 The `"*"` version range for newly added deps

The PRD uses `"*"` as the default range. This is **dangerous for npm publish**:

- `"*"` resolves to the latest version at install time, which is non-deterministic.
- For packages published to GitHub Packages, `"*"` will pull whatever version the consumer's npm config resolves to.
- After `skills validate` syncs deps with `"*"` and the author publishes, consumers installing the skill will get `"*"` in their dependency tree.

**Recommendation:** Consider using `">=0.0.0"` (equivalent but more explicit) or better, querying the local monorepo's `package.json` for the current version and defaulting to `"^<current-version>"`. If querying is too complex for now, `"*"` is acceptable as a placeholder that the author is expected to update, but the validate step should WARN (not error) that `"*"` ranges exist in dependencies.

No story checks for this warning.

### 3.3 Sync overwriting pinned versions

SYNC-03 correctly specifies that existing version ranges are preserved. The implementation must use "only add if not present" semantics, not "upsert." This is clear in the PRD. Verified.

### 3.4 devDependencies

The PRD's dep sync function operates on `dependencies`, not `devDependencies`. This is correct for skill packages. But:

- Plugin-level `package.json` uses `devDependencies` for standalone skill package resolution (see `validatePluginBundle` line 196 in plugins.js).
- The PRD says `plugin build` syncs deps for each local skill's `package.json`. Since plugin-local skills in the fixture do not have `package.json` files (they only have SKILL.md), dep sync for plugin build is effectively a no-op on local skills. It should only sync deps for standalone skill packages that have their own `package.json`.
- No story or PRD section addresses whether `devDependencies` on the plugin-level `package.json` should also be synced. Currently, the plugin author manually declares standalone skill packages in `devDependencies`. The dep sync does NOT touch these. This should be explicitly documented.

---

## 4. Skills Dev Risks

### 4.1 Non-symlink directory collision

If `.claude/skills/<name>` already exists as a real directory (not a symlink), `skills dev` must handle this. Options:

1. Fail with an error (safest)
2. Remove and replace with symlink (destructive)
3. Skip and warn

DEV-06 tests re-linking when the skill is already linked (symlink exists), but no story tests the case where it is a real directory. **The implementing agent must decide and add a guard.**

### 4.2 Already installed via `skills install` AND `skills dev`

If a skill is already installed (present in `.agentpack/install.json` and materialized via `skills install`), and the author then runs `skills dev` on a local copy, the dev symlink will overwrite the install symlink. When the author later runs `skills unlink`, the installed materialization will be lost.

**Recommendation:** `skills dev` should check if the target name already exists in `.claude/skills/` as a non-symlink or as a symlink pointing to `node_modules/`, and warn the user.

No story covers this interaction.

### 4.3 Should dev update `.agentpack/install.json`?

The PRD does not specify. The answer should be NO -- `skills dev` creates symlinks for local testing and is orthogonal to the install state. Install state tracks npm-installed packages. Dev-linked skills are a separate concept.

However, this means `agentpack skills env` will show the installed skill but not the dev-linked skill. If the dev-linked skill overrides the installed one, `skills env` will report stale information. **Recommendation:** Add a note in the PRD that `skills env` should detect dev-linked symlinks and report them separately. This is not blocking but is a UX gap.

### 4.4 Repo root resolution

`skills dev <path>` resolves `<path>` relative to what? Looking at the existing `resolveInstallTargets` and `resolvePackagedSkillTarget` functions, paths are resolved relative to `repoRoot`. But the PRD does not specify this for `skills dev`.

The implementing agent should resolve `<path>` relative to the current working directory (consistent with how `plugin build` and `plugin inspect` work -- they resolve `target` via `resolve(repoRoot, target)` in plugins.js line 16). But they should also accept absolute paths.

No story tests an absolute path argument.

---

## 5. Plugin Build Risks

### 5.1 Build output polluting `listPackagedSkillDirs` traversal

**Critical finding.** The function `listPackagedSkillDirs` (skills.js line 801) walks the entire repo root looking for directories containing both `SKILL.md` and `package.json`. It skips `.git` and `node_modules` but does NOT skip `.agentpack`.

After a `plugin build` writes vendored skills into `.agentpack/dist/plugins/<name>/skills/<skill>/`, each vendored skill directory will contain a `SKILL.md`. If the vendored skill also has a `package.json` (which the PRD says should NOT be copied -- only SKILL.md), this is not a problem. But:

1. If the build copies `package.json` alongside SKILL.md for vendored skills (which some stories like BUILD-05 imply for the plugin's own package.json), the traversal WILL pick them up.
2. The plugin build also copies the plugin-level `package.json` to the output root. If the build output's `skills/` subdirectories contain only SKILL.md (no package.json), `listPackagedSkillDirs` will not match them. This is safe.
3. However, the local plugin skills ARE copied with their full directory contents. If a local plugin skill has a `package.json` (which the current fixture does not, but future ones might), the build output will include both SKILL.md and package.json, and `listPackagedSkillDirs` will find them.

**Recommendation:** Add `.agentpack` to the skip list in `listPackagedSkillDirs`, alongside `.git` and `node_modules`. This is a one-line fix that prevents subtle traversal bugs:

```js
if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agentpack') continue;
```

This should also be applied to the similar skip logic in `findPackageDirByName` (skills.js line 155).

**This is the highest-priority implementation item outside the explicit PRD scope.** Without it, `skills validate` and `skills stale` will start reporting phantom skills from the build output.

### 5.2 Vendored skills with non-SKILL.md files

The PRD (step 8) says: "For each resolved standalone skill package, copy `SKILL.md` into `skills/<skill-name>/`." This means ONLY SKILL.md is copied, not supplementary files (README.md, images, etc.).

This is correct for Claude discovery (Claude only reads SKILL.md), but it means the vendored skill loses any supplementary content. If a SKILL.md references a local image or supplementary markdown via a relative path, that reference will break.

Recommendation: document this as a known limitation. Future enhancement could copy all files listed in `package.json.files`.

### 5.3 Two vendored skills with same relative path

The PRD vendors each skill into `skills/<skill-name>/SKILL.md`. Since skill names must be unique (the build already validates for name collisions -- see `validatePluginBundle` in plugins.js), this is not a risk. Two skills cannot have the same name. Verified.

### 5.4 Build output `package.json` handling

The PRD says `package.json` is copied to the output. But should it be modified? Considerations:

- `devDependencies` should NOT be in the published artifact. npm publish strips them when packing, but if someone manually copies the build output, devDeps would be present.
- The `version` field should match the source.
- `files` field may need updating to include the vendored skills.

No story addresses `package.json` transformation. Recommendation: copy `package.json` as-is for now and document that the publish step is `npm publish` (which handles stripping).

### 5.5 Previous build output directory

BUILD-08 covers `--clean`. But without `--clean`, what happens? The PRD does not specify. Options:

1. Overwrite files in place (risk: stale files from previous build remain)
2. Always clean before building (safe but slower)
3. Fail if output exists (too strict)

Recommendation: always clean the specific plugin's output directory before building, regardless of `--clean`. Make `--clean` clean the entire `.agentpack/dist/` directory. This distinction is not in the PRD or stories.

---

## 6. Implementation Order Risks

### 6.1 Hidden dependency: `.agentpack` skip in `listPackagedSkillDirs`

Phase 5 (plugin build) creates content in `.agentpack/dist/` that will be picked up by functions used in Phase 1's existing tests. **The `.agentpack` skip (section 5.1) should be added during Phase 1 (rename)**, not Phase 5. If it is deferred, Phase 5's tests may cause existing `validate` and `stale` tests to behave unpredictably.

### 6.2 Phase 2 (dep sync) can be tested independently

Yes. Dep sync is a pure function: input is a directory with SKILL.md and package.json, output is a modified package.json. It has no dependencies on Phase 3 or later. This is correctly ordered.

### 6.3 Phase 4 (validate update) before Phase 3 (skills dev)?

The PRD puts Phase 3 before Phase 4. This is correct because:
- Phase 3 uses dep sync (from Phase 2) and adds new command handlers.
- Phase 4 modifies existing validate logic to call dep sync.
- There is no dependency from Phase 3 on Phase 4 or vice versa.

However, **Phase 4 should be tested to ensure it does not break the existing validate test that checks for `missing_dependency_declaration`**. That test currently expects the error. After Phase 4, it should NOT fire for requires-based dependencies. The stories (VAL-02) cover this, but the implementing agent must update the existing test, not just add a new one.

### 6.4 Phase 5 (plugin build) depends on a working `resolveBundleClosure`

`resolveBundleClosure` in plugins.js resolves standalone skill packages from the repo and `node_modules`. Plugin build will use this, but it also needs to COPY files -- a new capability. The implementation should extend plugins.js rather than duplicating logic. The PRD says "reuse existing" which is correct.

---

## 7. Missing from PRD

### 7.1 `agentpack skills publish` convenience wrapper

Not in the PRD. This is fine for now -- `npm publish` is the standard mechanism and wrapping it adds complexity without clear value. The validate command already outputs the publish command as a "next step."

### 7.2 Live-validation and smoke-monorepo scripts

The rename-spec covers these scripts (section 4). But the PRD does not mention whether they need logic changes beyond string replacements. After the rename, these scripts should still work because they test the same behavior with new paths. However:

- `scripts/live-validation.mjs` line 131 removes `agonda.skills.json` at cleanup. After rename, it removes `.agentpack/install.json`. But should it also remove the `.agentpack/` directory if it was created by the test? The current script removes a single file; the new path is inside a directory that may also contain committed metadata. **The cleanup should remove only `install.json`, not the directory.** Verify that the `rmSync` call targets the file, not the directory.

### 7.3 Backwards compatibility / migration

**This is the most significant gap in the PRD.** There is no migration path for:

1. Consumer repos with existing `agonda.skills.json` -- skills will be "forgotten" after upgrade
2. Authoring repos with existing `.agonda/` metadata -- catalog and build-state will be regenerated, but the old directory will remain as dead weight
3. CI pipelines referencing old paths

Recommendations:
- **Minimum:** Add a deprecation notice to the CLI. When `agonda.skills.json` exists and `.agentpack/install.json` does not, print a one-time warning: "Found legacy agonda.skills.json. Run `agentpack migrate` to move to .agentpack/install.json."
- **Better:** Implement a `readInstallState` fallback that checks both paths, preferring `.agentpack/install.json` but falling back to `agonda.skills.json` if the new path does not exist. On first write, write to the new path and optionally delete the old file.
- **Best:** Add a `agentpack migrate` command that moves files from old to new locations.

Since this is an internal tool with presumably few consumer repos, the "better" option (fallback read) is recommended. It is 5 lines of code in `readInstallState` and prevents silent data loss.

### 7.4 `.agentpack/` not in skill package `files` array

When a skill is published via npm, only files listed in `package.json.files` are included. The validate step already checks for `SKILL.md` in `files`. But after the rename, if `skills install` or `skills dev` creates `.agentpack/install.json` inside a skill directory (it should not -- install state is at repo root), it could accidentally be published. This is not actually a risk because `install.json` is at repo root, not inside skill directories. Verified safe.

---

## 8. Story Quality Check

### 8.1 Concrete, testable acceptance criteria

All stories have concrete acceptance criteria. Most are directly translatable to test assertions. Quality is high.

Exceptions:
- **WATCH-02 and WATCH-03** have vague test scenarios ("Same async pattern as WATCH-02"). These need more detail for an implementing agent -- specifically: how to start the process, how to wait for the initial build, how to trigger the change, and how long to wait for the rebuild.
- **BUILD-11** has a test scenario that acknowledges the fixture gap ("if the local skills had package.json files..."). This needs to be resolved before implementation.

### 8.2 Test scenario specificity

Most test scenarios are specific enough to write tests from. The pseudocode is clear and uses real fixture helpers.

Issues:
- **BUILD-04** uses a vague assertion pattern: `packageNames.includes(...) || packageNames.some(k => k.includes(...))`. This suggests the schema of `bundled-skills.json` is not defined. The PRD should specify the exact schema. Suggested schema:

```json
{
  "version": 1,
  "packages": {
    "@alavida-ai/value-proof-points": {
      "version": "1.0.1",
      "skillName": "value-proof-points",
      "source": "repo",
      "direct": true
    }
  }
}
```

- **E2E-01** test scenario step 4 uses `join(author.root, 'skills/my-skill')` as the install target. This works for local installs but is not how a real consumer would install (they would use a package name). This is acceptable for testing purposes.

### 8.3 Exit code consistency

Exit codes across stories are mostly consistent with the PRD:

| Condition | PRD exit code | Story exit code | Consistent? |
|---|---|---|---|
| skills dev success | 0 | 0 | Yes |
| skills dev target not found | 1 | 1 | Yes |
| skills dev invalid SKILL.md | 1 | 1 | Yes (but see 1.3 above) |
| skills dev validation error | 2 | not tested | Missing |
| skills unlink success | 0 | 0 | Yes |
| skills unlink not found | 1 | 1 | Yes |
| plugin build success | 0 | 0 | Yes |
| plugin build unresolved deps | 1 | 1 | Yes |
| plugin build invalid plugin | 2 | 2 | Yes |
| plugin build name collision | 1 | 1 | Yes |

**Issue:** The PRD defines exit code 2 for `skills dev` "validation error" but no story triggers it. What constitutes a validation error (as opposed to exit 1) for `skills dev`? If it is only used for dep sync errors, that should be specified.

---

## 9. Overall Risk Assessment

### 9.1 Single riskiest part

**The `listPackagedSkillDirs` traversal not skipping `.agentpack/`** (section 5.1). This is a latent bug that will cause `validate`, `stale`, `dependencies`, and `catalog`/`build-state` generation to discover phantom skills from the build output directory. It is a one-line fix but easy to miss, and it will cause confusing test failures that are hard to diagnose.

### 9.2 Recommendations

1. **Fix `listPackagedSkillDirs` to skip `.agentpack` in Phase 1.** This prevents it from becoming a Phase 5 blocker.

2. **Resolve the `out/` vs `dist/` naming conflict** between build-lifecycle.mdx and the PRD before implementation starts. The implementing agent should not have to guess.

3. **Add a `readInstallState` fallback** for `agonda.skills.json` to prevent silent data loss during the upgrade transition.

4. **Define the `bundled-skills.json` schema** in the PRD so BUILD-04 has a concrete assertion target.

5. **Clarify whether plugin-local skills (without `package.json`) go through dep sync.** If not, document that dep sync is a no-op for skills without `package.json` and adjust BUILD-11's test scenario.

6. **Add `.agentpack` to the skip list in `findPackageDirByName` (line 155)** alongside `listPackagedSkillDirs` (line 818). Both functions traverse the repo.

### 9.3 What the implementing agent should watch out for

1. **The rename is all-or-nothing.** Do not attempt to rename incrementally. Change all fixtures, source, tests, docs, and scripts in one pass and verify all 59 tests pass. If any test fails, the rename is incomplete.

2. **The `writeInstallState` function needs `mkdirSync` added.** The rename-spec calls this out, but it is easy to forget because the current code writes to a root-level file that always exists in the parent directory.

3. **The validate test for `missing_dependency_declaration`** will need special attention in Phase 4. The existing test that triggers this error must be updated to expect the error to be auto-fixed. Do not just add a new test -- update the old one.

4. **`fs.watch` (for `plugin dev`) is unreliable on Linux.** If the project ever runs on Linux CI, use `chokidar` or `fs.watchFile` with polling. For macOS/development use, `fs.watch` is acceptable.

5. **Symlink creation on Windows.** If any contributor uses Windows, `symlinkSync` requires elevated privileges or developer mode. This is not addressed in the PRD and may cause test failures on Windows CI. The current codebase already uses symlinks (in `installSkills`), so this is a pre-existing limitation.

6. **Test isolation for `skills dev` and `skills unlink`.** These tests create symlinks in temp repos. Ensure `cleanup()` removes the entire temp directory including `.claude/` and `.agents/` subdirectories. The existing `rmSync(root, { recursive: true })` handles this.

7. **The `createPluginBundleFixture` uses `devDependencies` for standalone skill packages** (fixtures.js line 219). This is correct for plugin validation (plugins.js checks devDependencies). But when adding dep sync to plugin build, ensure the sync targets each skill's own `package.json.dependencies`, NOT the plugin-level `devDependencies`.

---

## Appendix: Quick Reference of Findings by Severity

### Must fix before implementation

| # | Finding | Section |
|---|---|---|
| 1 | Add `.agentpack` to `listPackagedSkillDirs` and `findPackageDirByName` skip lists | 5.1, 9.2 |
| 2 | Resolve `out/` vs `dist/` naming conflict between build-lifecycle.mdx and PRD | 1.3 |
| 3 | Add `mkdirSync` to `writeInstallState` (rename-spec note, must not be forgotten) | 1.1 |

### Should fix before implementation

| # | Finding | Section |
|---|---|---|
| 4 | Add `readInstallState` fallback for `agonda.skills.json` | 7.3 |
| 5 | Define `bundled-skills.json` schema in PRD | 8.2 |
| 6 | Clarify dep sync behavior for plugin-local skills without `package.json` | 1.3, 3.4 |
| 7 | Add story for `skills unlink` on non-symlink target | 1.2 |

### Should fix during implementation

| # | Finding | Section |
|---|---|---|
| 8 | Use relative symlinks in `skills dev` | 1.2 |
| 9 | Add `"*"` range warning to validate output | 3.2 |
| 10 | Default to always-clean behavior in `plugin build` | 5.5 |
| 11 | Add `.agentpack` skip to `findWorkbenchFiles` in context.js | 5.1 |
| 12 | Flesh out WATCH-02/WATCH-03 test scenarios | 8.1 |
