# agentpack

`agentpack` is a CLI for treating agent skills as real packages.

It gives you a workflow for:

- authoring source-backed skills
- validating skill packages before release
- dev-linking skills into `.claude/skills/` and `.agents/skills/`
- installing published skills into consumer repos
- building self-contained plugin artifacts that vendor packaged skills

## Why

Most agent workflows stop at "write a `SKILL.md` file somewhere".

`agentpack` takes the next step:

- source docs stay the truth
- `SKILL.md` is the compiled agent-facing artifact
- `package.json` is the distribution manifest
- npm handles package resolution
- `agentpack` handles validation, staleness, materialization, and plugin bundling

In short: knowledge as package, not just knowledge as prompt.

## Install

Global CLI:

```bash
npm install -g @alavida-ai/agentpack
```

Or use it without a global install:

```bash
npx @alavida-ai/agentpack --help
```

## Quick Start

### Author a packaged skill

In the repo that owns the source docs:

```bash
agentpack skills inspect domains/operations/skills/agonda-prioritisation
agentpack skills validate domains/operations/skills/agonda-prioritisation
agentpack skills dev domains/operations/skills/agonda-prioritisation
```

Use `skills dev` when you want the skill linked into `.claude/skills/` and `.agents/skills/` for local runtime testing.

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

Use watch mode during iteration:

```bash
agentpack plugin dev path/to/plugin
```

## Core Model

`agentpack` works best if you keep these boundaries clear:

- packaged skill = reusable capability artifact
- plugin = deployable runtime shell
- `metadata.sources` = provenance and stale-check inputs
- `requires` = authored dependency truth
- `package.json.dependencies` = compiled dependency mirror

This means:

- local authoring uses `skills validate` and `skills dev`
- consumer installation uses `skills install`
- plugin delivery uses `plugin validate`, `plugin build`, and `plugin dev`

## Source-Backed Skills

For packaged skills with `metadata.sources`, run authoring commands from the repo that owns those source files.

If a skill points at `domains/.../knowledge/*.md`, run:

- `agentpack skills validate`
- `agentpack skills dev`
- `agentpack skills stale`

from that knowledge-base repo root, not from the `agentpack` repo.

## Intent Integration

This package also ships an Intent skill under `skills/agentpack-cli/`.

That skill is for coding agents using [TanStack Intent](https://tanstack.com/intent/latest): it teaches the agent how to use `agentpack` correctly and how to distinguish:

- authored skill lifecycle
- consumer install lifecycle
- plugin build lifecycle
- source-backed staleness flow

If your repo uses Intent, install the mapping helper:

```bash
npx @tanstack/intent@latest install
```

Then map the shipped skill from:

```text
node_modules/@alavida-ai/agentpack/skills/agentpack-cli/SKILL.md
```

`agentpack` does not replace the upstream `intent` CLI. It only ships a library skill for it.

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

## Documentation

Docs live in [`docs/`](./docs).

To preview them locally with Mintlify:

```bash
npm i -g mint
cd docs
mint dev
```

Then open `http://localhost:3000`.

## Development

Run the full test suite:

```bash
npm test
```

Validate the shipped Intent skill:

```bash
npm run intent:validate
```

## Metadata Policy

In authoring repos:

- commit `.agentpack/build-state.json`
- commit `.agentpack/catalog.json`

In consumer/runtime repos:

- do not commit `.agentpack/install.json`

## License

MIT
