# Skills Dev Session Cleanup Design

**Date:** 2026-03-12

## Goal

Make `agentpack skills dev` recoverable and maintainable by giving dev-linked runtime state an explicit owner, durable session metadata, and a deterministic cleanup path after abnormal termination.

## Problem

`skills dev` currently materializes symlinks into `.claude/skills/` and `.agents/skills/` and relies on the live process to remember what it linked.

That creates two failures:

- if the process is killed badly, links remain on disk with no durable ownership record
- `skills unlink <name>` can only remove one named link, not the transitive dependency graph that a dev session materialized

The current model treats repo-visible runtime state as a side effect of a live process rather than a first-class lifecycle artifact.

## Desired Outcome

`skills dev` should behave like a recoverable dev environment rather than a fragile watch process.

The system should:

- allow only one active `skills dev` session per repo
- persist exactly which links that session created
- reconcile stale sessions automatically before starting a new one
- provide an explicit manual cleanup command
- support recursive unlink for the active dev root
- keep signal handlers as best-effort optimization rather than the correctness boundary

## Design Summary

Introduce a single repo-local session record:

- path: `.agentpack/dev-session.json`
- scope: one active `skills dev` session per repo
- ownership: the `skills dev` session lifecycle in `src/lib/skills.js`

This file records:

- session id
- root target and root skill name
- repo root
- pid
- startedAt / updatedAt
- status: `active`, `cleaning`, `cleaned`, or `stale`
- linked skills
- materialized link paths

With this record in place, cleanup no longer depends on in-memory `currentNames` alone.

## Architecture Fit

### Command layer

[`src/commands/skills.js`](/Users/alexandergirardet/alavida/agentpack/.worktrees/issue-9-skills-dev-cleanup/src/commands/skills.js) should remain a thin adapter.

It should:

- call `startSkillDev`
- expose `skills dev cleanup`
- expose recursive unlink behavior

It should not own process cleanup policy directly beyond delegating to the session object.

### Session lifecycle layer

[`src/lib/skills.js`](/Users/alexandergirardet/alavida/agentpack/.worktrees/issue-9-skills-dev-cleanup/src/lib/skills.js) should own:

- startup reconciliation
- single-session conflict checks
- session record creation and updates
- shutdown cleanup
- recursive unlink behavior for the active session root

This is the domain-adjacent lifecycle coordinator for `skills dev`.

### Infrastructure layer

[`src/infrastructure/runtime/materialize-skills.js`](/Users/alexandergirardet/alavida/agentpack/.worktrees/issue-9-skills-dev-cleanup/src/infrastructure/runtime/materialize-skills.js) should continue to own only filesystem effects:

- create symlinks
- remove symlinks

It should not infer session ownership.

Add a new persistence module:

- `src/infrastructure/fs/dev-session-repository.js`

It should own:

- read session record
- write session record
- delete session record

## State Model

The repo has one session file with these states:

1. `active`
   The process is expected to be alive and owns the listed links.

2. `cleaning`
   Cleanup has started and the record should be treated as authoritative until either cleanup finishes or a later reconcile repairs it.

3. `cleaned`
   Cleanup completed. This may be written briefly before deleting the file, or omitted if deletion happens immediately.

4. `stale`
   A later command found the session record but the owning process was no longer alive.

## Startup Flow

When `skills dev` starts:

1. Read `.agentpack/dev-session.json` if present.
2. If no session exists, continue.
3. If session exists and pid is alive, fail with a clear error.
4. If session exists and pid is dead, mark it stale and remove all recorded links.
5. Delete the stale session record.
6. Create a new active session record.
7. Materialize links and update the record with the exact paths created.

This makes restart reconciliation part of the normal lifecycle.

## Shutdown Flow

When the dev session closes normally:

1. Mark the session `cleaning`.
2. Remove the exact recorded links from the session record.
3. Close watcher and workbench resources.
4. Delete the session file.

If shutdown is interrupted partway through, the next startup reconcile reuses the remaining session record to finish cleanup.

## Manual Cleanup

Add:

- `agentpack skills dev cleanup`

Behavior:

- if no session file exists, report that there is no active or stale dev session
- if session file exists and pid is dead, remove recorded links and delete the file
- if session file exists and pid is alive, fail clearly unless a future `--force` is added

This gives agents an explicit recovery command without making normal use depend on it.

## Recursive Unlink

Add:

- `agentpack skills unlink <name> --recursive`

V1 behavior:

- if `<name>` is the active or stale dev-session root, remove all links recorded in the session file and delete the session
- if `<name>` is not the session root, fail clearly and explain that recursive unlink only works for the active dev-session root in v1
- without `--recursive`, preserve current single-link behavior

This keeps the first version simple and deterministic.

## Active Session Conflict

Only one active `skills dev` session is allowed per repo.

If a live session already exists, `skills dev` should fail and tell the caller:

- which root is active
- the pid
- when it started
- to stop the existing process or run `agentpack skills dev cleanup` if the session is stale

This is safer than auto-killing another session.

The failure should use the CLI's existing structured error shape rather than freeform output.

Use `AgentpackError` with machine-readable details and `nextSteps`, so agent callers receive explicit recovery guidance in both text and JSON modes.

Representative `nextSteps`:

- `Run: agentpack skills dev cleanup`
- `Stop the active skills dev process, then rerun your command`
- `Inspect the active session root and pid in .agentpack/dev-session.json`

## Data Shape

Suggested JSON shape:

```json
{
  "version": 1,
  "session_id": "dev-2026-03-12T12-34-56-789Z",
  "status": "active",
  "pid": 12345,
  "repo_root": "/path/to/repo",
  "target": "skills/prd-development",
  "root_skill": {
    "name": "prd-development",
    "package_name": "@alavida/prd-development",
    "path": "skills/prd-development"
  },
  "linked_skills": [
    {
      "name": "prd-development",
      "package_name": "@alavida/prd-development",
      "path": "skills/prd-development"
    }
  ],
  "links": [
    ".claude/skills/prd-development",
    ".agents/skills/prd-development"
  ],
  "started_at": "2026-03-12T12:34:56.789Z",
  "updated_at": "2026-03-12T12:34:56.789Z"
}
```

Use repo-relative link paths where possible so the file remains portable within the repo.

## Why This Is Maintainable

This design adds one missing concept without reshaping the rest of the CLI:

- commands stay thin
- materialization stays dumb
- session lifecycle gets a clear owner
- runtime state gains durable provenance

It also fits the current CLI contract by keeping operator guidance in structured `nextSteps` instead of scattering custom prose through command handlers.

It also creates a clean path for future improvements without forcing them now:

- `skills dev cleanup --force`
- richer diagnostics in `skills status`
- multiple-session support with a registry if product needs change later

## Alternatives Considered

### More signal handlers

Rejected.

This patches one exit path at a time but does not solve abnormal termination or transitive cleanup after the original process is gone.

### Multi-session registry with reference counting

Rejected for v1.

This would solve concurrent ownership but adds real complexity before the product needs it. One active session per repo is simpler and matches the current use case.

### No persistence, just `unlink --recursive`

Rejected.

This would still fail after abnormal termination because the CLI would have no durable record of which transitive links were created together.

## Testing Strategy

Add integration tests for:

- startup cleans a stale dev-session record and removes recorded links
- startup refuses when an active pid is still alive
- normal shutdown removes links and deletes the session file
- `skills dev cleanup` removes stale session links
- `skills unlink --recursive` removes the active session root plus transitive links
- non-recursive unlink preserves current behavior

Add focused unit tests for the session repository helpers if needed.
