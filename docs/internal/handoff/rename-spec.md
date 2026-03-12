# Rename Specification: agonda -> agentpack

Status: ready for implementation
Date: 2026-03-10

This document specifies every file rename and every line-level string replacement needed for the agonda-to-agentpack rename. It is organized by category and intended for automated find-and-replace execution.

---

## 1. Fixture files to rename (actual file/directory moves)

### Move: `test/fixtures/monorepo/.agonda/` -> `test/fixtures/monorepo/.agentpack/`

Rename the directory itself from `.agonda` to `.agentpack`.

### Move: `test/fixtures/monorepo/.agonda/skills.catalog.json` -> `test/fixtures/monorepo/.agentpack/catalog.json`

Both a directory move (parent) and a file rename (skills.catalog.json -> catalog.json).

### Move: `test/fixtures/monorepo/.agonda/build-state.json` -> `test/fixtures/monorepo/.agentpack/build-state.json`

File moves with the parent directory rename. Filename stays the same.

### Move: `test/fixtures/consumer/agonda.skills.json` -> `test/fixtures/consumer/.agentpack/install.json`

The file moves from the root of the consumer fixture into a new `.agentpack/` subdirectory, and is renamed from `agonda.skills.json` to `install.json`.

The content of the file (`{"version":1,"installs":{}}`) does not change.

---

## 2. Source code string replacements (in `src/`)

### File: `src/utils/errors.js`

- Line 13: `Base error class for all Agonda CLI errors.` -> `Base error class for all agentpack CLI errors.`
- Line 16: `export class AgondaError extends Error {` -> `export class AgentpackError extends Error {`
- Line 19: `this.name = 'AgondaError';` -> `this.name = 'AgentpackError';`
- Line 34: `export class ValidationError extends AgondaError {` -> `export class ValidationError extends AgentpackError {`
- Line 41: `export class NetworkError extends AgondaError {` -> `export class NetworkError extends AgentpackError {`
- Line 48: `export class NotFoundError extends AgondaError {` -> `export class NotFoundError extends AgentpackError {`
- Line 59: `if (err instanceof AgondaError) {` -> `if (err instanceof AgentpackError) {`

### File: `src/cli.js`

- Line 3: `import { formatError, AgondaError, EXIT_CODES } from './utils/errors.js';` -> `import { formatError, AgentpackError, EXIT_CODES } from './utils/errors.js';`
- Line 16: `.description('Agonda skills lifecycle CLI')` -> `.description('agentpack skills lifecycle CLI')`
- Line 68: `if (err instanceof AgondaError) {` -> `if (err instanceof AgentpackError) {`

### File: `src/lib/skills.js`

- Line 509: `discoveryRoot = process.env.AGONDA_DISCOVERY_ROOT,` -> `discoveryRoot = process.env.AGENTPACK_DISCOVERY_ROOT,`
- Line 753: `const buildStatePath = join(repoRoot, '.agonda', 'build-state.json');` -> `const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');`
- Line 762: `const installStatePath = join(repoRoot, 'agonda.skills.json');` -> `const installStatePath = join(repoRoot, '.agentpack', 'install.json');`
- Line 771: `writeFileSync(join(repoRoot, 'agonda.skills.json'), JSON.stringify(state, null, 2) + '\n');` -> `writeFileSync(join(repoRoot, '.agentpack', 'install.json'), JSON.stringify(state, null, 2) + '\n');`
- Line 1336: `discoveryRoot = process.env.AGONDA_DISCOVERY_ROOT,` -> `discoveryRoot = process.env.AGENTPACK_DISCOVERY_ROOT,`

Note: The `writeInstallState` function on line 771 now writes to a subdirectory. The implementation must ensure the `.agentpack/` directory exists before writing. Add `mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });` before the write call, or add it to the `writeInstallState` function.

Similarly, the `readInstallState` function on line 762 must handle the new path. Since `.agentpack/` may not exist yet in consumer repos, the existing `!existsSync` guard handles this correctly.

### File: `src/lib/context.js`

- Line 31: `'Not inside a git repository. Run from inside an Agonda repo.',` -> `'Not inside a git repository. Run from inside an agentpack repo.',`
- Line 32: `{ code: 'repo_not_found', suggestion: 'cd into your Agonda knowledge base repo' }` -> `{ code: 'repo_not_found', suggestion: 'cd into your agentpack knowledge base repo' }`

### File: `src/commands/plugin.js`

- Line 11: `.command('inspect-bundle')` -> `.command('inspect')`
- Line 74: `.command('validate-bundle')` -> `.command('validate')`

### File: `src/commands/skills.js`

No string replacements needed. This file does not contain any agonda-specific strings.

### File: `src/lib/plugins.js`

No string replacements needed. This file does not contain any agonda-specific strings.

### File: `src/utils/output.js`

No string replacements needed. This file does not contain any agonda-specific strings.

---

## 3. Test file string replacements (in `test/`)

### File: `test/integration/fixtures.js`

- Line 3: `* Creates temp repos with the full Agonda directory structure.` -> `* Creates temp repos with the full agentpack directory structure.`
- Line 17: `* Create a temp repo with configurable Agonda structure.` -> `* Create a temp repo with configurable agentpack structure.`
- Line 21: `const root = join(tmpdir(), \`agonda-${name}-${Date.now()}\`);` -> `const root = join(tmpdir(), \`agentpack-${name}-${Date.now()}\`);`
- Line 30: `const root = join(tmpdir(), \`agonda-${name}-${Date.now()}\`);` -> `const root = join(tmpdir(), \`agentpack-${name}-${Date.now()}\`);`

### File: `test/integration/skills-install.test.js`

- Line 33: `const installState = JSON.parse(readFileSync(join(consumer.root, 'agonda.skills.json'), 'utf-8'));` -> `const installState = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));`

### File: `test/integration/skills-uninstall.test.js`

- Line 29: `const state = JSON.parse(readFileSync(join(consumer.root, 'agonda.skills.json'), 'utf-8'));` -> `const state = JSON.parse(readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8'));`

### File: `test/integration/skills-dependencies.test.js`

- Line 58: `const buildStatePath = join(monorepo.root, '.agonda', 'build-state.json');` -> `const buildStatePath = join(monorepo.root, '.agentpack', 'build-state.json');`
- Line 93: `env: { AGONDA_DISCOVERY_ROOT: monorepo.root },` -> `env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },`
- Line 124: `env: { AGONDA_DISCOVERY_ROOT: monorepo.root },` -> `env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },`

### File: `test/integration/skills-missing.test.js`

- Line 36: `const statePath = join(consumer.root, 'agonda.skills.json');` -> `const statePath = join(consumer.root, '.agentpack', 'install.json');`
- Line 67: `const statePath = join(consumer.root, 'agonda.skills.json');` -> `const statePath = join(consumer.root, '.agentpack', 'install.json');`

### File: `test/integration/skills-outdated.test.js`

- Line 44: `env: { AGONDA_DISCOVERY_ROOT: monorepo.root },` -> `env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },`
- Line 77: `env: { AGONDA_DISCOVERY_ROOT: monorepo.root },` -> `env: { AGENTPACK_DISCOVERY_ROOT: monorepo.root },`

### File: `test/integration/skills-status.test.js`

- Line 136: `const statePath = join(consumer.root, 'agonda.skills.json');` -> `const statePath = join(consumer.root, '.agentpack', 'install.json');`

### File: `test/integration/skills-reinstall.test.js`

- Line 17: `const stateAfterFirst = readFileSync(join(consumer.root, 'agonda.skills.json'), 'utf-8');` -> `const stateAfterFirst = readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8');`
- Line 21: `const stateAfterSecond = readFileSync(join(consumer.root, 'agonda.skills.json'), 'utf-8');` -> `const stateAfterSecond = readFileSync(join(consumer.root, '.agentpack', 'install.json'), 'utf-8');`

### File: `test/integration/skills-authoring-metadata.test.js`

- Line 15: `readFileSync(join(repo.root, '.agonda', 'skills.catalog.json'), 'utf-8')` -> `readFileSync(join(repo.root, '.agentpack', 'catalog.json'), 'utf-8')`
- Line 30: `readFileSync(join(repo.root, '.agonda', 'build-state.json'), 'utf-8')` -> `readFileSync(join(repo.root, '.agentpack', 'build-state.json'), 'utf-8')`

### File: `test/integration/plugin-bundle.test.js`

- Line 12: `const result = runCLI(['plugin', 'inspect-bundle', 'plugins/website-dev'], { cwd: repo.root });` -> `const result = runCLI(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root });`
- Line 31: `const result = runCLIJson(['plugin', 'inspect-bundle', 'plugins/website-dev'], { cwd: repo.root });` -> `const result = runCLIJson(['plugin', 'inspect', 'plugins/website-dev'], { cwd: repo.root });`
- Line 47: `const result = runCLI(['plugin', 'validate-bundle', 'plugins/website-dev'], { cwd: repo.root });` -> `const result = runCLI(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root });`
- Line 68: `const result = runCLIJson(['plugin', 'validate-bundle', 'plugins/website-dev'], { cwd: repo.root });` -> `const result = runCLIJson(['plugin', 'validate', 'plugins/website-dev'], { cwd: repo.root });`

### File: `test/integration/skills-env.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-stale.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-validate.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-inspect.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-json.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-registry.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-multi-root.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

### File: `test/integration/skills-install-workbench.test.js`

No string replacements needed. This file does not reference agonda paths or identifiers.

---

## 4. Script string replacements (in `scripts/`)

### File: `scripts/live-validation.mjs`

- Line 50: `const buildStatePath = join(repoRoot, '.agonda', 'build-state.json');` -> `const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');`
- Line 51: `const catalogPath = join(repoRoot, '.agonda', 'skills.catalog.json');` -> `const catalogPath = join(repoRoot, '.agentpack', 'catalog.json');`
- Line 131: `rmSync(join(repoRoot, 'agonda.skills.json'), { force: true });` -> `rmSync(join(repoRoot, '.agentpack', 'install.json'), { force: true });`

### File: `scripts/smoke-monorepo.mjs`

- Line 76: `const buildStatePath = join(repoRoot, '.agonda', 'build-state.json');` -> `const buildStatePath = join(repoRoot, '.agentpack', 'build-state.json');`
- Line 77: `const catalogPath = join(repoRoot, '.agonda', 'skills.catalog.json');` -> `const catalogPath = join(repoRoot, '.agentpack', 'catalog.json');`
- Line 153: `rmSync(join(repoRoot, 'agonda.skills.json'), { force: true });` -> `rmSync(join(repoRoot, '.agentpack', 'install.json'), { force: true });`

---

## 5. Doc string replacements (in `docs/`)

### File: `docs/architecture.mdx`

- Line 57: `Agonda layers on top of it to:` -> `agentpack layers on top of it to:`
- Line 227: `### \`.agonda/skills.catalog.json\`` -> `### \`.agentpack/catalog.json\``
- Line 238: `### \`.agonda/build-state.json\`` -> `### \`.agentpack/build-state.json\``
- Line 249: `### \`agonda.skills.json\`` -> `### \`.agentpack/install.json\``
- Line 272: `- no Agonda dependency metadata added to \`.claude-plugin/plugin.json\`` -> `- no agentpack dependency metadata added to \`.claude-plugin/plugin.json\``

### File: `docs/commands.mdx`

- Line 45: `- \`inspect-bundle\` reports plugin bundle closure` -> `- \`inspect\` reports plugin bundle closure`
- Line 46: `- \`validate-bundle\` checks whether plugin vendoring can succeed` -> `- \`validate\` checks whether plugin vendoring can succeed`
- Line 63: `### \`agentpack plugin inspect-bundle\`` -> `### \`agentpack plugin inspect\``
- Line 82: `### \`agentpack plugin validate-bundle\`` -> `### \`agentpack plugin validate\``
- Line 137: `- supports an alternate discovery root through \`AGONDA_DISCOVERY_ROOT\`` -> `- supports an alternate discovery root through \`AGENTPACK_DISCOVERY_ROOT\``
- Line 240: `<Check>Implemented. Reads \`.agonda/build-state.json\` and compares recorded hashes.</Check>` -> `<Check>Implemented. Reads \`.agentpack/build-state.json\` and compares recorded hashes.</Check>`
- Line 258: `- write \`agonda.skills.json\`` -> `- write \`.agentpack/install.json\``
- Line 301: `- rewrites \`agonda.skills.json\`` -> `- rewrites \`.agentpack/install.json\``

### File: `docs/current-state.mdx`

- Line 13: `### \`agentpack plugin inspect-bundle\`` -> `### \`agentpack plugin inspect\``
- Line 17: `### \`agentpack plugin validate-bundle\`` -> `### \`agentpack plugin validate\``
- Line 90: `- commit \`.agonda/build-state.json\`` -> `- commit \`.agentpack/build-state.json\``
- Line 91: `- commit \`.agonda/skills.catalog.json\`` -> `- commit \`.agentpack/catalog.json\``
- Line 92: `- do not commit \`agonda.skills.json\`` -> `- do not commit \`.agentpack/install.json\``

### File: `docs/fixtures.mdx`

- Line 18: `- \`.agonda/build-state.json\`` -> `- \`.agentpack/build-state.json\``
- Line 19: `- \`.agonda/skills.catalog.json\`` -> `- \`.agentpack/catalog.json\``
- Line 42: `- empty \`agonda.skills.json\`` -> `- empty \`.agentpack/install.json\``

### File: `docs/schemas.mdx`

- Line 8: `Define the initial schema shapes for the replacement \`agonda-cli\`.` -> `Define the initial schema shapes for the replacement \`agentpack\`.`
- Line 12: `- generated authoring metadata in \`.agonda/build-state.json\`` -> `- generated authoring metadata in \`.agentpack/build-state.json\``
- Line 13: `- generated authoring catalog in \`.agonda/skills.catalog.json\`` -> `- generated authoring catalog in \`.agentpack/catalog.json\``
- Line 14: `- repo-local runtime state in \`agonda.skills.json\`` -> `- repo-local runtime state in \`.agentpack/install.json\``
- Line 29: `Optional Agonda fields:` -> `Optional agentpack fields:`
- Line 58: `## 2. \`package.json\` Fields Agonda Reads` -> `## 2. \`package.json\` Fields agentpack Reads`
- Line 60: `Agonda depends on a minimal subset of package metadata:` -> `agentpack depends on a minimal subset of package metadata:`
- Line 76: `Fields read by Agonda:` -> `Fields read by agentpack:`
- Line 87: `## 3. \`.agonda/build-state.json\`` -> `## 3. \`.agentpack/build-state.json\``
- Line 134: `## 4. \`.agonda/skills.catalog.json\`` -> `## 4. \`.agentpack/catalog.json\``
- Line 181: `## 5. \`agonda.skills.json\`` -> `## 5. \`.agentpack/install.json\``

### File: `docs/testing.mdx`

- Line 8: `Keep the replacement \`agonda-cli\` maintainable by testing behavior that matters, not private implementation details.` -> `Keep the replacement \`agentpack\` maintainable by testing behavior that matters, not private implementation details.`

### File: `docs/distribution.mdx`

- Line 8: `Agonda skills should distribute through a private npm-compatible registry.` -> `agentpack skills should distribute through a private npm-compatible registry.`
- Line 18: `- Agonda stays thin` -> `- agentpack stays thin`
- Line 69: `## Agonda Boundary` -> `## agentpack Boundary`
- Line 71: `Agonda does not become a package publisher or registry manager.` -> `agentpack does not become a package publisher or registry manager.`
- Line 73: `**Agonda should:**` -> `**agentpack should:**`
- Line 83: `**Agonda should not:**` -> `**agentpack should not:**`

### File: `docs/overview.mdx`

- Line 80: `6. \`agentpack plugin validate-bundle\`` -> `6. \`agentpack plugin validate\``
- Line 79: `5. \`agentpack plugin inspect-bundle\`` -> `5. \`agentpack plugin inspect\``

### File: `docs/introduction.mdx`

- Line 38: `12. \`agentpack plugin inspect-bundle\`` -> `12. \`agentpack plugin inspect\``
- Line 39: `13. \`agentpack plugin validate-bundle\`` -> `13. \`agentpack plugin validate\``
- Line 60: `agentpack plugin inspect-bundle path/to/plugin` -> `agentpack plugin inspect path/to/plugin`
- Line 63: `agentpack plugin validate-bundle path/to/plugin` -> `agentpack plugin validate path/to/plugin`

### File: `docs/build-lifecycle.mdx`

- Line 163: `agentpack plugin validate-bundle plugins/website-dev` -> `agentpack plugin validate plugins/website-dev`
- Line 268: `| \`agentpack plugin inspect-bundle\` | what would be bundled |` -> `| \`agentpack plugin inspect\` | what would be bundled |`
- Line 269: `| \`agentpack plugin validate-bundle\` | can this plugin bundle successfully |` -> `| \`agentpack plugin validate\` | can this plugin bundle successfully |`

### File: `docs/implementation-plan.mdx`

- Line 69: `- \`.agonda/skills.catalog.json\`` -> `- \`.agentpack/catalog.json\``
- Line 70: `- \`.agonda/build-state.json\`` -> `- \`.agentpack/build-state.json\``
- Line 80: `- runtime reconciliation into \`agonda.skills.json\`` -> `- runtime reconciliation into \`.agentpack/install.json\``
- Line 97: `6. \`agentpack plugin validate-bundle\`` -> `6. \`agentpack plugin validate\``
- Line 96: `5. \`agentpack plugin inspect-bundle\`` -> `5. \`agentpack plugin inspect\``

### File: `docs/live-validation.mdx`

- Line 37: `1. regenerates \`.agonda/skills.catalog.json\` and \`.agonda/build-state.json\` in the target repo` -> `1. regenerates \`.agentpack/catalog.json\` and \`.agentpack/build-state.json\` in the target repo`

### File: `docs/production-readiness.mdx`

- Line 49: `1. regenerate \`.agonda/skills.catalog.json\` and \`.agonda/build-state.json\`` -> `1. regenerate \`.agentpack/catalog.json\` and \`.agentpack/build-state.json\``

---

## 6. Config file changes

### File: `.gitignore`

- Line 3: `agonda.skills.json` -> `.agentpack/install.json`

Additionally, add a new line:
```
.agentpack/dist/
```

The full `.gitignore` should become:
```
node_modules/
package-lock.json
.agentpack/install.json
.agentpack/dist/
```

### File: `README.md`

- Line 40: `- internal generation of \`.agonda/skills.catalog.json\` and \`.agonda/build-state.json\` is implemented` -> `- internal generation of \`.agentpack/catalog.json\` and \`.agentpack/build-state.json\` is implemented`
- Line 34: `- \`plugin inspect-bundle\` is implemented for plugin bundle graph inspection` -> `- \`plugin inspect\` is implemented for plugin bundle graph inspection`
- Line 35: `- \`plugin validate-bundle\` is implemented for plugin bundle contract validation` -> `- \`plugin validate\` is implemented for plugin bundle contract validation`
- Line 65: `- commit \`.agonda/build-state.json\`` -> `- commit \`.agentpack/build-state.json\``
- Line 66: `- commit \`.agonda/skills.catalog.json\`` -> `- commit \`.agentpack/catalog.json\``
- Line 70: `- do not commit \`agonda.skills.json\`` -> `- do not commit \`.agentpack/install.json\``

### File: `LIVE-TEST.md`

- Line 146: `- Agonda does not publish for you` -> `- agentpack does not publish for you`
- Line 147: `- npm publishes; Agonda validates and guides` -> `- npm publishes; agentpack validates and guides`
- Line 214: `- \`agonda.skills.json\`` -> `- \`.agentpack/install.json\``
- Line 268: `1. Regenerate \`.agonda/build-state.json\` if needed.` -> `1. Regenerate \`.agentpack/build-state.json\` if needed.`
- Line 303: `- \`agonda.skills.json\`` -> `- \`.agentpack/install.json\``

### File: `package.json`

No string replacements needed. The package name `@alavida/agentpack` is already correct and does not reference agonda.

### File: `bin/agentpack.js`

No string replacements needed. This file does not reference agonda.

### File: `templates/consumer.npmrc.example`

No string replacements needed. This file does not reference agonda.

### File: `docs/docs.json`

No string replacements needed. This file does not reference agonda.

---

## Summary of all rename rules applied

| Rule | Scope | Occurrences |
|---|---|---|
| `.agonda/` -> `.agentpack/` (directory path) | src, test, scripts, docs | ~20 |
| `.agonda/skills.catalog.json` -> `.agentpack/catalog.json` | src (implied), test, scripts, docs | ~10 |
| `.agonda/build-state.json` -> `.agentpack/build-state.json` | src, test, scripts, docs | ~10 |
| `agonda.skills.json` -> `.agentpack/install.json` | src, test, scripts, docs, .gitignore | ~15 |
| `AgondaError` -> `AgentpackError` (class name) | src/utils/errors.js, src/cli.js | 9 |
| `agonda` -> `agentpack` (identifier contexts) | fixtures.js temp dirs, context.js error messages, comments | ~6 |
| `inspect-bundle` -> `inspect` (plugin command) | src/commands/plugin.js, test, docs | ~10 |
| `validate-bundle` -> `validate` (plugin command) | src/commands/plugin.js, test, docs | ~10 |
| `AGONDA_DISCOVERY_ROOT` -> `AGENTPACK_DISCOVERY_ROOT` (env var) | src/lib/skills.js, test | 4 |
| `Agonda` -> `agentpack` (prose references) | docs, LIVE-TEST.md, comments | ~15 |

## Implementation notes

1. **Fixture directory move must happen first.** Rename `test/fixtures/monorepo/.agonda/` to `test/fixtures/monorepo/.agentpack/` and rename `skills.catalog.json` to `catalog.json` within it. Create `test/fixtures/consumer/.agentpack/` and move `agonda.skills.json` into it as `install.json`.

2. **The `writeInstallState` function needs a directory ensure.** Since `install.json` now lives inside `.agentpack/`, the write function must create the directory if it does not exist. Add `mkdirSync(join(repoRoot, '.agentpack'), { recursive: true });` before the `writeFileSync` call in `src/lib/skills.js` line 771.

3. **The rename is one atomic commit.** All 59 tests must pass after the rename. No partial renames.

4. **Prose "Agonda" references in docs** should be lowercased to "agentpack" when they refer to the tool/CLI. In contexts where "Agonda" refers to the broader governance concept, it may remain but should be reviewed case by case. All occurrences listed above are tool references and should change.

5. **No behavior changes.** The rename changes only names, paths, and strings. No logic, no new features, no removed features.
