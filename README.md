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
- npm handles package resolution, versioning, install, uninstall, auth, and registry
- `agentpack` handles authoring, compilation, validation, staleness, and portable bundle generation

This is for teams who want agent behavior to be packaged, inspectable, and updateable like software instead of copy-pasted prompt debris.

Docs: https://docs.alavida.ai

## Development

Formal state-machine checks are part of the development workflow for install, dev-session, and staleness behavior.

Run them with:

```bash
npm run test:models
```

The script bootstraps `tla2tools.jar` into `.cache/tla/` automatically and then runs the three current models in `tla/`.

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
4. Build a portable bundle for plugins or SkillKit.
5. Publish it as a package.
6. Install it downstream with plugins or SkillKit.

## What It Does

`agentpack` covers three practical workflows:

1. **Author** a packaged skill from source docs or knowledge files — compile, inspect, detect staleness, and iterate locally with the dev dashboard.
2. **Validate** — check that a skill package is structurally sound and record source-backed semantic state before release.
3. **Distribute** — point plugins at `./dist` or use SkillKit to install `./dist` into runtime skill folders.

## Quick Start

### Author and test a packaged skill

Run these commands from the repo that owns the source files bound in the skill's `agentpack` block:

```bash
agentpack author inspect domains/operations/skills/agonda-prioritisation
agentpack validate domains/operations/skills/agonda-prioritisation
agentpack author build domains/operations/skills/agonda-prioritisation
agentpack author dev domains/operations/skills/agonda-prioritisation
```

Use `author dev` when you want the skill linked into `.claude/skills/` and `.agents/skills/` for local runtime testing. It also starts a localhost development workbench by default for one selected skill, showing immediate provenance sources, direct required skills, lifecycle state, and workbench actions such as validation and stale checks.

Pass `--no-dashboard` if you want the original CLI-only linking workflow without the local dashboard.

If your agent session was already running, start a fresh session after linking so the runtime can pick up the newly materialized skill.

### Install a built skill bundle with SkillKit

```bash
npx -y skillkit@latest install ./dist --yes --agent claude-code
npx -y skillkit@latest install ./dist --yes --agent codex
```

### Build a plugin-ready bundle

```bash
agentpack author build path/to/skill
```

`author build` produces `.agentpack/compiled.json` and a plugin-ready closure bundle in the target package's `dist/`, including `dist/.agentpack-bundle.json`. Claude Code plugins can point `"skills": "./dist"`, and SkillKit can install that same bundle into Claude Code and Codex. For payload-heavy skills that rely on bundled `scripts/`, `lib/`, or `data/`, prefer plugins pointing at `./dist` as the full-fidelity runtime path.

## The Model

The most important distinction in `agentpack` is lifecycle stage.

### Packaged skills (authoring)

A packaged skill is a reusable capability artifact.

- `source ... = "repo/path"` bindings track provenance
- `import ... from skill "@scope/package"` defines skill dependencies
- `package.json.dependencies` are the package-level mirror for cross-package skill imports
- it is self-contained at runtime, not a pointer back to source files

Typical authoring flow:

- `agentpack author inspect`
- `agentpack validate`
- `agentpack author build`
- `agentpack author dev`

### Consumer repos (distribution)

Consumer repos do not author the skill. They consume the built bundle through a plugin or SkillKit.

Typical consumer flow:

- `npm install @scope/skill-package` or fetch a plugin repo
- point a plugin at `./dist` or run `skillkit install ./dist`
- verify the installed skills in the target runtime

## What Agentpack Refuses To Blur

These are deliberate boundaries:

- Knowledge is the source of truth.
- Skills are derived artifacts.
- npm owns package install, uninstall, auth, and registry.
- agentpack owns authoring, validation, and portable bundle generation.
- SkillKit or plugins own runtime-specific installation.

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

- `agentpack validate`
- `agentpack author dev`
- `agentpack author stale`

from that knowledge-base repo root, not from the `agentpack` repo.

## Commands

### Authoring (`agentpack author`)

- `agentpack author inspect <target>`
- `agentpack author dev <target>`
- `agentpack author dev cleanup`
- `agentpack author unlink <name>`
- `agentpack author build <target>`
- `agentpack author materialize`
- `agentpack author stale [target]`

### Validation

- `agentpack validate [target]`
- `agentpack publish validate [target]` (deprecated alias)

### Compatibility commands

- `agentpack materialize`
- `agentpack skills list`
- `agentpack skills disable <target>`
- `agentpack skills status`

### Compatibility commands (`agentpack skills`)

- `agentpack skills enable <target>`

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
