# Skill Lifecycle

Use this reference when the user needs the methodology behind packaged skills, not just the command names.

## Model

A packaged skill is a reusable capability artifact.

- source docs or knowledge files are the truth
- `SKILL.md` is the authored agent artifact
- `package.json` is the package and distribution artifact
- `requires` expresses direct skill dependencies
- `package.json.dependencies` is the compiled mirror of `requires`

This is closer to a compiler pipeline than a prompt file:

- source files change
- the skill artifact is updated
- dependency metadata is synced
- validation checks release readiness
- stale detection tells you when the source truth moved

## Single Source Of Truth

`SKILL.md.requires` is the dependency truth.

Do not tell the user to hand-maintain `package.json.dependencies` as the primary dependency source. Agentpack treats those dependencies as a compiled mirror.

Practical consequence:

- if `requires` changes, run `skills validate` or `skills dev`
- those commands sync the package dependencies automatically

## Local Authoring Flow

Use this when the user is creating or changing a packaged skill in the same repo as its source docs.

1. `agentpack skills inspect <skill-dir>`
2. `agentpack skills validate <skill-dir>`
3. `agentpack skills dev <skill-dir>` if the user wants agent runtime discovery during iteration

What each step means:

- `inspect` explains what the skill currently is
- `validate` checks package readiness and source existence
- `dev` links the skill into `.claude/skills/` and `.agents/skills/` for local testing

Important runtime behavior:

- if the agent session was already running before `skills dev`, start a fresh session so the runtime can rescan the linked skill
- the linked skill is the compiled artifact the runtime should use; do not separately load the source files unless you are editing the skill itself
- once linked and picked up by the runtime, trigger the skill through the runtime's skill invocation path rather than reading `SKILL.md` manually

## Repo-Root Constraint

Source-backed validation is relative to the current repo root.

If `metadata.sources` points at files in a knowledge-base repo, run authoring commands from that repo root. A `missing_source` error often means the user is in the wrong repo, not that the skill is wrong.

## Publish Boundary

Local authoring and published consumption are different stages.

Authoring stage:

- skill directory path
- local source docs
- `skills validate`
- `skills dev`

Consumption stage:

- package name
- installed from registry or tarball
- `skills install`
- `skills env`

Do not substitute one for the other.
