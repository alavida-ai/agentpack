# agentpack PRD: Rename + Build Lifecycle

Status: ready for implementation
Date: 2026-03-10

## Context

agentpack is a compiler toolchain for agent skills and plugins. The codebase is functional (59 passing tests, live-validated against real repos) but uses legacy naming from when it was called "agonda." This PRD covers two workstreams:

1. **Rename** — align all file names, directory names, config keys, and CLI output with the agentpack brand and modern JS conventions
2. **Build Lifecycle** — add `skills dev`, `skills unlink`, `plugin build`, `plugin dev`, and automatic dependency sync

## Codebase Inventory

### Source files that reference legacy names

Every file below contains `.agonda/`, `agonda.skills.json`, or `agonda`-prefixed identifiers that must change:

| File | LOC | What it does |
|---|---|---|
| `src/lib/skills.js` | 1543 | Core library — parsing, install, stale, validate, catalog/build-state generation |
| `src/lib/plugins.js` | 244 | Plugin bundle inspection and validation |
| `src/lib/context.js` | 167 | Repo root and workbench detection |
| `src/commands/skills.js` | 418 | CLI command handlers for all skills commands |
| `src/commands/plugin.js` | 111 | CLI command handlers for plugin inspect-bundle and validate-bundle |
| `src/cli.js` | 82 | Commander setup, global options |
| `src/utils/errors.js` | 67 | Custom error classes (AgondaError) |
| `src/utils/output.js` | 61 | Output formatting |

### Test files that reference legacy names

All 18 test files reference `.agonda/` paths or `agonda.skills.json`:

| File | Tests |
|---|---|
| `test/integration/skills-install.test.js` | install + materialize |
| `test/integration/skills-uninstall.test.js` | uninstall + reconcile |
| `test/integration/skills-env.test.js` | environment inspection |
| `test/integration/skills-stale.test.js` | stale detection |
| `test/integration/skills-validate.test.js` | validation (9 tests) |
| `test/integration/skills-inspect.test.js` | inspection |
| `test/integration/skills-dependencies.test.js` | dep graph |
| `test/integration/skills-missing.test.js` | missing deps |
| `test/integration/skills-outdated.test.js` | outdated detection |
| `test/integration/skills-status.test.js` | health overview |
| `test/integration/skills-registry.test.js` | registry config |
| `test/integration/skills-json.test.js` | JSON output |
| `test/integration/skills-authoring-metadata.test.js` | catalog/build-state gen |
| `test/integration/skills-multi-root.test.js` | multi-root install |
| `test/integration/skills-install-workbench.test.js` | workbench install |
| `test/integration/skills-reinstall.test.js` | reinstall + errors |
| `test/integration/plugin-bundle.test.js` | plugin bundle |
| `test/integration/fixtures.js` | shared test helpers |

### Fixture files that must be renamed

| Current path | Purpose |
|---|---|
| `test/fixtures/monorepo/.agonda/skills.catalog.json` | authoring catalog |
| `test/fixtures/monorepo/.agonda/build-state.json` | source hashes |
| `test/fixtures/consumer/agonda.skills.json` | empty install state |

### Other files

| File | Changes needed |
|---|---|
| `.gitignore` | `agonda.skills.json` → `.agentpack/install.json` |
| `README.md` | references to `.agonda/` files |
| `LIVE-TEST.md` | references to agonda files |
| `scripts/live-validation.mjs` | references to `.agonda/` paths |
| `scripts/smoke-monorepo.mjs` | references to `.agonda/` paths |
| `templates/consumer.npmrc.example` | no change needed |
| `docs/*.mdx` | references throughout |

---

## Workstream 1: Rename

### Rename Map

#### Directories

| Current | New |
|---|---|
| `.agonda/` | `.agentpack/` |

#### Files

| Current | New | Committed? |
|---|---|---|
| `.agonda/skills.catalog.json` | `.agentpack/catalog.json` | yes (authoring repo) |
| `.agonda/build-state.json` | `.agentpack/build-state.json` | yes (authoring repo) |
| `agonda.skills.json` | `.agentpack/install.json` | no (runtime state) |

#### CLI Commands

| Current | New |
|---|---|
| `agentpack plugin inspect-bundle` | `agentpack plugin inspect` |
| `agentpack plugin validate-bundle` | `agentpack plugin validate` |

#### Code Identifiers

| Current pattern | New pattern |
|---|---|
| `AgondaError` | `AgentpackError` |
| `readInstallState` reads `agonda.skills.json` | reads `.agentpack/install.json` |
| `writeInstallState` writes `agonda.skills.json` | writes `.agentpack/install.json` |
| `readBuildState` reads `.agonda/build-state.json` | reads `.agentpack/build-state.json` |
| `generateSkillsCatalog` writes `.agonda/skills.catalog.json` | writes `.agentpack/catalog.json` |
| `generateBuildState` writes `.agonda/build-state.json` | writes `.agentpack/build-state.json` |
| all error classes extend `AgondaError` | extend `AgentpackError` |

#### .gitignore

```
# Current
agonda.skills.json

# New
.agentpack/install.json
.agentpack/dist/
```

### Rename Execution Strategy

The rename must be atomic — all 59 tests must pass after the rename, not during.

Recommended order:

1. Rename fixture files first (`.agonda/` → `.agentpack/`, `agonda.skills.json` → `.agentpack/install.json`)
2. Update `src/lib/skills.js` — all path constants and read/write functions
3. Update `src/lib/plugins.js` — any `.agonda/` references
4. Update `src/utils/errors.js` — `AgondaError` → `AgentpackError`
5. Update `src/commands/skills.js` — output strings, references
6. Update `src/commands/plugin.js` — rename `inspect-bundle` → `inspect`, `validate-bundle` → `validate`
7. Update `src/cli.js` — command registration
8. Update all test files — path references, assertions, fixture paths
9. Update `test/integration/fixtures.js` — helper functions
10. Update `.gitignore`, `README.md`, `LIVE-TEST.md`, scripts, docs
11. Run full test suite — all 59 must pass

### Rename Constraints

- No behavior changes during the rename — only names change
- Tests must pass identically before and after (same count, same assertions)
- The rename is one commit — not spread across multiple PRs

---

## Workstream 2: Build Lifecycle

### New Command: `agentpack skills dev <path>`

Purpose: prepare a skill for local testing in Claude Code.

Behavior:

1. Parse `SKILL.md` in the target directory
2. Read `package.json` in the target directory
3. Perform bidirectional dependency sync (the `go mod tidy` model):
   - Add any `requires` entries missing from `package.json.dependencies`
   - Remove any `dependencies` entries no longer in `requires`
   - Preserve version ranges for existing entries
   - Use `"*"` as default range for newly added entries
4. Write updated `package.json` if changed
5. Resolve the skill name from SKILL.md frontmatter
6. Create symlink: `.claude/skills/<skill-name>` → target directory
7. Create symlink: `.agents/skills/<skill-name>` → target directory
8. Report what was linked

Options:

- `--json` — structured output
- `--no-sync` — skip dep sync, just link

Exit codes:

- `0` — linked successfully
- `1` — target not found or SKILL.md invalid
- `2` — validation error

### New Command: `agentpack skills unlink <name>`

Purpose: remove a locally-linked skill.

Behavior:

1. Remove `.claude/skills/<name>` symlink
2. Remove `.agents/skills/<name>` symlink
3. Report what was removed

Exit codes:

- `0` — unlinked successfully
- `1` — skill not found in linked state

### Updated Command: `agentpack skills validate`

Change: validate now performs dependency sync before validating.

New behavior (prepended to existing checks):

1. Parse `SKILL.md` requires
2. Read `package.json.dependencies`
3. Sync: add missing, remove unused (same logic as `skills dev`)
4. Write updated `package.json` if changed
5. Proceed with all existing validation checks

This means the existing check "required skill is not declared in package dependencies" will never fire for `requires` entries — they get synced automatically. It can still fire for body-referenced packages (future enhancement).

### New Command: `agentpack plugin build <path>`

Purpose: produce a self-contained plugin artifact ready for testing and publishing.

Behavior:

1. Resolve plugin directory (must contain `.claude-plugin/plugin.json`)
2. Parse all local skills in `skills/**/SKILL.md`
3. Perform dep sync for each local skill's `package.json` (same logic as `skills dev`)
4. Compute bundle closure (reuse existing `resolveBundleClosure` from plugins.js)
5. Validate bundle (reuse existing `validatePluginBundle` logic)
6. Create output directory: `.agentpack/dist/plugins/<plugin-name>/`
7. Copy all plugin source files to output:
   - `.claude-plugin/`
   - `skills/`
   - `hooks/`
   - `templates/`
   - `package.json`
   - any other runtime files
8. Vendor standalone skill packages into output `skills/` directory:
   - For each resolved standalone skill package, copy `SKILL.md` into `skills/<skill-name>/`
9. Write `.claude-plugin/bundled-skills.json` provenance file in output
10. Report build result

Options:

- `--json` — structured output
- `--clean` — remove output directory before building

Exit codes:

- `0` — build successful
- `1` — build failed (unresolved deps, collisions)
- `2` — invalid plugin structure

Output structure:

```
.agentpack/dist/plugins/<plugin-name>/
├── .claude-plugin/
│   ├── plugin.json
│   └── bundled-skills.json
├── skills/
│   ├── <local-skill>/SKILL.md
│   ├── <vendored-skill>/SKILL.md
│   └── ...
├── hooks/
├── templates/
└── package.json
```

### New Command: `agentpack plugin dev <path>`

Purpose: build + watch for changes, rebuild on source change.

Behavior:

1. Run `agentpack plugin build <path>` initially
2. Watch all source files in the plugin directory for changes
3. On change, rebuild
4. Print the `--plugin-dir` path for the user to pass to Claude

Options:

- `--json` — structured output for initial build
- `--clean` — clean before first build

### Dependency Sync Function (shared)

This is the core `go mod tidy` equivalent, used by `skills dev`, `skills validate`, and `plugin build`.

```
syncSkillDependencies(skillDir):
  1. Parse SKILL.md → get requires[]
  2. Read package.json → get dependencies{}
  3. For each entry in requires:
     - if not in dependencies: add with version range "*"
  4. For each entry in dependencies:
     - if key matches a managed scope (@alavida, @alavida-ai)
       AND key is not in requires: remove it
  5. If dependencies changed: write package.json
  6. Return { added[], removed[], unchanged: boolean }
```

Important constraint on removal: only remove dependencies that match managed scopes (`@alavida/*`, `@alavida-ai/*`). Do not remove unscoped or third-party dependencies that may have been added manually for other purposes.

---

## Implementation Order

### Phase 1: Rename (no new features)

1. Rename all fixtures
2. Rename all source paths/identifiers
3. Rename CLI commands (inspect-bundle → inspect, validate-bundle → validate)
4. Update all tests
5. Update all docs, scripts, config files
6. Verify: all 59 tests pass

### Phase 2: Dependency sync function

1. Implement `syncSkillDependencies()` in `src/lib/skills.js`
2. Write tests for sync: add missing, remove unused, preserve existing ranges
3. Verify: new tests pass, existing tests still pass

### Phase 3: `skills dev` + `skills unlink`

1. Implement `skills dev` command
2. Implement `skills unlink` command
3. Write tests: dev links correctly, unlink removes, dev syncs deps
4. Add fixture for dev/unlink scenarios
5. Verify: all tests pass

### Phase 4: Update `skills validate` with auto-sync

1. Add dep sync call at start of validate
2. Update validate tests to expect synced deps
3. Verify: all tests pass

### Phase 5: `plugin build`

1. Implement `plugin build` command
2. Reuse existing bundle inspection and validation logic
3. Add vendoring/copy logic for standalone skills
4. Write `bundled-skills.json` provenance
5. Write tests: build produces correct output structure, vendoring works
6. Add fixture for build scenarios
7. Verify: all tests pass

### Phase 6: `plugin dev`

1. Implement file watcher using `fs.watch` or `node --watch`
2. Trigger rebuild on change
3. Write basic test for watch trigger
4. Verify: all tests pass

---

## Test Strategy

All new features should follow the existing test pattern:

- Fixture-driven integration tests
- Use `createTempRepo` or `createRepoFromFixture` helpers
- Test both text and JSON output modes
- Test error cases explicitly
- Test exit codes

Expected new test count: ~20-25 new tests across:

- `skills-dev.test.js` (~6 tests)
- `skills-unlink.test.js` (~3 tests)
- `skills-dep-sync.test.js` (~5 tests)
- `plugin-build.test.js` (~6 tests)
- `plugin-dev.test.js` (~2 tests)
- Updated `skills-validate.test.js` (~2-3 new assertions)

---

## Acceptance Criteria

### Rename

- [ ] All references to `.agonda/` replaced with `.agentpack/`
- [ ] `agonda.skills.json` replaced with `.agentpack/install.json`
- [ ] `.agonda/skills.catalog.json` replaced with `.agentpack/catalog.json`
- [ ] `AgondaError` replaced with `AgentpackError`
- [ ] `plugin inspect-bundle` renamed to `plugin inspect`
- [ ] `plugin validate-bundle` renamed to `plugin validate`
- [ ] All 59 existing tests pass with no behavior changes
- [ ] `.gitignore` updated
- [ ] All docs updated
- [ ] Scripts updated

### Skills Dev

- [ ] `agentpack skills dev <path>` syncs deps and links to `.claude/skills/` and `.agents/skills/`
- [ ] Dep sync adds missing requires to package.json
- [ ] Dep sync removes unused managed-scope deps from package.json
- [ ] Dep sync preserves existing version ranges
- [ ] `--json` output works
- [ ] Error handling for missing SKILL.md

### Skills Unlink

- [ ] `agentpack skills unlink <name>` removes symlinks from `.claude/skills/` and `.agents/skills/`
- [ ] Error handling for non-existent link

### Skills Validate (updated)

- [ ] Validate auto-syncs deps before running checks
- [ ] Previously-failing "missing dependency" cases now auto-fix

### Plugin Build

- [ ] `agentpack plugin build <path>` produces output in `.agentpack/dist/plugins/<name>/`
- [ ] Output includes all local plugin files
- [ ] Output includes vendored standalone skill packages
- [ ] `bundled-skills.json` provenance is written
- [ ] Build fails clearly on unresolved deps or collisions
- [ ] `--json` output works

### Plugin Dev

- [ ] `agentpack plugin dev <path>` builds initially and watches for changes
- [ ] Rebuild triggers on source file changes
