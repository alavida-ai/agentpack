# Skill Lifecycle

Use this reference when the user needs the methodology behind packaged skills, not just the command names.

## Model

A packaged skill is a reusable capability artifact.

- source docs or knowledge files are the truth
- `SKILL.md` is the authored agent artifact for one exported skill module
- `package.json` is the package and distribution artifact
- root `SKILL.md` is the primary export; `agentpack.root` declares the directory for named exports
- `import ... from skill` declarations express direct skill dependencies using canonical ids like `@scope/package:skill-name`
- `package.json.dependencies` is the managed cross-package mirror of skill import declarations

This is closer to a compiler pipeline than a prompt file:

- source files change
- the skill artifact is updated
- dependency metadata is synced
- validation checks release readiness
- stale detection tells you when the source truth moved

## Single Source Of Truth

The `import ... from skill` declarations in the agentpack block are the dependency truth for skill-to-skill edges.

Do not tell the user to hand-maintain `package.json.dependencies` as the primary dependency source. Agentpack treats those dependencies as a compiled package-level mirror for cross-package references.

Practical consequence:

- if skill import declarations change, run `publish validate` or `author dev`
- those commands sync cross-package package dependencies automatically
- same-package module references do not create package dependency entries

## Local Authoring Flow

Use this when the user is creating or changing a packaged skill in the same repo as its source docs.

1. `agentpack author inspect <target>`
2. `agentpack publish validate <target>`
3. `agentpack author dev <target>` if the user wants agent runtime discovery during iteration

What each step means:

- `inspect` explains what the skill currently is
- `publish validate` checks package readiness, source existence, canonical dependency resolution, and records the validated source snapshot in `.agentpack/compiled.json`
- `author dev` links the skill into `.claude/skills/` and `.agents/skills/` for local testing

Important persistence behavior:

- commit `.agentpack/compiled.json` if you want `author stale` to work across GitHub, CI, and teammate machines
- do not commit `.agentpack/install.json` (enabled-target state, repo-specific)

Important runtime behavior:

- if the agent session was already running before `author dev`, start a fresh session so the runtime can rescan the linked skill
- the linked skill is the compiled artifact the runtime should use; do not separately load the source files unless you are editing the skill itself
- once linked and picked up by the runtime, trigger the skill through the runtime's skill invocation path rather than reading `SKILL.md` manually

## Repo-Root Constraint

Source-backed validation is relative to the current repo root.

If source bindings point at files in a knowledge-base repo, run authoring commands from that repo root. A `missing_source` error often means the user is in the wrong repo, not that the skill is wrong.

## Publish Boundary

Local authoring and published consumption are different stages.

Authoring stage:

- skill directory path
- local source docs
- `publish validate`
- `author dev`

Consumption stage:

- package name
- installed from registry via npm
- `skills list`
- `skills enable`

Do not substitute one for the other.

## Stale Detection Contract

`author stale` is not comparing against memory or local runtime state.

It compares current source hashes against the last validated snapshot recorded in `.agentpack/compiled.json`.

That means:

1. run `agentpack publish validate <skill-dir>`
2. commit the updated `.agentpack/compiled.json`
3. later source changes can be detected by `agentpack author stale`

If the compiled state file is not committed, stale detection will only work on the machine where validation was last run.
