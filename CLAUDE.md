# Repository Instructions

## Releases

- This repo uses Changesets as the release mechanism.
- Do not use manual git tags as the normal release path.
- For user-facing changes, add a changeset with `npx changeset` in the feature PR.
- After feature PRs merge to `main`, GitHub Actions opens or updates the `Version Packages` release PR.
- Merging the generated release PR publishes the package to npm.

## PR Workflow

- `main` has branch protection: PRs must pass both `test` and `changeset-check` CI jobs before merging.
- After pushing a branch and creating a PR, always verify CI passes:
  ```bash
  gh pr checks <pr-number> --watch
  ```
- If `changeset-check` fails, run `npx changeset`, select the package and bump type, write a summary, then commit the generated `.changeset/*.md` file and push.
- If `test` fails, view the failure logs and fix:
  ```bash
  gh run view <run-id> --log-failed
  ```
- For PRs that don't need a release (docs-only, CI config), run `npx changeset --empty` to satisfy the check.

## Documentation & Code Generation

- Always use Context7 CLI (`ctx7`) when working with library/API documentation, code generation, setup, or configuration steps — without waiting to be asked.
- Fall back to DeepWiki or the `find-docs` skill if Context7 is unavailable.

## Harness-First Workflow

- Before implementation, make sure the work is grounded in the harness design at `docs/superpowers/specs/2026-03-15-agentpack-harness-design.md`.
- The expected verification order is:
  1. TLA models for stateful changes
  2. parser/compiler golden tests
  3. repo-lab integration tests
  4. Verdaccio-backed registry tests
  5. Playwright localhost dashboard/e2e tests
  6. `agonda` and `superpowers` smoke suites
- Do not rely on manual testing when a harness layer should cover the scenario.
- If a feature is not yet harnessable, identify the missing harness work explicitly and add it before implementation.
- For UI and dashboard changes, expose deterministic hooks for Playwright rather than depending on visual heuristics alone.
- Standardize TLC setup through scripts or a documented bootstrap path; do not assume a local `tla2tools.jar` is already present.

## TLA+ Verification

### What it is
TLA+ models in `tla/` formally verify the state machine logic in agentpack. The TLC model checker exhaustively explores every possible state and transition to check that invariants hold — including crash scenarios, race conditions, and edge cases that tests miss.

### File structure
Each model has three files:
- `*.tla` — the model (variables, actions, invariants)
- `MC_*.tla` — wrapper that defines concrete constants for model checking
- `MC_*.cfg` — config listing which invariants to check

### Current models
| Model | Code it verifies | Key invariants |
|---|---|---|
| `SkillStatus` | `domain/skills/skill-graph.js` — status propagation (current/stale/affected) | Staleness propagates correctly through dependency graph |
| `DevSession` | `lib/skills.js`, `infrastructure/fs/dev-session-repository.js` — dev session lifecycle | At most one active session, crash recovery cleans up links |
| `InstallFlow` | `lib/skills.js`, `infrastructure/runtime/materialize-skills.js` — install + materialization | Filesystem matches install.json after success, crash leaves recoverable state |

### When to update TLA+ models
Update the model BEFORE implementing when changing:
- How `install.json` is written or what it tracks
- The install/uninstall flow (phases, ordering, what's atomic)
- Dev session lifecycle (new statuses, cleanup paths, signal handling)
- Skill status propagation logic (how stale/affected are computed)
- Any new state file that interacts with existing state files

Do NOT bother with TLA+ for:
- New CLI commands that only read state
- Validation rules, output formatting, UI changes
- Adding fields to existing state files without changing transitions

### How to run
```bash
npm run test:models
```
This bootstraps `tla2tools.jar` into `.cache/tla/` automatically and runs all three models. If TLC reports an invariant violation, it gives the exact state trace that broke it — use that to fix the model or the design.

### How to learn TLA+ syntax
Use Context7 to pull docs from the source — do not rely on training data:
```bash
# Language reference (Lamport's site)
npx ctx7 docs /websites/lamport_azurewebsites_net_tla "<your question>"
# Working examples
npx ctx7 docs /tlaplus/examples "<what you want to see>"
# TLC model checker options
npx ctx7 docs /tlaplus/tlaplus "<your question about TLC>"
```
