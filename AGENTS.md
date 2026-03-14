# Agent Instructions

## Documentation & Code Generation

- Always use Context7 CLI (`ctx7`) when working with library/API documentation, code generation, setup, or configuration steps — without waiting to be asked.
- Fall back to DeepWiki or the `find-docs` skill if Context7 is unavailable.

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
3. Run TLC: `cd tla && java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers auto MC_<Model>.tla -config MC_<Model>.cfg`
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
