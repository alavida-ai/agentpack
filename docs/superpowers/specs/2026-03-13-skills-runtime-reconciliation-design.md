# Skills Runtime Reconciliation Design

## Summary

Define a maintainable, npm-like runtime model for installed skills:

- `.agentpack/install.json` is the only source of truth for installed package/export ownership
- `.claude/skills/` and `.agents/skills/` are fully derived materialized state
- `skills install` reconciles derived state to recorded state
- `skills env` stays declarative while `skills status` reports runtime drift
- `skills uninstall` removes all recorded owned materializations, including dangling links

This patch is intentionally scoped to package-backed install/materialization/runtime visibility. It does not broaden into GitHub Packages auth fallback, plugin packaging, or authored-skill architecture changes.

## Problem

The current implementation mixes two different concerns:

1. recorded install ownership
2. live runtime materialization on disk

That creates several bad failure modes:

- `skills env` trusts install state even when runtime entries are deleted or corrupted
- `skills uninstall` can skip dangling symlinks because it checks `existsSync()` before removing paths
- `skills missing` and `skills status` treat intra-package exported skills as missing dependencies
- the CLI has no clean concept of runtime drift, so the health surface cannot distinguish recorded state from live runtime state

## npm Analogy

The target model should match npm semantics closely:

- `package.json` / lockfile: recorded desired state
- `node_modules/`: materialized state
- `npm install`: reconcile materialized state to recorded state

If a user manually deletes files under `node_modules`, npm does not reinterpret that as a semantic uninstall. The tree is simply drifted until the next reconciliation step.

Agentpack should behave the same way:

- `.agentpack/install.json`: recorded desired runtime state
- `.claude/skills/` and `.agents/skills/`: materialized state
- `agentpack skills install <target>`: reconciliation step

## Design Goals

- Keep one source of truth.
- Keep runtime repair simple and explicit.
- Preserve package ownership as the install/uninstall unit.
- Preserve exported skill entries as the runtime visibility unit.
- Make read commands truthful without adding hidden mutation.
- Favor maintainability over clever self-healing.

## Runtime Model

### Recorded state

`.agentpack/install.json` owns:

- installed packages
- direct vs transitive ownership
- exported skills per package
- runtime materialization names
- recorded materialization paths

### Derived state

`.claude/skills/` and `.agents/skills/` are pure derived state:

- they can be rebuilt entirely from install state
- they are not authoritative
- manual edits inside them are runtime drift, not lifecycle actions

## Required Behavioral Changes

### 1. `skills install`

`skills install <target>` remains the reconciliation command.

It should:

1. resolve the requested direct package closure
2. rebuild recorded install state for that closure
3. rematerialize all recorded runtime entries for packages in that closure

It should safely overwrite:

- missing paths
- stale symlinks
- wrong-target symlinks
- plain directories/files at managed materialization paths

This is the npm-like repair path.

### 2. `skills uninstall`

`skills uninstall <package>` must remove all recorded materialization paths owned by removed packages, even when those paths are:

- dangling symlinks
- retargeted symlinks
- plain directories/files

Uninstall must not rely on `existsSync()` to determine removability, because dangling symlinks fail that check while still needing deletion.

### 3. `skills env`

`skills env` should remain a declarative recorded-state view.

For each package, env output should continue to show:

- package name
- direct/transitive
- version
- exported skills
- recorded materialized runtime entries

It should not attempt to report live drift details. Its job is to answer:

- what agentpack believes is installed
- what runtime entries that recorded state owns

### 4. `skills status`

`skills status` should be the operational truth surface.

It should:

- degrade health when runtime drift exists
- distinguish dependency incompleteness from runtime materialization drift
- report orphaned materializations found under managed runtime roots
- give repair-oriented guidance without mutating state

Health should move to `attention-needed` when any installed package has drifted materializations.

### 5. `skills missing`

`skills missing` must stop treating exported sub-skills inside an installed multi-skill package as missing packages.

It should resolve `requires` against installed exported skill records, not just installed package names.

This means a requirement like `@alavida-ai/prd-development:proto-persona` is satisfied by the exported skill record inside installed package `@alavida-ai/prd-development`.

## Drift Taxonomy

The CLI should classify materialization drift explicitly.

Recommended codes:

- `missing_path` — recorded materialization path is absent
- `wrong_type` — path exists but is not a symlink
- `wrong_target` — symlink points to the wrong source skill directory
- `dangling_target` — symlink exists but its target is missing
- `orphaned_materialization` — path exists under `.claude/skills/` or `.agents/skills/` but is not owned by current install state

These codes are sufficient for v1. No extra taxonomy is needed yet.

## Read vs Write Commands

### Read commands

These commands must not mutate runtime state:

- `skills env`
- `skills status`
- `skills missing`

`skills env` should not inspect or report drift.

`skills status` may detect and report drift, but it must not silently repair it.

### Write commands

These commands may mutate runtime state:

- `skills install`
- `skills uninstall`

No dedicated `skills rebuild` command is required for v1 if reinstall already provides a clear repair path. A rebuild command can be added later only if repeated repair use cases justify it.

## Implementation Boundaries

This patch should change:

- install-state resolution for `missing/status`
- materialization verification logic
- status reporting
- uninstall cleanup logic
- regression coverage for runtime drift cases

This patch should not change:

- GitHub Packages auth fallback
- plugin packaging/runtime model
- authored-skill validation architecture
- package format or naming contract

## Recommended Verification

Automate the following runtime drift cases:

1. healthy multi-skill install
2. delete one recorded symlink
3. delete both recorded symlinks for one exported skill
4. replace a recorded symlink with a plain directory
5. retarget a recorded symlink to the wrong skill directory
6. remove the target skill directory in `node_modules`
7. remove the installed package directory in `node_modules`
8. delete `.agentpack/install.json`
9. delete one exported skill record from install state
10. delete one package record from install state
11. reinstall after each drift case
12. uninstall after each drift case

## Expected Outcome

After this patch:

- recorded state remains authoritative
- derived runtime state can drift without corrupting ownership semantics
- `skills env` stays declarative
- `skills status` tells the truth about runtime drift
- reinstall repairs drift deterministically
- uninstall removes recorded owned paths deterministically
- intra-package exported skill requirements no longer produce false missing errors
