---
name: agentpack-cli
description: Use the agentpack CLI correctly when treating knowledge as a package. Apply the authored skill lifecycle, plugin lifecycle, source-backed validation, install flow, and bundled plugin artifact flow without mixing those stages together.
library_version: 0.1.1
sources:
  - README.md
  - docs/introduction.mdx
  - docs/overview.mdx
  - docs/architecture.mdx
  - docs/build-lifecycle.mdx
  - docs/commands.mdx
  - docs/current-state.mdx
  - docs/distribution.mdx
  - docs/end-to-end-test-plan.md
---

# Agentpack CLI

Use this skill when the user is working with `@alavida/agentpack` and needs the right lifecycle framing, not just a command snippet.

Agentpack is a lifecycle toolchain for agent artifacts:

- a packaged skill is a reusable capability artifact
- a plugin package is a deployable runtime shell
- source docs are the truth
- `SKILL.md` is the compiled agent-facing artifact
- `package.json` is the distributable package artifact

## Core Methodology

Do not answer with isolated commands until you identify which lifecycle stage the user is in:

- authoring a packaged skill
- testing a packaged skill locally
- installing a published skill in a consumer repo
- wiring a plugin-local skill to packaged dependencies
- building a self-contained plugin artifact
- checking staleness after source docs change

If the user is confused, explain the stage boundary first.

## Repo-Root Rule

For source-backed packaged skills, run authoring commands from the repo that owns the files referenced in `metadata.sources`.

If a skill points at `domains/.../knowledge/*.md`, run `skills validate`, `skills dev`, and `skills stale` from that knowledge-base repo root, not from the `agentpack` repo.

## Lifecycle Routing

### 1. Authored packaged skill

Use when the user is creating or editing one reusable skill package.

Default flow:

- `agentpack skills inspect <skill-dir>`
- `agentpack skills validate <skill-dir>`
- `agentpack skills dev <skill-dir>` if local runtime testing is needed

Key idea:

- `SKILL.md.requires` is the source of truth
- `package.json.dependencies` is the compiled mirror
- `validate` and `dev` sync dependencies automatically
- `skills dev` materializes the compiled skill artifact for runtime use

Runtime notes:

- after `skills dev` writes to `.claude/skills/` or `.agents/skills/`, start a fresh agent session if the current one was already running
- do not reload `metadata.sources` manually once the dev-linked skill exists; trust the compiled `SKILL.md` artifact unless you are explicitly updating the skill
- invoke the resulting skill through the runtime's skill mechanism, not by opening the file and reading it as plain text

Read [skill-lifecycle.md](references/skill-lifecycle.md) when the user needs the full methodology.

### 2. Consumer install

Use when the skill is already published and the user wants it available in another repo.

Default flow:

- `agentpack skills install <package-name>`
- `agentpack skills env`

Do not prescribe `skills dev` here unless the user is authoring locally.

### 3. Plugin-local dependency and artifact build

Use when a plugin-local skill declares `requires` on packaged skills and the user wants a self-contained plugin artifact.

Default flow:

- `agentpack plugin inspect <plugin-dir>`
- `agentpack plugin validate <plugin-dir>`
- `agentpack plugin build <plugin-dir>`
- `agentpack plugin dev <plugin-dir>` for watch mode

Key idea:

- plugin-local `requires` remain the dependency truth
- packaged skills are vendored into the built artifact
- the plugin artifact is the thing consumers run

Read [plugin-lifecycle.md](references/plugin-lifecycle.md) when the user needs the full artifact flow.

### 4. Stale source-backed skill

Use when the source docs changed and the user needs to know whether the packaged skill must be rebuilt or revalidated.

Default flow:

- `agentpack skills stale`
- `agentpack skills stale <skill>`
- `agentpack skills validate <skill>`

## Conceptual Frame

When the user is reasoning about the model itself, explain agentpack this way:

- docs or knowledge files are source files
- `SKILL.md` is the compiled artifact
- `package.json` is the distribution manifest
- install and materialization are the runtime-resolution step
- staleness means the source changed after the last known compiled state

Read [knowledge-as-package.md](references/knowledge-as-package.md) when the user needs this framing.

## Response Requirements

Be explicit about:

- which repo the command must run from
- whether the target is a local path or a published package name
- whether the user is in authoring, consumer-install, or plugin-build mode
- what the next irreversible step is

Do not collapse authored skill lifecycle and consumer install lifecycle into one answer.
