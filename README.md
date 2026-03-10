# agentpack

Package-backed runtime and packaging CLI for agent skills and plugins.

If you use an AI coding agent and install this package in another repo, run:

```bash
npx @tanstack/intent@latest install
```

This lets the agent discover the packaged `agentpack` usage skill shipped with the npm package.

Use the TanStack Intent CLI directly. This package ships `skills/`, but it does not replace the upstream `intent` command.

The implemented CLI now goes beyond the original install-only slice. This repo supports packaged-skill authoring, local dev linking, plugin validation, and bundled plugin artifact builds.

## Current Direction

- `skill = package`
- npm resolves dependencies and versions
- `SKILL.md` owns authored skill metadata
- `package.json` owns package and distribution metadata
- plugin packages can vendor standalone skill packages into self-contained plugin artifacts
- agentpack owns install state, materialization, and plugin bundling validation
- private package distribution targets GitHub Packages first

## Current Implementation

Implemented command families:

- `skills inspect`
- `skills validate`
- `skills dev`
- `skills unlink`
- `skills stale`
- `skills install`
- `skills env`
- `skills uninstall` is implemented as the reconciliation counterpart to install
- `skills outdated`
- `skills dependencies`
- `skills registry`
- `skills status`
- `skills missing`
- `plugin inspect` is implemented for plugin bundle graph inspection
- `plugin validate` is implemented for plugin bundle contract validation
- `plugin build`
- `plugin dev`
- authored lifecycle metadata supports `metadata.status`, `metadata.replacement`, and `metadata.message`
- internal generation of `.agentpack/catalog.json` and `.agentpack/build-state.json` is implemented
- live validation is scripted in `scripts/live-validation.mjs`

## Quick Start

In the repo that owns a packaged skill and its source docs:

```bash
agentpack skills inspect domains/operations/skills/agonda-prioritisation
agentpack skills validate domains/operations/skills/agonda-prioritisation
agentpack skills dev domains/operations/skills/agonda-prioritisation
```

In a consumer repo:

```bash
agentpack skills install @alavida-ai/agonda-prioritisation
agentpack skills env
```

For plugins:

```bash
agentpack plugin inspect path/to/plugin
agentpack plugin validate path/to/plugin
agentpack plugin build path/to/plugin
agentpack plugin dev path/to/plugin
```

## Docs

Documentation is powered by [Mintlify](https://mintlify.com). To preview locally:

```bash
npm i -g mint
cd docs
mint dev
```

Then open http://localhost:3000.

See `docs/` for all documentation source files (`.mdx`).

And for the hard human-run end-to-end scenarios:

- `LIVE-TEST.md`

## Metadata Policy

In the authoring repo:

- commit `.agentpack/build-state.json`
- commit `.agentpack/catalog.json`

In consumer or runtime repos:

- do not commit `.agentpack/install.json`

## Source-Backed Skills

`metadata.sources` are resolved relative to the current repo root. If a packaged skill points at files in your knowledge-base repo, run `skills validate`, `skills dev`, and `skills stale` from that repo, not from the `agentpack` repo.
