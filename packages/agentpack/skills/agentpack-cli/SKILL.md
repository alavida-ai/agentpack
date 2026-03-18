---
name: agentpack-cli
description: Use the agentpack CLI correctly when treating knowledge as a package. Apply the authored skill lifecycle, compiler/materialization workflow, source-backed validation, install flow, and runtime state model without mixing those stages together.
library_version: 0.1.10
---

```agentpack
source readme = "README.md"
source quickstart = "docs/quickstart.mdx"
source dependenciesGuide = "docs/skill-graph.mdx"
source schemaGuide = "docs/schema-skill-md.mdx"
source lifecycleGuide = "docs/how-it-works.mdx"
source docsAsSources = "docs/docs-as-sources.mdx"
source dashboardGuide = "docs/dashboard.mdx"
```

# Agentpack CLI

Use this skill when the user is working with `@alavida/agentpack` and needs the right lifecycle framing, not just a command snippet.

Agentpack is a lifecycle toolchain for agent artifacts:

- a package is the distribution unit
- an exported skill is the runtime module unit
- runtime adapters materialize compiled skills for a target environment
- source docs are the truth
- `SKILL.md` is the compiled agent-facing artifact
- `package.json` is the distributable package artifact

## Core Methodology

Do not answer with isolated commands until you identify which lifecycle stage the user is in:

- authoring a packaged skill
- testing a packaged skill locally
- installing a published skill in a consumer repo
- building a compiled skill artifact
- materializing that artifact into runtime directories
- checking staleness after source docs change

If the user is confused, explain the stage boundary first.

## Repo-Root Rule

For source-backed packaged skills, run authoring commands from the repo that owns the files referenced in the `agentpack` source bindings.

If a skill points at `domains/.../knowledge/*.md`, run `publish validate`, `author dev`, and `author stale` from that knowledge-base repo root, not from the `agentpack` repo.

## Lifecycle Routing

### 1. Authored packaged skill

Use when the user is creating or editing one packaged skill module or a package that exports several skill modules.

Default flow:

- `agentpack author inspect <target>`
- `agentpack publish validate <target>`
- `agentpack author dev <target>` if local runtime testing is needed
- `agentpack author dev --no-dashboard <target>` if the user wants to skip the local workbench

Key idea:

- root `SKILL.md` is the primary export; `skills/**/SKILL.md` provides named exports
- `import ... from skill "@scope/package"` is the source of truth for skill-to-skill edges
- `package.json.dependencies` is the managed cross-package mirror
- `publish validate` and `author dev` sync dependencies automatically
- `author build` and compiler-mode `publish validate` update `.agentpack/compiled.json`
- `author dev` materializes the compiled skill artifact for runtime use

Persistence rule:

- commit `.agentpack/compiled.json` when you want compiled semantic state reviewed or shared
- do not commit `.agentpack/install.json`
- do not commit `.agentpack/dev-session.json`
- do not commit `.agentpack/materialization-state.json`
- commit `skills/sync-state.json` when maintaining the shipped Intent skills for this package

Runtime notes:

- after `author dev` writes to `.claude/skills/` or `.agents/skills/`, start a fresh agent session if the current one was already running
- `author dev` starts a localhost workbench by default for one selected exported skill, with provenance edges, internal module edges, cross-package dependency edges, and actions like validate or stale checks
- `author dev` records the active session in `.agentpack/dev-session.json` so the next run can clean up stale runtime links after abnormal termination
- if a stale local dev session blocks startup, use `agentpack author dev cleanup` and escalate to `agentpack author dev cleanup --force` only when the recorded pid is a false positive
- use `agentpack author unlink <root> --recursive` when you need to remove one active dev root plus its transitive local runtime links
- do not manually reconstruct source provenance from prose once the dev-linked skill exists; trust the compiled `SKILL.md` artifact unless you are explicitly updating the skill
- invoke the resulting skill through the runtime's skill mechanism, not by opening the file and reading it as plain text

Read [skill-lifecycle.md](references/skill-lifecycle.md) when the user needs the full methodology.

### 2. Consumer install

Use when the skill is already published and the user wants it available in another repo.

Default flow:

- `npm install <package-name>`
- `agentpack materialize`
- `agentpack skills list`

Do not prescribe `author dev` here unless the user is authoring locally.

### 3. Compiled build and runtime materialization

Use when the user wants a canonical compiled artifact or needs runtime outputs refreshed from that artifact.

Default flow:

- `agentpack author build <target>`
- `agentpack author materialize`
- `agentpack author dev <target>` for local watch mode and the workbench

Key idea:

- `.agentpack/compiled.json` is the semantic source of truth
- `.agentpack/materialization-state.json` records emitted adapter outputs
- runtime directories are outputs, not semantic truth

### 4. Stale source-backed skill

Use when the source docs changed and the user needs to know whether the packaged skill must be rebuilt or revalidated.

Default flow:

- `agentpack author stale`
- `agentpack author stale <target>`
- `agentpack publish validate <target>`

Key idea:

- `author stale` compares current source hashes to the last known compiled state
- the canonical authored path is `.agentpack/compiled.json`

## Conceptual Frame

When the user is reasoning about the model itself, explain agentpack this way:

- docs or knowledge files are source files
- `SKILL.md` is the compiled artifact
- `package.json` is the package manifest and discovery config
- canonical skill ids look like `@scope/package:skill-name`
- install and materialization are the runtime-resolution step
- staleness means the source changed after the last known compiled state

Read [knowledge-as-package.md](references/knowledge-as-package.md) when the user needs this framing.

## Response Requirements

Be explicit about:

- which repo the command must run from
- whether the target is a local path or a published package name
- whether the user is in authoring, consumer-install, or compiler/materialization mode
- what the next irreversible step is

Do not collapse authored skill lifecycle and consumer install lifecycle into one answer.

## Semantic References

Ground lifecycle explanations in [the README](source:readme){context="high-level product framing, command surface, and current development workflow"}.

Use [the quickstart guide](source:quickstart){context="source of truth for the minimal compiler-mode package layout and dev workflow"}.

Use [the skill dependencies guide](source:dependenciesGuide){context="source of truth for compiler-mode skill imports and package dependency mirroring"}.

Use [the SKILL.md schema guide](source:schemaGuide){context="source of truth for compiler-mode frontmatter, agentpack declarations, and contextual body references"}.

Use [the lifecycle guide](source:lifecycleGuide){context="source of truth for the compiled artifact model and lifecycle boundaries"}.

Use [the docs-as-sources guide](source:docsAsSources){context="source of truth for source-backed skills and stale detection framing"}.

Use [the dashboard guide](source:dashboardGuide){context="source of truth for the local workbench and graph visualization behavior"}.
