# Knowledge As Package

Use this reference when the user is reasoning about why `agentpack` exists, or how docs and knowledge files become runtime agent capabilities.

## The Core Idea

Agentpack treats knowledge the way a software toolchain treats source code.

Mapping:

- knowledge docs = source files
- `SKILL.md` = compiled artifact for agents
- `package.json` = distribution manifest
- npm package = versioned published artifact
- `.claude/skills/` or `.agents/skills/` = runtime resolution surface

This is why a skill is not just a prompt file. It is a package-backed artifact with provenance, dependencies, and lifecycle checks.

## Why Source Tracking Matters

Without source tracking, a skill drifts silently away from the docs or knowledge it was supposed to encode.

With `metadata.sources`:

- the skill points at the files it was derived from
- validation checks that those files exist
- stale detection can report when source truth changed

This is the main reason to keep docs as sources and skills as derived artifacts.

## Why Installation Is Separate From Authoring

Published package consumption is not the same as local skill authoring.

Authoring cares about:

- source truth
- validation
- dependency sync
- local discovery via `skills dev`

Consumption cares about:

- versioned package installation
- transitive dependency resolution
- runtime materialization into agent-visible directories

Keep those stages separate in explanations.
