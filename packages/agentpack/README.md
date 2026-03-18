# agentpack

You already know the feeling:

- the skill worked in one repo, but now it is copied into three places
- a runtime has a skill on disk, but nobody knows which compiled artifact produced it
- the source knowledge changed, but the shipped skill never got updated
- the runtime still has a skill on disk, but nobody can tell whether it is current, stale, local, bundled, or installed transitively
- the agent "knows" something, but you no longer trust where that knowledge came from

That is the problem `agentpack` is for.

The core failure mode is lifecycle collapse. Most teams flatten four different artifact types into one fuzzy thing called "a skill":

- source knowledge
- compiled skill artifact
- runtime materialization
- installed environment state

Once those boundaries blur, everything gets worse:

- authors do not know what to update
- consumers do not know what to install
- runtimes drift from the last known compiled state
- agents end up running stale knowledge with no visible trust chain

`agentpack` gives those artifacts their own lifecycle again:

- source docs and knowledge files stay authoritative
- `SKILL.md` becomes the agent-facing artifact
- `package.json` becomes the distribution contract
- npm handles package resolution and versioning
- `agentpack` handles compilation, validation, staleness, local linking, install flow, and runtime materialization

This is for teams who want agent behavior to be packaged, inspectable, and updateable like software instead of copy-pasted prompt debris.

Docs: https://docs.alavida.ai

## Development

For stateful behavior changes, run the formal model checks first:

```bash
npm run test:models
```

This bootstraps `tla2tools.jar` into `.cache/tla/` and runs the current models in `tla/`.

## Install

```bash
npm install -g @alavida/agentpack
```

Or without a global install:

```bash
npx @alavida/agentpack --help
```

## Why It Exists

Most agent workflows still look like this:

- write source knowledge in one place
- hand-copy some of it into a skill
- hand-copy that skill into another repo or runtime
- lose track of what depends on what
- discover drift only when the agent produces the wrong output

`agentpack` gives you a real lifecycle instead:

1. Write and maintain source knowledge where your team already works.
2. Derive a skill artifact from that knowledge.
3. Validate it before release.
4. Link it locally for testing.
5. Publish it as a package.
6. Install and materialize it wherever it needs to run.

## What It Does

`agentpack` covers four practical workflows:

1. Author a packaged skill from source docs or knowledge files.
2. Validate that skill before release.
3. Compile it into `.agentpack/compiled.json`.
4. Materialize it into `.claude/skills/` and `.agents/skills/` for testing or consumption.

## Quick Start

### Author and test a packaged skill

Run these commands from the repo that owns the source files bound in the skill's `agentpack` block:

```bash
agentpack author inspect domains/operations/skills/agonda-prioritisation
agentpack publish validate domains/operations/skills/agonda-prioritisation
agentpack author dev domains/operations/skills/agonda-prioritisation
```

Use `author dev` when you want the skill linked into `.claude/skills/` and `.agents/skills/` for local runtime testing. It now also starts a localhost development workbench by default for one selected skill, showing immediate provenance sources, direct required skills, lifecycle state, and workbench actions such as validation and stale checks.

Pass `--no-dashboard` if you want the original CLI-only linking workflow without the local dashboard.

If your agent session was already running, start a fresh session after linking so the runtime can pick up the newly materialized skill.

### Install a published skill in another repo

```bash
npm install @scope/skill-package
agentpack materialize
```

### Build and materialize a compiled skill

```bash
agentpack author build path/to/skill
agentpack author materialize
```

`author build` produces `.agentpack/compiled.json`. `author materialize` records adapter output ownership in `.agentpack/materialization-state.json`.

## The Model

The most important distinction in `agentpack` is lifecycle stage.

### Packaged skills

A packaged skill is a reusable capability artifact.

- `source ... = "repo/path"` bindings track provenance
- `import ... from skill "@scope/package"` defines skill dependencies
- `package.json.dependencies` are the package-level mirror for cross-package skill imports
- it is self-contained at runtime, not a pointer back to source files

Typical local flow:

- `author inspect`
- `publish validate`
- `author dev`

### Consumer installs

Consumer repos do not author the skill. They install the published package and materialize it into agent-visible directories.

Typical consumer flow:

- `npm install @scope/skill-package`
- `agentpack materialize`
- `agentpack skills list`

## What Agentpack Refuses To Blur

These are deliberate boundaries:

- Knowledge is the source of truth.
- Skills are derived artifacts.
- Runtime adapters materialize compiled skills.
- Installed state is repo-local runtime state.

If you blur those together, you get the exact problems this tool exists to stop:

- skills that silently depend on files they do not ship
- runtimes that cannot explain why a skill is present
- repos that cannot explain why a skill is present
- updates that change behavior without an explicit review step

## Knowledge As A Package

`agentpack` works best when you treat knowledge like software:

- the source files explain the methodology or domain truth
- the skill is the compiled agent-facing artifact
- package metadata defines how the capability is distributed
- validation and stale checks stop the artifact drifting from its sources

That lets you manage agent behavior with the same discipline you already apply to code.

## Source-Backed Skills

For source-backed skills, run authoring commands from the repo that owns the source files.

If a skill points at `domains/.../knowledge/*.md`, run:

- `agentpack skills validate`
- `agentpack skills dev`
- `agentpack skills stale`

from that knowledge-base repo root, not from the `agentpack` repo.

## Commands

Implemented today:

- `agentpack author inspect`
- `agentpack author dev`
- `agentpack author unlink`
- `agentpack author stale`
- `agentpack author build`
- `agentpack author materialize`
- `agentpack publish validate`
- `agentpack materialize`
- `agentpack skills list`
- `agentpack skills enable`
- `agentpack skills disable`
- `agentpack skills status`

## Docs

Hosted docs: https://docs.alavida.ai

Run the live downstream smoke harness against the isolated `agonda` and `superpowers` sandboxes with:

```bash
npm run test:sandboxes
```

Docs source: [`docs/`](./docs)

For local docs preview as a contributor:

```bash
npm i -g mint
cd docs
mint dev
```

## Development

Run the full test suite:

```bash
npm test
```

Run the live sandbox harness:

```bash
npm run test:sandboxes
```

Validate the shipped agent skill:

```bash
npm run intent:validate
```

## Releases

This repo now uses Changesets for versioning and publishing.

Normal maintainer flow:

1. Add a changeset in any PR that changes user-facing behavior.
2. Merge the feature PR to `main`.
3. Let GitHub open or update the `Version Packages` release PR.
4. Review and merge that release PR.
5. The merge publishes to npm automatically.

Useful local commands:

```bash
npx changeset
```

Manual git tags are no longer the normal release path.

## Optional Agent Integration

This package also ships an agent-facing skill under:

```text
node_modules/@alavida/agentpack/skills/agentpack-cli/SKILL.md
```

Consumers can use TanStack Intent in their repos to map that shipped skill into their agent workflow so the agent knows how to use `agentpack` correctly.

This is recommended if you want downstream coding agents to follow the right `agentpack` lifecycle automatically.

It is still optional. You do not need Intent to install or run the CLI itself.

## Metadata Policy

In authoring repos:

- commit `.agentpack/compiled.json` when you want compiled semantic state reviewed or shared
- compiled state is the only semantic source of truth
- commit `skills/sync-state.json` when maintaining shipped Intent skills

In consumer/runtime repos:

- do not commit `.agentpack/install.json`
- do not commit `.agentpack/dev-session.json`
- do not commit `.agentpack/materialization-state.json`

## License

MIT
