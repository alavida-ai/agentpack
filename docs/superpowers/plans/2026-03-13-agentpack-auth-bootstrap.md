# Agentpack Auth Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintainable `agentpack auth` workflow for GitHub Packages that configures whole-machine access with minimal side effects, stores credentials in a file-backed v1 credential store, and exposes trustworthy `auth status` and `auth status --verify` checks.

**Architecture:** Implement auth as a bounded slice parallel to the newer skills architecture, not as another `src/lib/*.js` god module. Add explicit repositories for user config, user credentials, and user npm config, plus application-level login/status/logout use cases and a shared registry resolution helper that both `auth` and `skills` commands can rely on.

**Tech Stack:** Node.js, Commander, built-in `node:test`, filesystem-backed user config, browser launch helper

---

## Chunk 1: Define Safe User-Level Config Ownership

### Task 1: Add repositories for user config, credentials, and user npm config

**Files:**
- Create: `src/infrastructure/fs/user-config-repository.js`
- Create: `src/infrastructure/fs/user-credentials-repository.js`
- Create: `src/infrastructure/fs/user-npmrc-repository.js`
- Test: `test/infrastructure/user-config-repository.test.js`
- Test: `test/infrastructure/user-credentials-repository.test.js`
- Test: `test/infrastructure/user-npmrc-repository.test.js`

- [ ] **Step 1: Write the failing tests**

Create repository tests covering:
- `~/.config/agentpack/config.json` path resolution and read/write behavior
- `~/.config/agentpack/credentials.json` creation, strict permissions, save/load/delete behavior
- safe user npm config updates that:
  - preserve unrelated keys and comments where possible
  - write only Agent Pack-managed keys
  - remove only Agent Pack-managed keys during cleanup

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/infrastructure/user-config-repository.test.js test/infrastructure/user-credentials-repository.test.js test/infrastructure/user-npmrc-repository.test.js`
Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement repositories for:
- non-secret config
- file-backed credentials only for v1
- user-level npm config read/update/remove with explicit managed-key ownership

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/infrastructure/user-config-repository.test.js test/infrastructure/user-credentials-repository.test.js test/infrastructure/user-npmrc-repository.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/fs/user-config-repository.js src/infrastructure/fs/user-credentials-repository.js src/infrastructure/fs/user-npmrc-repository.js test/infrastructure/user-config-repository.test.js test/infrastructure/user-credentials-repository.test.js test/infrastructure/user-npmrc-repository.test.js
git commit -m "feat: add user auth repositories"
```

## Chunk 2: Add Shared Registry/Auth Resolution

### Task 2: Add a shared registry resolution helper

**Files:**
- Create: `src/domain/auth/registry-resolution.js`
- Test: `test/domain/registry-resolution.test.js`

- [ ] **Step 1: Write the failing test**

Add tests covering precedence:
1. repo-local `.npmrc`
2. Agent Pack-managed user-level npm config
3. Agent Pack config defaults

Also cover:
- no global `always-auth` dependency
- scope and registry resolution
- verification package resolution

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/domain/registry-resolution.test.js`
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a pure resolver that merges:
- repo-level npm config
- user-level npm config
- Agent Pack defaults from user config

Return one normalized object for registry/auth consumers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/domain/registry-resolution.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/auth/registry-resolution.js test/domain/registry-resolution.test.js
git commit -m "feat: add shared registry resolution rules"
```

## Chunk 3: Add Auth Command Surface

### Task 3: Add `agentpack auth` commands

**Files:**
- Create: `src/commands/auth.js`
- Modify: `src/cli.js`
- Test: `test/integration/auth-commands.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/integration/auth-commands.test.js` covering:
- top-level help shows `auth`
- `agentpack auth --help` shows `login`, `status`, `logout`
- `agentpack auth status --json` returns a structured unauthenticated result before setup

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/auth-commands.test.js`
Expected: FAIL because `auth` command does not exist.

- [ ] **Step 3: Write minimal implementation**

Add a new `auth` command namespace with placeholder handlers that delegate to application use cases once those exist.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/auth-commands.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/auth.js src/cli.js test/integration/auth-commands.test.js
git commit -m "feat: add auth command namespace"
```

## Chunk 4: Implement Auth Status And Verification

### Task 4: Implement status and verify use cases

**Files:**
- Create: `src/application/auth/get-auth-status.js`
- Create: `src/application/auth/verify-auth.js`
- Modify: `src/commands/auth.js`
- Modify: `src/infrastructure/runtime/open-browser.js` (only if test seams are needed)
- Test: `test/integration/auth-status.test.js`

- [ ] **Step 1: Write the failing test**

Add tests covering:
- unauthenticated status
- configured status with file-backed credentials
- `--verify` using a configured verification package
- `valid`, `invalid`, `insufficient_permissions`, and `unreachable` classifications

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/auth-status.test.js`
Expected: FAIL because status/verify use cases do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:
- status inspection from repositories + registry resolver
- live verification against the configured verification package metadata endpoint
- stable status classifications used by both `status --verify` and login

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/auth-status.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/auth/get-auth-status.js src/application/auth/verify-auth.js src/commands/auth.js test/integration/auth-status.test.js
git commit -m "feat: implement auth status and verification"
```

## Chunk 5: Implement Auth Login And Logout

### Task 5: Implement login with defaulted scope and verification package

**Files:**
- Create: `src/application/auth/login.js`
- Modify: `src/commands/auth.js`
- Modify: `src/infrastructure/runtime/open-browser.js` (only if required for injection/testing)
- Test: `test/integration/auth-login.test.js`

- [ ] **Step 1: Write the failing test**

Add tests covering:
- browser open is invoked with the GitHub token/setup URL
- default login path only prompts for the token
- optional flags can override scope and verification package
- successful login writes config, writes credentials, and writes the minimal user npm config keys
- login fails cleanly on invalid token

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/auth-login.test.js`
Expected: FAIL because login use case does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement login with:
- defaults for org scope and verification package from config or command flags
- browser launch
- token prompt
- verification before success
- config and credential persistence
- minimal user npm config writes:
  - `@<org>:registry=https://npm.pkg.github.com`
  - `//npm.pkg.github.com/:_authToken=<token>`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/auth-login.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/auth/login.js src/commands/auth.js test/integration/auth-login.test.js
git commit -m "feat: implement auth login bootstrap"
```

### Task 6: Implement logout using tracked managed keys

**Files:**
- Create: `src/application/auth/logout.js`
- Modify: `src/commands/auth.js`
- Test: `test/integration/auth-logout.test.js`

- [ ] **Step 1: Write the failing test**

Add tests covering:
- logout removes file-backed credentials
- logout removes only Agent Pack-managed npm keys
- logout leaves repo-local `.npmrc` untouched
- logout leaves unrelated user-level npm config entries untouched

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/auth-logout.test.js`
Expected: FAIL because logout use case does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement logout cleanup using the managed-key list stored in Agent Pack config.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/auth-logout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/auth/logout.js src/commands/auth.js test/integration/auth-logout.test.js
git commit -m "feat: implement auth logout"
```

## Chunk 6: Integrate Skills Flows With Shared Resolution

### Task 7: Move skills registry/install guidance onto the shared resolver

**Files:**
- Modify: `src/lib/skills.js`
- Modify: `src/commands/skills.js`
- Modify: `test/integration/skills-registry.test.js`
- Modify: `test/integration/skills-install.test.js`
- Modify: `test/integration/skills-status.test.js`

- [ ] **Step 1: Write the failing tests**

Update tests so:
- `skills registry` reports effective registry resolution with repo-local override precedence
- missing-auth install guidance recommends `agentpack auth login`
- repo-local `.npmrc` still overrides user-level Agent Pack defaults

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/integration/skills-registry.test.js test/integration/skills-install.test.js test/integration/skills-status.test.js`
Expected: FAIL because existing code only understands repo-local registry wiring.

- [ ] **Step 3: Write minimal implementation**

Refactor skills registry/install/status flows to consume the new shared resolver rather than duplicating registry parsing logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/integration/skills-registry.test.js test/integration/skills-install.test.js test/integration/skills-status.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills.js src/commands/skills.js test/integration/skills-registry.test.js test/integration/skills-install.test.js test/integration/skills-status.test.js
git commit -m "refactor: share registry resolution across auth and skills"
```

## Chunk 7: Document The New User Journey

### Task 8: Update docs for auth-first GitHub Packages installs

**Files:**
- Modify: `README.md`
- Modify: `docs/publishing.mdx`
- Modify: `docs/sharing-skills.mdx`
- Modify: `docs/cli-skills.mdx`
- Modify: `skills/agentpack-cli/SKILL.md`
- Test: `test/integration/release-contract.test.js`

- [ ] **Step 1: Write the failing test**

Extend release contract checks so docs mention:
- `agentpack auth login`
- `agentpack auth status`
- repo-local `.npmrc` as an override, not the primary user flow
- Agent Pack-managed setup instead of hand-editing npm auth as the default path

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/release-contract.test.js`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update docs and shipped skill guidance to make the primary private install path:
1. `agentpack auth login`
2. `agentpack auth status --verify`
3. `agentpack skills install ...`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/release-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/publishing.mdx docs/sharing-skills.mdx docs/cli-skills.mdx skills/agentpack-cli/SKILL.md test/integration/release-contract.test.js
git commit -m "docs: add auth bootstrap workflow"
```

## Chunk 8: Final Verification

### Task 9: Verify the auth flow end to end

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Inspect CLI help**

Run: `node src/cli.js --help`
Expected: `auth` and `skills` are both listed.

- [ ] **Step 3: Inspect auth help**

Run: `node src/cli.js auth --help`
Expected: `login`, `status`, and `logout` are listed with descriptions.

- [ ] **Step 4: Check docs for the primary flow**

Run: `rg -n "agentpack auth login|agentpack auth status|repo-local \\.npmrc|GITHUB_PACKAGES_TOKEN|npm login" README.md docs skills`
Expected: `agentpack auth` is the main path; raw npm auth references are secondary or advanced guidance only.

- [ ] **Step 5: Commit final cleanup if needed**

```bash
git add -A
git commit -m "chore: finalize auth bootstrap flow"
```
