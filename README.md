# agentpack

You already know the feeling:

- the skill worked in one repo, but now it is copied into three places
- a plugin depends on a skill, but nobody knows where that dependency truth lives
- the source knowledge changed, but the shipped skill never got updated
- the runtime still has a skill on disk, but nobody can tell whether it is current, stale, local, bundled, or installed transitively
- the agent "knows" something, but you no longer trust where that knowledge came from

That is the problem `agentpack` is for.

The core failure mode is lifecycle collapse. Most teams flatten four different artifact types into one fuzzy thing called "a skill":

- source knowledge
- compiled skill artifact
- runtime plugin
- installed environment state

Once those boundaries blur, everything gets worse:

- authors do not know what to update
- consumers do not know what to install
- plugins become hidden dependency containers
- agents end up running stale knowledge with no visible trust chain

`agentpack` gives those artifacts their own lifecycle again:

- source docs and knowledge files stay authoritative
- `SKILL.md` becomes the agent-facing artifact
- `package.json` becomes the distribution contract
- npm handles package resolution and versioning
- `agentpack` handles validation, staleness, local linking, install flow, and plugin bundling

This is for teams who want agent behavior to be packaged, inspectable, and updateable like software instead of copy-pasted prompt debris.

Docs: https://docs.alavida.ai

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
- hand-copy that skill into a plugin or repo
- lose track of what depends on what
- discover drift only when the agent produces the wrong output

`agentpack` gives you a real lifecycle instead:

1. Write and maintain source knowledge where your team already works.
2. Derive a skill artifact from that knowledge.
3. Validate it before release.
4. Link it locally for testing.
5. Publish it as a package.
6. Install or bundle it wherever it needs to run.

## What It Does

`agentpack` covers four practical workflows:

1. Author a packaged skill from source docs or knowledge files.
2. Validate that skill before release.
3. Link it locally into `.claude/skills/` and `.agents/skills/` for testing.
4. Bundle packaged skills into self-contained plugin artifacts.

## Quick Start

### Author and test a packaged skill

Run these commands from the repo that owns the source files referenced by `metadata.sources`:

```bash
agentpack skills inspect domains/operations/skills/agonda-prioritisation
agentpack skills validate domains/operations/skills/agonda-prioritisation
agentpack skills dev domains/operations/skills/agonda-prioritisation
```

Use `skills dev` when you want the skill linked into `.claude/skills/` and `.agents/skills/` for local runtime testing. It now also starts a localhost development workbench by default for one selected skill, showing immediate provenance sources, direct required skills, lifecycle state, and workbench actions such as validation and stale checks.

Pass `--no-dashboard` if you want the original CLI-only linking workflow without the local dashboard.

If your agent session was already running, start a fresh session after linking so the runtime can pick up the newly materialized skill.

### Install a published skill in another repo

```bash
agentpack skills install @scope/skill-package
agentpack skills env
```

### Build a plugin artifact

```bash
agentpack plugin inspect path/to/plugin
agentpack plugin validate path/to/plugin
agentpack plugin build path/to/plugin
```

`plugin inspect` and `plugin validate` now emit actionable structured diagnostics when a plugin target is missing required files such as `package.json` or `.claude-plugin/plugin.json`.

For watch mode during development:

```bash
agentpack plugin dev path/to/plugin
```

## The Model

The most important distinction in `agentpack` is lifecycle stage.

### Packaged skills

A packaged skill is a reusable capability artifact.

- `metadata.sources` track provenance
- `requires` define authored skill dependencies
- `package.json.dependencies` are the compiled mirror of `requires`
- it is self-contained at runtime, not a pointer back to source files

Typical local flow:

- `skills inspect`
- `skills validate`
- `skills dev`

### Consumer installs

Consumer repos do not author the skill. They install the published package and materialize it into agent-visible directories.

Typical consumer flow:

- `skills install`
- `skills env`

### Plugins

A plugin is a deployable runtime shell, not just another skill package.

Plugin-local skills can declare `requires` on packaged skills. `agentpack` can then build a self-contained plugin artifact that vendors those packaged dependencies.

Typical plugin flow:

- `plugin inspect`
- `plugin validate`
- `plugin build`
- `plugin dev`

## What Agentpack Refuses To Blur

These are deliberate boundaries:

- Knowledge is the source of truth.
- Skills are derived artifacts.
- Plugins are runtime shells.
- Installed state is repo-local runtime state.

If you blur those together, you get the exact problems this tool exists to stop:

- skills that silently depend on files they do not ship
- plugins that hide reusable capability dependencies
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

- `agentpack skills inspect`
- `agentpack skills validate`
- `agentpack skills dev`
- `agentpack skills unlink`
- `agentpack skills stale`
- `agentpack skills install`
- `agentpack skills env`
- `agentpack skills uninstall`
- `agentpack skills outdated`
- `agentpack skills dependencies`
- `agentpack skills registry`
- `agentpack skills status`
- `agentpack skills missing`
- `agentpack plugin inspect`
- `agentpack plugin validate`
- `agentpack plugin build`
- `agentpack plugin dev`

## Docs

Hosted docs: https://docs.alavida.ai

For a repo-local demo and manual testing target, initialize submodules and use [`sandbox/acme-demo/`](./sandbox/acme-demo).

```bash
git submodule update --init --recursive
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

Validate the shipped agent skill:

```bash
npm run intent:validate
```

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

- commit `.agentpack/build-state.json`
- commit `.agentpack/catalog.json`

In consumer/runtime repos:

- do not commit `.agentpack/install.json`

## License

MIT
