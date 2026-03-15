# Agent Instructions

## Documentation & Code Generation

- Always use Context7 CLI (`ctx7`) when working with library/API documentation, code generation, setup, or configuration steps — without waiting to be asked.
- Fall back to DeepWiki or the `find-docs` skill if Context7 is unavailable.

## Harness-First Workflow

- Before implementing any non-trivial change, ensure the harness environment described in `docs/superpowers/specs/2026-03-15-agentpack-harness-design.md` is the basis for the work.
- Prefer adding or updating automated harness coverage before relying on manual repo verification.
- Use the layered harness order:
  1. TLA models for stateful behavior
  2. parser/compiler golden tests
  3. repo-lab integration harness
  4. registry harness
  5. Playwright dashboard/e2e harness
  6. live sandbox smoke suites (`agonda`, `superpowers`)
- Do not treat manual testing as a completion criterion when the harness can cover the scenario.
- If a change cannot yet be covered by the harness, call out the exact missing harness layer and add that work to the plan before implementation.
- For dashboard or graph UI work, add deterministic selectors or other stable test hooks so Playwright can verify localhost behavior without brittle heuristics.
- For TLA execution, do not assume `tla/tla2tools.jar` already exists. Use a stable repo-scripted setup or documented bootstrap path before running TLC.

## TLA+ Verification

### When to use
Update the TLA+ model BEFORE implementing when changing:
- Install/uninstall flow (phases, ordering, atomicity)
- Dev session lifecycle (statuses, cleanup, crash recovery)
- Skill status propagation (dependency graph walks)
- Any new state file that interacts with existing ones (install.json, dev-session.json, build-state.json)

Skip TLA+ for: new read-only commands, validation rules, output formatting, UI.

### How to use
1. Read the existing model in `tla/` to understand current invariants
2. Modify the `.tla` file to reflect the proposed change (add new actions, variables, or invariants)
3. Run TLC through the harness bootstrap:
   - `npm run test:models` for the full model suite, or
   - `bash scripts/setup-tla.sh` to bootstrap the jar path before running an individual model manually
4. If TLC finds a violation, it prints the exact state trace — fix the model or the design
5. Once TLC passes, implement the code change

### Learning TLA+ syntax
Do not guess TLA+ syntax. Use Context7:
```bash
npx ctx7 docs /websites/lamport_azurewebsites_net_tla "<your question>"
npx ctx7 docs /tlaplus/examples "<what you want to see>"
```

### Current models
- `SkillStatus.tla` — skill status propagation (current/stale/affected) through dependency graph
- `DevSession.tla` — dev session lifecycle with crash detection and PID-based recovery
- `InstallFlow.tla` — three-phase install flow with crash points and materialization consistency
