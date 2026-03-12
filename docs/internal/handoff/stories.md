# agentpack Product Stories

Status: ready for implementation
Date: 2026-03-10

This document defines every product story for the agentpack rename and build lifecycle workstreams. Each story includes a user persona, desired outcome, acceptance criteria, and concrete test scenarios with exact CLI commands, expected file state, and expected output patterns.

---

## 1. Rename Stories

### RENAME-01: Rename .agonda/ directory to .agentpack/ in authoring repos

**As a** skill author,
**I want** the metadata directory to be named `.agentpack/` instead of `.agonda/`,
**So that** the directory name matches the tool brand.

**Acceptance criteria:**
- All source code references to `.agonda/` are replaced with `.agentpack/`
- `generateSkillsCatalog()` writes to `.agentpack/catalog.json`
- `generateBuildState()` writes to `.agentpack/build-state.json`
- `readBuildState()` reads from `.agentpack/build-state.json`
- No `.agonda/` directory is created or read anywhere in the codebase

**Test scenario:**
```
# Fixture: test/fixtures/monorepo/.agentpack/catalog.json (renamed from .agonda/skills.catalog.json)
# Fixture: test/fixtures/monorepo/.agentpack/build-state.json (renamed from .agonda/build-state.json)

# Verify catalog generation reads from new path
repo = createRepoFromFixture('monorepo')
generated = generateSkillsCatalog({ cwd: repo.root })
expected = readFileSync(join(repo.root, '.agentpack', 'catalog.json'))
assert.deepEqual(generated, expected)

# Verify build-state generation reads from new path
generated = generateBuildState({ cwd: repo.root })
expected = readFileSync(join(repo.root, '.agentpack', 'build-state.json'))
assert.deepEqual(generated, expected)
```

---

### RENAME-02: Rename agonda.skills.json to .agentpack/install.json in consumer repos

**As a** skill consumer,
**I want** the install state file to be at `.agentpack/install.json` instead of `agonda.skills.json`,
**So that** all agentpack state lives under a single dotdir.

**Acceptance criteria:**
- `readInstallState()` reads from `.agentpack/install.json`
- `writeInstallState()` writes to `.agentpack/install.json`
- The `.agentpack/` directory is created automatically if it does not exist
- No `agonda.skills.json` file is created or read anywhere

**Test scenario:**
```
# Fixture: test/fixtures/consumer/.agentpack/install.json (renamed from agonda.skills.json)
# Content: {"version": 1, "installs": {}}

# After install:
agentpack skills install <target>
# Expected: .agentpack/install.json exists with installs populated
# Expected: agonda.skills.json does NOT exist
assert.ok(existsSync(join(consumer.root, '.agentpack', 'install.json')))
assert.equal(existsSync(join(consumer.root, 'agonda.skills.json')), false)
```

---

### RENAME-03: Rename skills.catalog.json to catalog.json

**As a** skill author,
**I want** the catalog file to be named `catalog.json` instead of `skills.catalog.json`,
**So that** the filename is concise and the context is provided by the parent directory.

**Acceptance criteria:**
- `generateSkillsCatalog()` writes to `.agentpack/catalog.json`
- All test assertions reference `.agentpack/catalog.json`
- Fixture file is at `test/fixtures/monorepo/.agentpack/catalog.json`

**Test scenario:**
```
repo = createRepoFromFixture('monorepo')
generated = generateSkillsCatalog({ cwd: repo.root })
expected = JSON.parse(readFileSync(join(repo.root, '.agentpack', 'catalog.json'), 'utf-8'))
assert.deepEqual(generated, expected)
```

---

### RENAME-04: Rename AgondaError to AgentpackError

**As a** developer working on the agentpack codebase,
**I want** the base error class to be named `AgentpackError`,
**So that** error types match the product brand.

**Acceptance criteria:**
- `src/utils/errors.js` exports `AgentpackError` instead of `AgondaError`
- All error subclasses extend `AgentpackError`
- All imports across source and test files reference `AgentpackError`
- Error messages and stack traces show `AgentpackError`

**Test scenario:**
```
# Any CLI command that triggers an error should show AgentpackError in debug output
agentpack skills inspect @alavida/unknown-skill
# Exit code: 4
# stderr contains error messaging (no reference to "Agonda")
```

---

### RENAME-05: Rename plugin inspect-bundle to plugin inspect

**As a** plugin author,
**I want** to run `agentpack plugin inspect` instead of `agentpack plugin inspect-bundle`,
**So that** the command is shorter and more intuitive.

**Acceptance criteria:**
- `agentpack plugin inspect <path>` works and produces the same output as the former `inspect-bundle`
- `agentpack plugin inspect-bundle` is no longer a recognized command
- CLI help text shows `plugin inspect`

**Test scenario:**
```
repo = createPluginBundleFixture()

# New command works:
result = runCLI(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Plugin: website-dev/)
assert.match(result.stdout, /Direct Bundled Packages: 2/)
assert.match(result.stdout, /Transitive Bundled Packages: 1/)

# Old command fails:
result = runCLI(['plugin', 'inspect-bundle', 'plugins/website-dev'], { cwd: repo.root })
assert.notEqual(result.exitCode, 0)
```

---

### RENAME-06: Rename plugin validate-bundle to plugin validate

**As a** plugin author,
**I want** to run `agentpack plugin validate` instead of `agentpack plugin validate-bundle`,
**So that** the command is shorter and more intuitive.

**Acceptance criteria:**
- `agentpack plugin validate <path>` works and produces the same output as the former `validate-bundle`
- `agentpack plugin validate-bundle` is no longer a recognized command
- CLI help text shows `plugin validate`

**Test scenario:**
```
repo = createPluginBundleFixture()

# New command works:
result = runCLI(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Status: valid/)

# Old command fails:
result = runCLI(['plugin', 'validate-bundle', 'plugins/website-dev'], { cwd: repo.root })
assert.notEqual(result.exitCode, 0)
```

---

### RENAME-07: Update .gitignore entries

**As a** developer,
**I want** `.gitignore` to reference the new paths,
**So that** runtime state and build output are not committed.

**Acceptance criteria:**
- `.gitignore` contains `.agentpack/install.json`
- `.gitignore` contains `.agentpack/dist/`
- `.gitignore` does NOT contain `agonda.skills.json`

**Test scenario:**
```
# Manual verification:
cat .gitignore
# Expected: .agentpack/install.json
# Expected: .agentpack/dist/
# NOT expected: agonda.skills.json
```

---

### RENAME-08: Existing install test passes after rename

**As a** CI pipeline,
**I want** the install test to pass after the rename,
**So that** the rename does not break existing install behavior.

**Acceptance criteria:**
- Test "installs one packaged skill plus its dependency and materializes both" passes
- Install state is read from `.agentpack/install.json` (not `agonda.skills.json`)
- Symlinks in `.claude/skills/` and `.agents/skills/` are created as before

**Test scenario:**
```
# File: test/integration/skills-install.test.js
monorepo = createRepoFromFixture('monorepo')
consumer = createRepoFromFixture('consumer')

result = runCLI(['skills', 'install', target], { cwd: consumer.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Installed Skills: 2/)

# State file at new location:
installState = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'))
assert.equal(installState.version, 1)
assert.equal(installState.installs['@alavida/value-copywriting'].direct, true)
```

---

### RENAME-09: Existing uninstall test passes after rename

**As a** CI pipeline,
**I want** the uninstall test to pass after the rename,
**So that** uninstall + reconcile still works correctly.

**Acceptance criteria:**
- Test "removes the direct skill, orphaned dependency, materialized links, and runtime state" passes
- State file is read/written at `.agentpack/install.json`

**Test scenario:**
```
# File: test/integration/skills-uninstall.test.js
# After uninstall:
state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'))
assert.deepEqual(state, { version: 1, installs: {} })
```

---

### RENAME-10: Existing stale detection tests pass after rename

**As a** CI pipeline,
**I want** all 3 stale tests to pass after the rename,
**So that** stale detection still reads `.agentpack/build-state.json`.

**Acceptance criteria:**
- "reports no stale skills when sources match recorded build-state" passes
- "reports stale skills in list mode after a source file changes" passes
- "shows hash details in detail mode" passes
- Build state is read from `.agentpack/build-state.json`

**Test scenario:**
```
# File: test/integration/skills-stale.test.js
# Build state fixture at: test/fixtures/monorepo/.agentpack/build-state.json
repo = createRepoFromFixture('monorepo')
result = runCLI(['skills', 'stale'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Stale Skills: 0/)
```

---

### RENAME-11: Existing validate tests pass after rename

**As a** CI pipeline,
**I want** all 8 validate tests to pass after the rename,
**So that** validation logic is preserved.

**Acceptance criteria:**
- All tests in `skills-validate.test.js` pass unchanged (except path references)
- Tests: valid skill, validate-all, structured release guidance, missing source, missing dependency declaration, missing repository, invalid publish registry, invalid status, invalid replacement

**Test scenario:**
```
# File: test/integration/skills-validate.test.js
# All 8 assertions produce same results as before rename
# Exit codes: 0 for valid, 2 for invalid
```

---

### RENAME-12: Existing authoring metadata tests pass after rename

**As a** CI pipeline,
**I want** both authoring metadata generation tests to pass after the rename,
**So that** catalog and build-state generation work with `.agentpack/`.

**Acceptance criteria:**
- "generates skills catalog deterministically from the fixture monorepo" passes, reading from `.agentpack/catalog.json`
- "generates build-state deterministically from the fixture monorepo" passes, reading from `.agentpack/build-state.json`

**Test scenario:**
```
# File: test/integration/skills-authoring-metadata.test.js
repo = createRepoFromFixture('monorepo')
generated = generateSkillsCatalog({ cwd: repo.root })
expected = JSON.parse(readFileSync(join(repo.root, '.agentpack', 'catalog.json'), 'utf-8'))
assert.deepEqual(generated, expected)
```

---

### RENAME-13: Existing plugin bundle tests pass after rename

**As a** CI pipeline,
**I want** all 4 plugin bundle tests to pass after the rename,
**So that** plugin inspection and validation work with renamed commands.

**Acceptance criteria:**
- "inspects direct and transitive bundled skill packages" passes using `plugin inspect`
- "returns structured bundle inspection data" passes using `plugin inspect`
- "validates a bundleable plugin successfully" passes using `plugin validate`
- "fails when a direct required skill package is not present" passes using `plugin validate`

**Test scenario:**
```
# File: test/integration/plugin-bundle.test.js
result = runCLI(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

result = runCLI(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
```

---

### RENAME-14: Existing environment, inspect, dependencies, missing, outdated, status, registry, JSON, multi-root, workbench-install, and reinstall tests pass after rename

**As a** CI pipeline,
**I want** all remaining test files (17 total, 59 tests) to pass after the rename,
**So that** the rename is confirmed atomic and behavior-preserving.

**Acceptance criteria:**
- `skills-env.test.js` (1 test) passes
- `skills-inspect.test.js` (4 tests) passes
- `skills-dependencies.test.js` (4 tests) passes
- `skills-missing.test.js` (5 tests) passes
- `skills-outdated.test.js` (4 tests) passes
- `skills-status.test.js` (4 tests) passes
- `skills-registry.test.js` (4 tests) passes
- `skills-json.test.js` (3 tests) passes
- `skills-multi-root.test.js` (2 tests) passes
- `skills-install-workbench.test.js` (2 tests) passes
- `skills-reinstall.test.js` (4 tests) passes
- All `agonda.skills.json` references in tests updated to `.agentpack/install.json`
- All `.agonda/` references in tests updated to `.agentpack/`
- All `AGONDA_DISCOVERY_ROOT` env var references updated if applicable
- Total test count: 59 passing, 0 failing

**Test scenario:**
```
node --test test/integration/
# Expected: 59 tests passing
# Expected: 0 tests failing
# Expected: exit code 0
```

---

### RENAME-15: Fixture files renamed on disk

**As a** developer,
**I want** all test fixture files to use the new naming,
**So that** fixtures match the code they test.

**Acceptance criteria:**
- `test/fixtures/monorepo/.agonda/` renamed to `test/fixtures/monorepo/.agentpack/`
- `test/fixtures/monorepo/.agonda/skills.catalog.json` renamed to `test/fixtures/monorepo/.agentpack/catalog.json`
- `test/fixtures/monorepo/.agonda/build-state.json` renamed to `test/fixtures/monorepo/.agentpack/build-state.json`
- `test/fixtures/consumer/agonda.skills.json` renamed to `test/fixtures/consumer/.agentpack/install.json`
- No files with `agonda` in their name remain in `test/fixtures/`

**Test scenario:**
```
# Filesystem verification:
ls test/fixtures/monorepo/.agentpack/catalog.json       # exists
ls test/fixtures/monorepo/.agentpack/build-state.json   # exists
ls test/fixtures/consumer/.agentpack/install.json        # exists
ls test/fixtures/monorepo/.agonda/                       # does NOT exist
ls test/fixtures/consumer/agonda.skills.json             # does NOT exist
```

---

### RENAME-16: Temp repo helper updated

**As a** developer writing tests,
**I want** `createTempRepo` to use `agentpack` instead of `agonda` in temp dir names,
**So that** temp directory naming is consistent with the brand.

**Acceptance criteria:**
- `createTempRepo` creates dirs named `agentpack-<name>-<timestamp>` instead of `agonda-<name>-<timestamp>`
- `createRepoFromFixture` creates dirs named `agentpack-<name>-<timestamp>` instead of `agonda-<name>-<timestamp>`

**Test scenario:**
```
# In fixtures.js:
const root = join(tmpdir(), `agentpack-${name}-${Date.now()}`);
# NOT: `agonda-${name}-${Date.now()}`
```

---

### RENAME-17: Documentation and scripts updated

**As a** developer or user reading docs,
**I want** all documentation to reference the new names,
**So that** docs are consistent with the codebase.

**Acceptance criteria:**
- `README.md` has no references to `.agonda/` or `agonda.skills.json`
- `LIVE-TEST.md` has no references to `.agonda/` or `agonda.skills.json`
- `scripts/live-validation.mjs` uses `.agentpack/` paths
- `scripts/smoke-monorepo.mjs` uses `.agentpack/` paths
- All `docs/*.mdx` files reference new paths

**Test scenario:**
```
grep -r "agonda" README.md LIVE-TEST.md scripts/ docs/
# Expected: no results (zero matches)
```

---

## 2. Dependency Sync Stories

### SYNC-01: Adding a requires entry auto-adds to package.json dependencies

**As a** skill author,
**I want** adding a `requires` entry to SKILL.md to automatically add it to `package.json.dependencies`,
**So that** I never need to manually edit dependencies.

**Acceptance criteria:**
- When SKILL.md contains `requires: ["@alavida/methodology-gary-provost"]` and package.json has no dependencies, running dep sync adds `"@alavida/methodology-gary-provost": "*"` to dependencies
- The `"*"` range is used because no existing version range exists

**Test scenario:**
```
# Setup: SKILL.md with requires: [@alavida/methodology-gary-provost]
# Setup: package.json with dependencies: {}

syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '*')
```

---

### SYNC-02: Removing a requires entry auto-removes from package.json dependencies

**As a** skill author,
**I want** removing a `requires` entry from SKILL.md to automatically remove it from `package.json.dependencies`,
**So that** stale dependencies are cleaned up automatically.

**Acceptance criteria:**
- When SKILL.md has `requires: []` and package.json has `"@alavida/old-dep": "^1.0.0"` in dependencies, running dep sync removes `@alavida/old-dep`
- Only managed-scope packages (`@alavida/*`, `@alavida-ai/*`) are eligible for removal

**Test scenario:**
```
# Setup: SKILL.md with requires: []
# Setup: package.json with dependencies: { "@alavida/old-dep": "^1.0.0" }

result = syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/old-dep'], undefined)
assert.deepEqual(result.removed, ['@alavida/old-dep'])
```

---

### SYNC-03: Preserving existing version ranges when re-syncing

**As a** skill author,
**I want** existing version ranges to be preserved when dep sync runs,
**So that** I don't lose pinned versions I've set intentionally.

**Acceptance criteria:**
- If `requires` contains `@alavida/methodology-gary-provost` and `package.json` already has `"@alavida/methodology-gary-provost": "^1.0.0"`, the version range stays `"^1.0.0"`
- Sync reports `unchanged: true` when no changes are needed

**Test scenario:**
```
# Setup: SKILL.md with requires: [@alavida/methodology-gary-provost]
# Setup: package.json with dependencies: { "@alavida/methodology-gary-provost": "^1.0.0" }

result = syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '^1.0.0')
assert.deepEqual(result.added, [])
assert.deepEqual(result.removed, [])
```

---

### SYNC-04: Only removing managed-scope dependencies

**As a** skill author,
**I want** dep sync to only remove `@alavida/*` and `@alavida-ai/*` dependencies,
**So that** third-party packages I added manually are not touched.

**Acceptance criteria:**
- Unscoped packages (e.g., `lodash`) are never removed by sync
- Packages under non-managed scopes (e.g., `@other-org/util`) are never removed
- Only `@alavida/*` and `@alavida-ai/*` packages not in `requires` are removed

**Test scenario:**
```
# Setup: SKILL.md with requires: []
# Setup: package.json with dependencies:
#   { "@alavida/old-dep": "^1.0.0", "lodash": "^4.0.0", "@other-org/util": "^2.0.0" }

result = syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/old-dep'], undefined)  # removed
assert.equal(pkg.dependencies['lodash'], '^4.0.0')             # preserved
assert.equal(pkg.dependencies['@other-org/util'], '^2.0.0')    # preserved
assert.deepEqual(result.removed, ['@alavida/old-dep'])
```

---

### SYNC-05: Handling empty requires removes all managed deps

**As a** skill author,
**I want** setting `requires: []` to remove all managed-scope dependencies,
**So that** a skill with no dependencies has a clean package.json.

**Acceptance criteria:**
- When `requires` is an empty array, all `@alavida/*` and `@alavida-ai/*` entries are removed from dependencies
- The `dependencies` key remains in package.json (as an empty object or with non-managed entries)

**Test scenario:**
```
# Setup: SKILL.md with requires: []
# Setup: package.json with dependencies:
#   { "@alavida/dep-a": "^1.0.0", "@alavida-ai/dep-b": "^2.0.0" }

syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.deepEqual(pkg.dependencies, {})
```

---

### SYNC-06: Handling requires with packages not yet published uses "*" range

**As a** skill author,
**I want** newly-added requires entries to get `"*"` as the version range,
**So that** I can declare dependencies before they are published.

**Acceptance criteria:**
- A requires entry that is not in package.json.dependencies gets added with `"*"`
- Existing entries with version ranges are not modified

**Test scenario:**
```
# Setup: SKILL.md with requires:
#   [@alavida/existing-dep, @alavida/new-dep]
# Setup: package.json with dependencies:
#   { "@alavida/existing-dep": "^1.0.0" }

result = syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/existing-dep'], '^1.0.0')
assert.equal(pkg.dependencies['@alavida/new-dep'], '*')
assert.deepEqual(result.added, ['@alavida/new-dep'])
```

---

### SYNC-07: Sync is idempotent

**As a** skill author,
**I want** running dep sync multiple times to produce the same result,
**So that** repeated dev or validate runs don't cause drift.

**Acceptance criteria:**
- Running `syncSkillDependencies` twice produces the same package.json content
- The second run reports no changes

**Test scenario:**
```
syncSkillDependencies(skillDir)
const first = readFileSync(join(skillDir, 'package.json'), 'utf-8')

syncSkillDependencies(skillDir)
const second = readFileSync(join(skillDir, 'package.json'), 'utf-8')

assert.equal(first, second)
```

---

### SYNC-08: Sync handles @alavida-ai scoped packages

**As a** skill author in the @alavida-ai org,
**I want** dep sync to correctly manage `@alavida-ai/*` packages,
**So that** the sync works for both org scopes.

**Acceptance criteria:**
- `@alavida-ai/*` requires entries are added to dependencies when missing
- `@alavida-ai/*` dependencies are removed when not in requires
- The scope detection covers both `@alavida/*` and `@alavida-ai/*`

**Test scenario:**
```
# Setup: SKILL.md with requires: [@alavida-ai/value-proof-points]
# Setup: package.json with dependencies:
#   { "@alavida-ai/old-skill": "^1.0.0" }

syncSkillDependencies(skillDir)

pkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida-ai/value-proof-points'], '*')
assert.equal(pkg.dependencies['@alavida-ai/old-skill'], undefined)
```

---

## 3. Skills Dev Stories

### DEV-01: Basic dev link creates symlinks to .claude/skills/ and .agents/skills/

**As a** skill author,
**I want** `agentpack skills dev <path>` to symlink my skill into `.claude/skills/` and `.agents/skills/`,
**So that** Claude Code discovers and uses my skill locally.

**Acceptance criteria:**
- `.claude/skills/<skill-name>` is a symlink pointing to the target directory
- `.agents/skills/<skill-name>` is a symlink pointing to the target directory
- The skill name is taken from SKILL.md frontmatter `name` field
- Exit code is 0
- Stdout reports the skill was linked

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

result = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })

assert.equal(result.exitCode, 0)
assert.match(result.stdout, /value-copywriting/)
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')))
assert.ok(existsSync(join(repo.root, '.agents', 'skills', 'value-copywriting')))
assert.ok(lstatSync(join(repo.root, '.claude', 'skills', 'value-copywriting')).isSymbolicLink())
assert.ok(lstatSync(join(repo.root, '.agents', 'skills', 'value-copywriting')).isSymbolicLink())
```

---

### DEV-02: Dev syncs deps before linking

**As a** skill author,
**I want** `skills dev` to automatically sync requires into package.json.dependencies before linking,
**So that** my skill is ready to publish after testing.

**Acceptance criteria:**
- `skills dev` adds missing requires to package.json.dependencies
- `skills dev` removes stale managed-scope dependencies
- package.json is written before the symlink is created
- Exit code is 0

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/methodology-gary-provost\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'], dependencies: {} }
})

result = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

pkg = JSON.parse(readFileSync(join(repo.root, 'skills/copywriting/package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '*')
```

---

### DEV-03: Dev with requires that need syncing (add + remove)

**As a** skill author,
**I want** `skills dev` to both add new requires and remove stale deps in one pass,
**So that** package.json always mirrors SKILL.md.requires exactly.

**Acceptance criteria:**
- New requires entries are added with `"*"` range
- Stale managed-scope entries are removed
- Third-party entries are preserved

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/new-dep\n---\n# Copy\n',
  packageJson: {
    name: '@alavida/value-copywriting',
    version: '1.0.0',
    files: ['SKILL.md'],
    dependencies: {
      '@alavida/old-dep': '^1.0.0',
      'lodash': '^4.0.0'
    }
  }
})

result = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

pkg = JSON.parse(readFileSync(join(repo.root, 'skills/copywriting/package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/new-dep'], '*')
assert.equal(pkg.dependencies['@alavida/old-dep'], undefined)
assert.equal(pkg.dependencies['lodash'], '^4.0.0')
```

---

### DEV-04: Dev on a skill with no requires

**As a** skill author,
**I want** `skills dev` to work on a skill with `requires: []`,
**So that** simple skills can be linked without issues.

**Acceptance criteria:**
- No errors when requires is empty
- Symlinks are created
- package.json dependencies are cleaned of any stale managed-scope entries

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/simple', {
  skillMd: '---\nname: simple-skill\ndescription: Simple.\nrequires: []\n---\n# Simple\n',
  packageJson: { name: '@alavida/simple-skill', version: '1.0.0', files: ['SKILL.md'] }
})

result = runCLI(['skills', 'dev', 'skills/simple'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'simple-skill')))
```

---

### DEV-05: Dev when .claude/skills/ doesn't exist yet

**As a** skill author working in a fresh repo,
**I want** `skills dev` to create `.claude/skills/` and `.agents/skills/` if they don't exist,
**So that** I don't need to create directories manually.

**Acceptance criteria:**
- `.claude/skills/` directory is created if missing
- `.agents/skills/` directory is created if missing
- Symlinks are created inside the newly-created directories

**Test scenario:**
```
repo = createTempRepo()
# .claude/skills/ does NOT exist yet
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

assert.equal(existsSync(join(repo.root, '.claude', 'skills')), false)

result = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')))
assert.ok(existsSync(join(repo.root, '.agents', 'skills', 'value-copywriting')))
```

---

### DEV-06: Dev when skill is already linked (re-links/updates)

**As a** skill author,
**I want** running `skills dev` again to update the existing symlink,
**So that** I can re-link after moving a skill directory.

**Acceptance criteria:**
- Running `skills dev` twice succeeds both times
- The symlink after the second run points to the correct target
- Exit code is 0 both times

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

first = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(first.exitCode, 0)

second = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(second.exitCode, 0)
assert.ok(lstatSync(join(repo.root, '.claude', 'skills', 'value-copywriting')).isSymbolicLink())
```

---

### DEV-07: Dev with --json output

**As an** agent or CI pipeline,
**I want** `skills dev --json` to return structured output,
**So that** I can parse the result programmatically.

**Acceptance criteria:**
- `--json` flag produces valid JSON on stdout
- JSON includes: `name`, `path`, `linked` (boolean), `synced` (object with added/removed)
- Exit code is 0

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/methodology-gary-provost\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'], dependencies: {} }
})

result = runCLIJson(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.name, 'value-copywriting')
assert.equal(result.json.linked, true)
assert.ok(Array.isArray(result.json.synced.added))
assert.ok(result.json.synced.added.includes('@alavida/methodology-gary-provost'))
```

---

### DEV-08: Dev with invalid SKILL.md (error case)

**As a** skill author,
**I want** `skills dev` to fail clearly when SKILL.md is invalid,
**So that** I know to fix the file.

**Acceptance criteria:**
- Exit code is 1
- stderr contains a meaningful error message
- No symlinks are created
- No package.json modifications are made

**Test scenario:**
```
repo = createTempRepo()
mkdirSync(join(repo.root, 'skills', 'broken'), { recursive: true })
writeFileSync(join(repo.root, 'skills', 'broken', 'SKILL.md'), '# No frontmatter\n')
writeFileSync(join(repo.root, 'skills', 'broken', 'package.json'), '{"name":"test","version":"1.0.0"}\n')

result = runCLI(['skills', 'dev', 'skills/broken'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr, /error/i)
assert.equal(existsSync(join(repo.root, '.claude', 'skills')), false)
```

---

### DEV-09: Dev with missing SKILL.md (error case)

**As a** skill author,
**I want** `skills dev` to fail clearly when the target directory has no SKILL.md,
**So that** I know the path is wrong.

**Acceptance criteria:**
- Exit code is 1
- stderr indicates the SKILL.md was not found
- No symlinks are created

**Test scenario:**
```
repo = createTempRepo()
mkdirSync(join(repo.root, 'skills', 'empty'), { recursive: true })

result = runCLI(['skills', 'dev', 'skills/empty'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr, /SKILL\.md|not found/i)
```

---

### DEV-10: Dev with missing package.json (error case)

**As a** skill author,
**I want** `skills dev` to fail clearly when the target directory has no package.json,
**So that** I know to create the package manifest.

**Acceptance criteria:**
- Exit code is 1
- stderr indicates package.json was not found
- No symlinks are created

**Test scenario:**
```
repo = createTempRepo()
mkdirSync(join(repo.root, 'skills', 'no-pkg'), { recursive: true })
writeFileSync(join(repo.root, 'skills', 'no-pkg', 'SKILL.md'),
  '---\nname: test\ndescription: Test.\nrequires: []\n---\n# Test\n')

result = runCLI(['skills', 'dev', 'skills/no-pkg'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr, /package\.json|not found/i)
```

---

### DEV-11: Dev with --no-sync skips dependency sync

**As a** skill author,
**I want** `skills dev --no-sync` to skip the dependency sync step,
**So that** I can link quickly without modifying package.json.

**Acceptance criteria:**
- `--no-sync` flag is accepted
- package.json is not modified
- Symlinks are still created
- Exit code is 0

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/new-dep\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'], dependencies: {} }
})

result = runCLI(['skills', 'dev', '--no-sync', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

pkg = JSON.parse(readFileSync(join(repo.root, 'skills/copywriting/package.json'), 'utf-8'))
assert.deepEqual(pkg.dependencies, {})  # NOT modified
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')))
```

---

## 4. Skills Unlink Stories

### UNLINK-01: Basic unlink removes symlinks

**As a** skill author,
**I want** `agentpack skills unlink <name>` to remove the dev symlinks,
**So that** Claude Code no longer sees the skill.

**Acceptance criteria:**
- `.claude/skills/<name>` symlink is removed
- `.agents/skills/<name>` symlink is removed
- Exit code is 0
- Stdout reports what was removed

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')))

result = runCLI(['skills', 'unlink', 'value-copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /value-copywriting/)
assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')), false)
assert.equal(existsSync(join(repo.root, '.agents', 'skills', 'value-copywriting')), false)
```

---

### UNLINK-02: Unlink when skill is not linked (error case)

**As a** skill author,
**I want** `skills unlink` to fail clearly when the skill is not linked,
**So that** I know the name was wrong.

**Acceptance criteria:**
- Exit code is 1
- stderr indicates the skill was not found in linked state

**Test scenario:**
```
repo = createTempRepo()

result = runCLI(['skills', 'unlink', 'nonexistent-skill'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr, /not found|not linked/i)
```

---

### UNLINK-03: Unlink with --json output

**As an** agent or CI pipeline,
**I want** `skills unlink --json` to return structured output,
**So that** I can parse the result programmatically.

**Acceptance criteria:**
- `--json` produces valid JSON
- JSON includes: `name`, `unlinked` (boolean)

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })

result = runCLIJson(['skills', 'unlink', 'value-copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.name, 'value-copywriting')
assert.equal(result.json.unlinked, true)
```

---

### UNLINK-04: Unlink leaves other linked skills intact

**As a** skill author with multiple skills linked,
**I want** unlinking one skill to leave others untouched,
**So that** unlink is surgically targeted.

**Acceptance criteria:**
- Only the named skill's symlinks are removed
- Other linked skills remain functional

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})
addPackagedSkill(repo.root, 'skills/research', {
  skillMd: '---\nname: value-research\ndescription: Research.\nrequires: []\n---\n# Research\n',
  packageJson: { name: '@alavida/value-research', version: '1.0.0', files: ['SKILL.md'] }
})

runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
runCLI(['skills', 'dev', 'skills/research'], { cwd: repo.root })

result = runCLI(['skills', 'unlink', 'value-copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

assert.equal(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')), false)
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-research')))
assert.ok(existsSync(join(repo.root, '.agents', 'skills', 'value-research')))
```

---

## 5. Validate Update Stories

### VAL-01: Validate auto-syncs deps before checking

**As a** skill author,
**I want** `agentpack skills validate` to automatically sync dependencies before running validation checks,
**So that** I can go straight from authoring to publishing.

**Acceptance criteria:**
- Validate calls `syncSkillDependencies` before running existing checks
- package.json is updated before validation assertions run
- Exit code reflects validation result, not sync result

**Test scenario:**
```
repo = createValidateFixture()

# Deliberately remove a dependency from package.json that is in requires
writeFileSync(join(repo.root, 'domains/value/skills/copywriting/package.json'),
  JSON.stringify({
    name: '@alavida/value-copywriting', version: '1.2.0',
    repository: { type: 'git', url: 'git+https://github.com/alavida/knowledge-base.git' },
    publishConfig: { registry: 'https://npm.pkg.github.com' },
    files: ['SKILL.md'],
    dependencies: {}
  }, null, 2) + '\n'
)

# Validate should auto-sync and pass (not fail with missing_dependency_declaration)
result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Status: valid/)

# Verify package.json was updated
pkg = JSON.parse(readFileSync(join(repo.root, 'domains/value/skills/copywriting/package.json'), 'utf-8'))
assert.equal(pkg.dependencies['@alavida/methodology-gary-provost'], '*')
```

---

### VAL-02: Previously-failing missing-dep case now auto-fixes

**As a** skill author,
**I want** the "requires not compiled into package dependencies" error to be auto-fixed by dep sync,
**So that** I never see this error again.

**Acceptance criteria:**
- The scenario that previously triggered `missing_dependency_declaration` now passes validation
- The dependency is automatically added to package.json.dependencies
- Validation reports `valid: true` and `Issues: 0`

**Test scenario:**
```
repo = createValidateFixture()

# Same setup as the old failing test:
writeFileSync(join(repo.root, 'domains/value/skills/copywriting/package.json'),
  JSON.stringify({
    name: '@alavida/value-copywriting', version: '1.2.0',
    repository: { type: 'git', url: 'git+https://github.com/alavida/knowledge-base.git' },
    publishConfig: { registry: 'https://npm.pkg.github.com' },
    files: ['SKILL.md'],
    dependencies: {}
  }, null, 2) + '\n'
)

result = runCLIJson(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })

# This USED TO fail with exitCode 2 and missing_dependency_declaration
# Now it should pass:
assert.equal(result.exitCode, 0)
assert.equal(result.json.valid, true)
assert.equal(result.json.issues.length, 0)
```

---

### VAL-03: Validate still catches real structural issues

**As a** skill author,
**I want** validate to still catch structural issues that dep sync cannot fix,
**So that** real problems are not masked.

**Acceptance criteria:**
- `missing_source` is still caught (source file doesn't exist on disk)
- `missing_repository` is still caught
- `invalid_publish_registry` is still caught
- `invalid_skill_status` is still caught
- `invalid_replacement` is still caught

**Test scenario:**
```
# Missing source file:
repo = createValidateFixture()
rmSync(join(repo.root, 'domains/value/knowledge/selling-points.md'))
result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 2)
assert.match(result.stdout, /missing_source/)

# Missing repository:
# (same pattern as existing test, unchanged behavior)
```

---

### VAL-04: Validate + publish flow works end-to-end

**As a** skill author,
**I want** to validate and then publish in one flow,
**So that** the CLI guides me from validation to release.

**Acceptance criteria:**
- Validate outputs `npm version patch` and `npm publish` as next steps
- The registry URL is included in next steps
- Exit code is 0 for valid skills

**Test scenario:**
```
repo = createValidateFixture()

result = runCLI(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Status: valid/)
assert.match(result.stdout, /npm version patch/)
assert.match(result.stdout, /npm publish/)
assert.match(result.stdout, /https:\/\/npm\.pkg\.github\.com/)
```

---

### VAL-05: Validate all authored skills with auto-sync

**As a** skill author with multiple skills,
**I want** `agentpack skills validate` (no path) to auto-sync and validate all authored skills,
**So that** I can check everything before a release.

**Acceptance criteria:**
- All authored skills have deps synced
- All authored skills are validated
- Summary reports total validated, valid, and invalid counts

**Test scenario:**
```
repo = createRepoFromFixture('monorepo')

result = runCLI(['skills', 'validate'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /Validated Skills: 3/)
assert.match(result.stdout, /Valid Skills: 3/)
assert.match(result.stdout, /Invalid Skills: 0/)
```

---

## 6. Plugin Build Stories

### BUILD-01: Basic build produces .agentpack/dist/plugins/<name>/

**As a** plugin author,
**I want** `agentpack plugin build <path>` to produce a build artifact in `.agentpack/dist/plugins/<name>/`,
**So that** I have a self-contained plugin ready for testing and publishing.

**Acceptance criteria:**
- Output directory is `.agentpack/dist/plugins/<plugin-name>/`
- `.claude-plugin/plugin.json` is copied to output
- `skills/` directory is copied to output
- `package.json` is copied to output
- Exit code is 0
- Stdout reports the build result

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')))
assert.ok(existsSync(join(outDir, 'skills', 'proof-points', 'SKILL.md')))
assert.ok(existsSync(join(outDir, 'skills', 'copywriting', 'SKILL.md')))
assert.ok(existsSync(join(outDir, 'package.json')))
```

---

### BUILD-02: Build vendors direct standalone skill packages

**As a** plugin author,
**I want** standalone skill packages referenced by my local skills' requires to be vendored into the build output,
**So that** the plugin is self-contained.

**Acceptance criteria:**
- Each direct standalone skill dependency has its SKILL.md copied into `skills/<skill-name>/`
- The vendored skill name comes from the skill's frontmatter name field

**Test scenario:**
```
repo = createPluginBundleFixture()
# Local skills require: @alavida-ai/value-proof-points, @alavida-ai/value-copywriting
# These are standalone packages in packages/skills/

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(join(outDir, 'skills', 'value-proof-points', 'SKILL.md')))
assert.ok(existsSync(join(outDir, 'skills', 'value-copywriting', 'SKILL.md')))
```

---

### BUILD-03: Build vendors transitive standalone skill packages

**As a** plugin author,
**I want** transitive skill dependencies to also be vendored into the build output,
**So that** the full dependency closure is included.

**Acceptance criteria:**
- Transitive dependencies (dependencies of dependencies) are vendored
- In the fixture, `@alavida-ai/methodology-gary-provost` is a transitive dependency (required by both value-proof-points and value-copywriting)
- It appears once in the output (deduplicated)

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(join(outDir, 'skills', 'methodology-gary-provost', 'SKILL.md')))
```

---

### BUILD-04: Build writes bundled-skills.json provenance

**As a** plugin author,
**I want** the build to write a `bundled-skills.json` provenance file,
**So that** consumers can see what skills are included and where they came from.

**Acceptance criteria:**
- `.claude-plugin/bundled-skills.json` is written in the output directory
- It lists all vendored skill packages with their versions and sources
- Both direct and transitive packages are listed

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
bundled = JSON.parse(readFileSync(join(outDir, '.claude-plugin', 'bundled-skills.json'), 'utf-8'))

# Should list vendored packages
packageNames = Object.keys(bundled.packages || bundled)
assert.ok(packageNames.includes('@alavida-ai/value-proof-points') || packageNames.some(k => k.includes('value-proof-points')))
assert.ok(packageNames.includes('@alavida-ai/methodology-gary-provost') || packageNames.some(k => k.includes('methodology-gary-provost')))
```

---

### BUILD-05: Build copies all local plugin files

**As a** plugin author,
**I want** the build to copy all local plugin files (skills, hooks, templates, .claude-plugin/) to the output,
**So that** the output is a complete representation of the plugin.

**Acceptance criteria:**
- `.claude-plugin/` directory contents are copied
- `skills/` directory contents are copied (local skills)
- `hooks/` directory contents are copied (if present)
- `templates/` directory contents are copied (if present)
- `package.json` is copied

**Test scenario:**
```
repo = createPluginBundleFixture()
# Add hooks and templates directories
mkdirSync(join(repo.root, 'plugins', 'website-dev', 'hooks'), { recursive: true })
mkdirSync(join(repo.root, 'plugins', 'website-dev', 'templates'), { recursive: true })
writeFileSync(join(repo.root, 'plugins', 'website-dev', 'hooks', 'init.js'), 'module.exports = {}')
writeFileSync(join(repo.root, 'plugins', 'website-dev', 'templates', 'page.md'), '# Page\n')

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')))
assert.ok(existsSync(join(outDir, 'hooks', 'init.js')))
assert.ok(existsSync(join(outDir, 'templates', 'page.md')))
assert.ok(existsSync(join(outDir, 'package.json')))
```

---

### BUILD-06: Build fails on unresolved dependencies

**As a** plugin author,
**I want** the build to fail clearly when a required standalone skill package cannot be found,
**So that** I know to fix the dependency before shipping.

**Acceptance criteria:**
- Exit code is 1
- stderr or stdout contains the name of the unresolved package
- No partial output is written

**Test scenario:**
```
repo = createPluginBundleFixture()

# Remove a standalone skill that is required
rmSync(join(repo.root, 'packages', 'skills', 'value-proof-points'), { recursive: true })

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr + result.stdout, /value-proof-points|unresolved/i)
```

---

### BUILD-07: Build fails on skill name collisions

**As a** plugin author,
**I want** the build to fail when two skills have the same name,
**So that** skill name collisions are caught before publishing.

**Acceptance criteria:**
- Exit code is 1
- Error message identifies the colliding skill name
- Build does not produce output

**Test scenario:**
```
repo = createPluginBundleFixture()

# Create a local skill with same name as a vendored skill
mkdirSync(join(repo.root, 'plugins', 'website-dev', 'skills', 'methodology-gary-provost'), { recursive: true })
writeFileSync(
  join(repo.root, 'plugins', 'website-dev', 'skills', 'methodology-gary-provost', 'SKILL.md'),
  '---\nname: methodology-gary-provost\ndescription: Duplicate.\nrequires: []\n---\n# Duplicate\n'
)

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 1)
assert.match(result.stderr + result.stdout, /collision|duplicate|methodology-gary-provost/i)
```

---

### BUILD-08: Build with --clean removes previous output first

**As a** plugin author,
**I want** `plugin build --clean` to remove the previous build output before building,
**So that** stale files from previous builds don't contaminate the new build.

**Acceptance criteria:**
- `--clean` flag is accepted
- Previous output directory is deleted before build
- Build produces fresh output
- Exit code is 0

**Test scenario:**
```
repo = createPluginBundleFixture()

# First build
runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
# Add a stale file
writeFileSync(join(outDir, 'stale-file.txt'), 'stale')
assert.ok(existsSync(join(outDir, 'stale-file.txt')))

# Clean build
result = runCLI(['plugin', 'build', '--clean', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

# Stale file should be gone
assert.equal(existsSync(join(outDir, 'stale-file.txt')), false)
# Fresh output should exist
assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')))
```

---

### BUILD-09: Build with --json output

**As an** agent or CI pipeline,
**I want** `plugin build --json` to return structured output,
**So that** I can parse the build result programmatically.

**Acceptance criteria:**
- `--json` flag produces valid JSON on stdout
- JSON includes: `pluginName`, `outputPath`, `localSkills`, `vendoredSkills`, `success`
- Exit code is 0

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLIJson(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.pluginName, 'website-dev')
assert.ok(result.json.outputPath.includes('.agentpack/dist/plugins/website-dev'))
assert.equal(result.json.success, true)
assert.ok(Array.isArray(result.json.localSkills))
assert.ok(Array.isArray(result.json.vendoredSkills))
```

---

### BUILD-10: Build output is usable with claude --plugin-dir

**As a** plugin author,
**I want** the build output to work with `claude --plugin-dir`,
**So that** I can test the exact artifact Claude consumers will see.

**Acceptance criteria:**
- The output directory structure matches what Claude expects:
  - `.claude-plugin/plugin.json` exists
  - `skills/` contains all skills
- The output path can be passed directly to `claude --plugin-dir`

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')

# Verify structure matches Claude's expectations
pluginJson = JSON.parse(readFileSync(join(outDir, '.claude-plugin', 'plugin.json'), 'utf-8'))
assert.equal(pluginJson.name, 'website-dev')

# All skills are present (local + vendored)
skillDirs = readdirSync(join(outDir, 'skills'))
assert.ok(skillDirs.includes('proof-points'))
assert.ok(skillDirs.includes('copywriting'))
assert.ok(skillDirs.includes('value-proof-points'))
assert.ok(skillDirs.includes('value-copywriting'))
assert.ok(skillDirs.includes('methodology-gary-provost'))
```

---

### BUILD-11: Build syncs deps for all local skills before bundling

**As a** plugin author,
**I want** `plugin build` to sync dependencies for all local skills before computing the bundle closure,
**So that** the build always uses up-to-date dependency information.

**Acceptance criteria:**
- Each local skill's package.json.dependencies is synced from its SKILL.md.requires
- The sync happens before bundle closure resolution
- Newly-synced dependencies are included in the closure

**Test scenario:**
```
repo = createPluginBundleFixture()

# Remove a dependency from a local skill's package.json that is in requires
localPkg = join(repo.root, 'plugins', 'website-dev', 'skills', 'proof-points', 'package.json')
# (if the local skills had package.json files, verify they get synced)
# The build should still resolve the full closure correctly

result = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
```

---

### BUILD-12: Build fails on invalid plugin structure (no .claude-plugin/plugin.json)

**As a** plugin author,
**I want** the build to fail clearly when the target is not a valid plugin directory,
**So that** I know to create the required plugin.json.

**Acceptance criteria:**
- Exit code is 2
- Error message indicates missing `.claude-plugin/plugin.json`

**Test scenario:**
```
repo = createTempRepo()
mkdirSync(join(repo.root, 'plugins', 'bad'), { recursive: true })
writeFileSync(join(repo.root, 'plugins', 'bad', 'package.json'), '{"name":"bad"}\n')

result = runCLI(['plugin', 'build', 'plugins/bad'], { cwd: repo.root })
assert.equal(result.exitCode, 2)
assert.match(result.stderr + result.stdout, /plugin\.json|invalid plugin/i)
```

---

## 7. Plugin Dev Stories

### WATCH-01: Initial build on plugin dev start

**As a** plugin author,
**I want** `agentpack plugin dev <path>` to perform an initial build,
**So that** the output is ready before I start editing.

**Acceptance criteria:**
- Running `plugin dev` produces the same output as `plugin build`
- The output path is printed so I can pass it to `claude --plugin-dir`
- Exit code is 0 (for the initial build)

**Test scenario:**
```
repo = createPluginBundleFixture()

# plugin dev will run, build, and then start watching
# For testing, we need to kill the process after verifying the initial build
result = runCLI(['plugin', 'dev', 'plugins/website-dev'], { cwd: repo.root, timeout: 5000 })

# Should print the output path
assert.match(result.stdout, /\.agentpack\/dist\/plugins\/website-dev/)
assert.match(result.stdout, /--plugin-dir/)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')))
```

---

### WATCH-02: Rebuild triggers on SKILL.md change

**As a** plugin author,
**I want** editing a SKILL.md to trigger a rebuild,
**So that** I see my changes in Claude Code without restarting.

**Acceptance criteria:**
- Modifying a SKILL.md file triggers a rebuild
- The rebuilt output reflects the change
- A rebuild message is printed to stdout

**Test scenario:**
```
# This test requires async/process management:
# 1. Start `plugin dev` in background
# 2. Wait for initial build
# 3. Modify a SKILL.md
# 4. Wait for rebuild message
# 5. Verify output is updated
# 6. Kill the process
```

---

### WATCH-03: Rebuild triggers on hook/template change

**As a** plugin author,
**I want** editing hooks or templates to trigger a rebuild,
**So that** all source changes are picked up.

**Acceptance criteria:**
- Modifying a file in `hooks/` triggers a rebuild
- Modifying a file in `templates/` triggers a rebuild
- The rebuilt output reflects the change

**Test scenario:**
```
# Same async pattern as WATCH-02
# 1. Start `plugin dev`
# 2. Modify a hook file
# 3. Verify rebuild occurs
```

---

### WATCH-04: Output path printed for --plugin-dir usage

**As a** plugin author,
**I want** `plugin dev` to print the `--plugin-dir` path,
**So that** I can copy-paste it into my Claude command.

**Acceptance criteria:**
- The initial output includes the full path suitable for `claude --plugin-dir`
- The path is the build output directory

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLI(['plugin', 'dev', 'plugins/website-dev'], { cwd: repo.root, timeout: 5000 })
assert.match(result.stdout, /--plugin-dir/)
assert.match(result.stdout, /\.agentpack\/dist\/plugins\/website-dev/)
```

---

## 8. End-to-End Stories

### E2E-01: Full skill lifecycle (author, dev, validate, publish, install, discover)

**As a** skill author,
**I want** to take a skill through its full lifecycle,
**So that** the toolchain supports the complete authoring-to-consumption flow.

**Acceptance criteria:**
- Author: create SKILL.md + package.json
- Dev: `agentpack skills dev` syncs deps and creates symlinks
- Validate: `agentpack skills validate` passes
- Install: `agentpack skills install` installs and materializes in consumer repo
- Discover: skill appears in `.claude/skills/` in consumer repo

**Test scenario:**
```
# 1. Author
author = createTempRepo()
addPackagedSkill(author.root, 'skills/my-skill', {
  skillMd: '---\nname: my-skill\ndescription: Test.\nmetadata:\n  sources: []\nrequires: []\n---\n# My Skill\n',
  packageJson: {
    name: '@alavida/my-skill', version: '1.0.0',
    repository: { type: 'git', url: 'git+https://github.com/alavida/knowledge-base.git' },
    publishConfig: { registry: 'https://npm.pkg.github.com' },
    files: ['SKILL.md']
  }
})

# 2. Dev
devResult = runCLI(['skills', 'dev', 'skills/my-skill'], { cwd: author.root })
assert.equal(devResult.exitCode, 0)
assert.ok(existsSync(join(author.root, '.claude', 'skills', 'my-skill')))

# 3. Validate
valResult = runCLI(['skills', 'validate', 'skills/my-skill'], { cwd: author.root })
assert.equal(valResult.exitCode, 0)
assert.match(valResult.stdout, /Status: valid/)

# 4. Install (using local path as proxy for published package)
consumer = createRepoFromFixture('consumer')
installResult = runCLI(['skills', 'install', join(author.root, 'skills/my-skill')], { cwd: consumer.root })
assert.equal(installResult.exitCode, 0)

# 5. Discover
assert.ok(existsSync(join(consumer.root, '.claude', 'skills', 'my-skill')))
assert.ok(existsSync(join(consumer.root, '.agents', 'skills', 'my-skill')))
```

---

### E2E-02: Full plugin lifecycle (author, build, test with --plugin-dir, validate, publish)

**As a** plugin author,
**I want** to take a plugin through its full lifecycle,
**So that** the toolchain supports the complete plugin authoring flow.

**Acceptance criteria:**
- Author: create plugin structure with .claude-plugin/, skills/, package.json
- Build: `agentpack plugin build` produces artifact
- Test: output is usable with `claude --plugin-dir`
- Validate: `agentpack plugin validate` passes

**Test scenario:**
```
repo = createPluginBundleFixture()

# 1. Build
buildResult = runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(buildResult.exitCode, 0)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(outDir))

# 2. Validate (on source, pre-build)
valResult = runCLI(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(valResult.exitCode, 0)
assert.match(valResult.stdout, /Status: valid/)

# 3. Verify output structure
assert.ok(existsSync(join(outDir, '.claude-plugin', 'plugin.json')))
assert.ok(existsSync(join(outDir, '.claude-plugin', 'bundled-skills.json')))
assert.ok(existsSync(join(outDir, 'skills', 'proof-points', 'SKILL.md')))
assert.ok(existsSync(join(outDir, 'skills', 'methodology-gary-provost', 'SKILL.md')))
```

---

### E2E-03: Consumer installs skill, it appears in .claude/skills/

**As a** skill consumer,
**I want** `agentpack skills install` to make the skill discoverable by Claude,
**So that** the agent can use it immediately after install.

**Acceptance criteria:**
- Skill is installed into node_modules
- Skill is materialized (symlinked) into `.claude/skills/<skill-name>`
- Skill is materialized into `.agents/skills/<skill-name>`
- Install state is written to `.agentpack/install.json`

**Test scenario:**
```
monorepo = createRepoFromFixture('monorepo')
consumer = createRepoFromFixture('consumer')

target = join(monorepo.root, 'domains/value/skills/copywriting')
result = runCLI(['skills', 'install', target], { cwd: consumer.root })

assert.equal(result.exitCode, 0)
assert.ok(existsSync(join(consumer.root, '.claude', 'skills', 'value-copywriting')))
assert.ok(existsSync(join(consumer.root, '.agents', 'skills', 'value-copywriting')))
assert.ok(lstatSync(join(consumer.root, '.claude', 'skills', 'value-copywriting')).isSymbolicLink())

state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'))
assert.ok(state.installs['@alavida/value-copywriting'])
```

---

### E2E-04: Consumer installs plugin via Claude, gets bundled skills

**As a** skill consumer,
**I want** installing a published plugin to include all bundled skills automatically,
**So that** the plugin works out of the box.

**Acceptance criteria:**
- The built plugin artifact contains all local + vendored skills
- `bundled-skills.json` lists what was bundled
- All skills are discoverable in the `skills/` directory of the output

**Test scenario:**
```
repo = createPluginBundleFixture()

runCLI(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
bundled = JSON.parse(readFileSync(join(outDir, '.claude-plugin', 'bundled-skills.json'), 'utf-8'))

# Verify all expected skills are present
skillNames = readdirSync(join(outDir, 'skills'))
assert.ok(skillNames.includes('proof-points'))           # local
assert.ok(skillNames.includes('copywriting'))             # local
assert.ok(skillNames.includes('value-proof-points'))      # vendored direct
assert.ok(skillNames.includes('value-copywriting'))       # vendored direct
assert.ok(skillNames.includes('methodology-gary-provost'))# vendored transitive
```

---

## 9. Agent Stories

### AGENT-01: Agent authors a skill that requires another skill

**As an** agent,
**I want** to declare dependencies in SKILL.md.requires,
**So that** the dependency graph is explicit and manageable.

**Acceptance criteria:**
- Agent writes a SKILL.md with `requires: ["@alavida/methodology-gary-provost"]`
- The requires array is parsed correctly by agentpack
- `agentpack skills inspect` shows the dependency

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/methodology-gary-provost\n---\n# Copy\n',
  packageJson: {
    name: '@alavida/value-copywriting', version: '1.0.0',
    files: ['SKILL.md'],
    dependencies: { '@alavida/methodology-gary-provost': '^1.0.0' }
  }
})
addPackagedSkill(repo.root, 'methods/gary-provost', {
  skillMd: '---\nname: methodology-gary-provost\ndescription: Rhythm.\nrequires: []\n---\n# Gary Provost\n',
  packageJson: { name: '@alavida/methodology-gary-provost', version: '1.0.0', files: ['SKILL.md'] }
})

result = runCLI(['skills', 'inspect', '@alavida/value-copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.match(result.stdout, /@alavida\/methodology-gary-provost/)
```

---

### AGENT-02: Agent runs agentpack skills dev to test locally

**As an** agent,
**I want** to run `agentpack skills dev <path>` to make a skill available for local testing,
**So that** I can iterate quickly without publishing.

**Acceptance criteria:**
- The skill is linked into `.claude/skills/`
- Dependencies are synced
- The agent can immediately use the skill

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

result = runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)

# Agent can verify the skill is discoverable:
assert.ok(existsSync(join(repo.root, '.claude', 'skills', 'value-copywriting')))

# The SKILL.md is readable from the symlink target
skillContent = readFileSync(join(repo.root, '.claude', 'skills', 'value-copywriting', 'SKILL.md'), 'utf-8')
assert.match(skillContent, /value-copywriting/)
```

---

### AGENT-03: Agent runs agentpack skills validate before publishing

**As an** agent,
**I want** to run `agentpack skills validate` to check if a skill is ready to publish,
**So that** I can catch issues before they reach consumers.

**Acceptance criteria:**
- Validation checks all structural requirements
- Valid skills report exit code 0 with "Status: valid"
- Invalid skills report exit code 2 with specific issue codes
- Dependencies are auto-synced before validation

**Test scenario:**
```
repo = createValidateFixture()

# Valid skill:
result = runCLIJson(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.valid, true)
assert.ok(Array.isArray(result.json.nextSteps))

# Invalid skill (missing source):
rmSync(join(repo.root, 'domains/value/knowledge/selling-points.md'))
result = runCLIJson(['skills', 'validate', 'domains/value/skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 2)
assert.equal(result.json.valid, false)
assert.equal(result.json.issues[0].code, 'missing_source')
```

---

### AGENT-04: Agent uses agentpack plugin build to prepare a plugin for release

**As an** agent,
**I want** to run `agentpack plugin build` to produce a release artifact,
**So that** the plugin can be tested and published.

**Acceptance criteria:**
- Build produces complete output in `.agentpack/dist/plugins/<name>/`
- All skills (local + vendored) are present
- Provenance file is written
- Build result is reported in --json format

**Test scenario:**
```
repo = createPluginBundleFixture()

result = runCLIJson(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.success, true)
assert.ok(result.json.outputPath)

outDir = join(repo.root, '.agentpack', 'dist', 'plugins', 'website-dev')
assert.ok(existsSync(outDir))
assert.ok(existsSync(join(outDir, '.claude-plugin', 'bundled-skills.json')))
```

---

### AGENT-05: Agent discovers and reads a skill from .claude/skills/

**As an** agent running inside Claude Code,
**I want** to discover skills from `.claude/skills/`,
**So that** I can read SKILL.md files and apply their guidance.

**Acceptance criteria:**
- After `skills dev` or `skills install`, the SKILL.md is readable from `.claude/skills/<name>/SKILL.md`
- The symlink resolves to the actual skill directory
- The SKILL.md content is the same as the source

**Test scenario:**
```
repo = createTempRepo()
skillContent = '---\nname: value-copywriting\ndescription: Copy.\nrequires: []\n---\n# Value Copywriting\n\nWrite compelling copy.\n'
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: skillContent,
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'] }
})

runCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })

# Agent discovers and reads the skill:
discoveredPath = join(repo.root, '.claude', 'skills', 'value-copywriting', 'SKILL.md')
assert.ok(existsSync(discoveredPath))
discovered = readFileSync(discoveredPath, 'utf-8')
assert.equal(discovered, skillContent)
```

---

### AGENT-06: Agent runs agentpack skills dev with --json for programmatic consumption

**As an** agent,
**I want** `skills dev --json` to return structured data,
**So that** I can programmatically verify the link was created and deps were synced.

**Acceptance criteria:**
- JSON output includes skill name, link status, and sync results
- Exit code is 0 for success
- The agent can parse the JSON and make decisions based on it

**Test scenario:**
```
repo = createTempRepo()
addPackagedSkill(repo.root, 'skills/copywriting', {
  skillMd: '---\nname: value-copywriting\ndescription: Copy.\nrequires:\n  - @alavida/new-dep\n---\n# Copy\n',
  packageJson: { name: '@alavida/value-copywriting', version: '1.0.0', files: ['SKILL.md'], dependencies: {} }
})

result = runCLIJson(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.linked, true)
assert.ok(result.json.synced.added.includes('@alavida/new-dep'))
```

---

### AGENT-07: Agent uses validate --json to check all skills in a repo

**As an** agent,
**I want** to run `agentpack skills validate --json` to get structured validation results for all skills,
**So that** I can report issues programmatically.

**Acceptance criteria:**
- `--json` output includes validation results for each skill
- Each result includes: packageName, valid, issues, nextSteps
- Agent can iterate over results and report

**Test scenario:**
```
repo = createRepoFromFixture('monorepo')

result = runCLIJson(['skills', 'validate'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.ok(result.json.validated)
assert.ok(result.json.validCount >= 0)
assert.ok(result.json.invalidCount >= 0)
```

---

### AGENT-08: Agent runs plugin build --json for CI integration

**As an** agent running in a CI pipeline,
**I want** `plugin build --json` to return machine-readable output,
**So that** CI can determine build success and locate the artifact.

**Acceptance criteria:**
- JSON output includes: pluginName, outputPath, success, localSkills, vendoredSkills
- Exit code is 0 for successful builds
- Exit code is 1 for failed builds with JSON error details

**Test scenario:**
```
repo = createPluginBundleFixture()

# Successful build:
result = runCLIJson(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.equal(result.exitCode, 0)
assert.equal(result.json.success, true)
assert.ok(result.json.outputPath)

# Failed build (remove required dependency):
rmSync(join(repo.root, 'packages/skills/value-proof-points'), { recursive: true })
result = runCLIJson(['plugin', 'build', 'plugins/website-dev'], { cwd: repo.root })
assert.notEqual(result.exitCode, 0)
```

---

## Appendix: Test File Mapping

| Story Category | Test File | New Tests | Modified Tests |
|---|---|---|---|
| RENAME-* | All 17 existing test files | 0 | All tests updated with new paths |
| SYNC-* | `skills-dep-sync.test.js` | ~8 | 0 |
| DEV-* | `skills-dev.test.js` | ~11 | 0 |
| UNLINK-* | `skills-unlink.test.js` | ~4 | 0 |
| VAL-* | `skills-validate.test.js` | ~2-3 | 1 modified (missing_dep now passes) |
| BUILD-* | `plugin-build.test.js` | ~12 | 0 |
| WATCH-* | `plugin-dev.test.js` | ~2-4 | 0 |
| E2E-* | `e2e.test.js` | ~4 | 0 |
| AGENT-* | Covered by DEV/VAL/BUILD tests | 0 | 0 |

**Total estimated new tests:** ~41-46
**Total estimated modified tests:** ~59 (all renamed)
**Total test suite after implementation:** ~100-105

## Appendix: Exit Code Reference

| Exit Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Command failed (target not found, build failed, unresolved deps) |
| 2 | Validation error (invalid skill or plugin structure) |
| 4 | User error (missing target, no workbench context) |

## Appendix: File Path Reference (Post-Rename)

| Path | Purpose | Committed? |
|---|---|---|
| `.agentpack/catalog.json` | Authored skills catalog | Yes |
| `.agentpack/build-state.json` | Source hash state | Yes |
| `.agentpack/install.json` | Consumer install state | No |
| `.agentpack/dist/plugins/<name>/` | Plugin build output | No |
| `.claude/skills/<name>` | Skill discovery (symlink) | No |
| `.agents/skills/<name>` | Skill discovery (symlink) | No |
