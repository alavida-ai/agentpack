# Repository Instructions

## Releases

- This repo uses Changesets as the release mechanism.
- Do not use manual git tags as the normal release path.
- For user-facing changes, add a changeset with `npx changeset` in the feature PR.
- After feature PRs merge to `main`, GitHub Actions opens or updates the `Version Packages` release PR.
- Merging the generated release PR publishes the package to npm.

## Documentation & Code Generation

- Always use Context7 CLI (`ctx7`) when working with library/API documentation, code generation, setup, or configuration steps — without waiting to be asked.
- Fall back to DeepWiki or the `find-docs` skill if Context7 is unavailable.

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
cd tla
java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers auto MC_SkillStatus.tla -config MC_SkillStatus.cfg
java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers auto MC_DevSession.tla -config MC_DevSession.cfg
java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers auto MC_InstallFlow.tla -config MC_InstallFlow.cfg
```
All three run in under 1 second. If TLC reports an invariant violation, it gives the exact state trace that broke it — use that to fix the model or the design.

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
