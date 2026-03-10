# agentpack

Your docs are good. Your agent still gets the tool wrong.

That gap is what `agentpack` fixes.

If you are shipping a library, a plugin, or a repo full of domain knowledge, the problem is not usually missing documentation. The problem is that the knowledge your team already has does not travel to agents in a versioned, testable, installable form. Docs are written for humans. Types validate calls, not intent. Prompt snippets rot. Community rules files drift. Agents end up guessing.

`agentpack` turns knowledge into a package lifecycle:

- source docs and knowledge files stay authoritative
- `SKILL.md` becomes the agent-facing artifact
- `package.json` becomes the distribution contract
- npm handles package resolution and versioning
- `agentpack` handles validation, staleness, local linking, install flow, and plugin bundling

This is for teams who want the agent to use the installed version of the tool, not whatever pattern it half-remembers from old training data.

Docs: https://docs.alavida.ai

## Install

```bash
npm install -g @alavida-ai/agentpack
```

Or without a global install:

```bash
npx @alavida-ai/agentpack --help
```

## Why It Exists

Most agent workflows today still look like this:

- copy a rules file from some repo
- paste it into `CLAUDE.md` or `.cursorrules`
- hope it matches the version you have installed
- discover drift only when the agent writes subtly wrong code

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

Use `skills dev` when you want the skill linked into `.claude/skills/` and `.agents/skills/` for local runtime testing.

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
node_modules/@alavida-ai/agentpack/skills/agentpack-cli/SKILL.md
```

If your repo uses TanStack Intent, you can map that shipped skill into your agent workflow so the agent knows how to use `agentpack` correctly inside downstream repos. This is optional. It is not required to use the CLI.

## Metadata Policy

In authoring repos:

- commit `.agentpack/build-state.json`
- commit `.agentpack/catalog.json`

In consumer/runtime repos:

- do not commit `.agentpack/install.json`

## License

MIT
