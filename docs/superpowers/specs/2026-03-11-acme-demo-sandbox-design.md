# Acme Demo Sandbox Design

**Date:** 2026-03-11

## Goal

Add an Acme demo sandbox that `agentpack` consumes as a pinned git submodule so manual testing, product demos, and landing-page storytelling can happen against a realistic external-style monorepo without changing core repo-root behavior.

## Problem

The current local testing story has a practical gap.

To manually test `agentpack` in a realistic way, an author often needs a second repo with the expected external file structure:

- source-backed knowledge files
- packaged skills
- workbench/plugin shell
- committed `.agentpack` metadata

That creates friction for:

- testing `skills dev` and the new workbench
- demonstrating lifecycle visibility in a believable repo
- recording product walkthroughs or landing-page assets
- quickly verifying workflows without jumping to another real knowledge-base repo

The current checked-in test fixtures are useful for automated tests, but they are not clearly positioned as the default human-usable sandbox for demos and exploratory testing.

## Desired Outcome

`agentpack` should include an Acme demo sandbox under:

```text
sandbox/acme-demo/
```

but as a git submodule to a standalone demo repository rather than as normal checked-in files inside the main repo.

This sandbox should:

- feel like a plausible external monorepo
- be usable directly for manual command runs
- support a coherent product story
- make the skill lifecycle and workbench value obvious
- remain small and curated

## Recommended Approach

Use a standalone `acme-demo` repository and consume it from `agentpack` as a pinned git submodule.

Why this approach:

- it preserves the current `.git`-based repo-root model without adding special-case logic
- it allows both `agentpack` and other tools such as `agonda-cli` to use the same canonical sandbox repo
- it gives `agentpack` a stable pinned demo target for screenshots, walkthroughs, and manual testing
- it keeps demo content ownership separate from `agentpack` product code

Alternative approaches considered:

### Plain checked-in sandbox directory inside `agentpack`

Simpler at first glance, but it conflicts with the current repo-root model unless `agentpack` learns nested-root overrides or the sandbox is manually initialized as its own repo after checkout.

### Generate the demo repo on demand

Cleaner mechanically, but weaker for storytelling and less useful as a stable demo surface.

### Reuse `test/fixtures/` as the main demo surface

Possible, but it blurs two different purposes:

- automated fixture curation
- human demo/manual testing

Those should stay distinct unless there is a clear reason to merge them later.

## Product Boundary

The sandbox is:

- a manual testing target
- a demo repo
- a documentation aid
- a standalone repository with its own history and README

The sandbox is not:

- the primary automated test fixture layer
- a general-purpose example zoo
- a replacement for real production monorepos

## Sandbox Narrative

The sandbox should center on a fake company named `Acme`.

The story:

- Acme maintains source knowledge about brand voice, positioning, and proof points
- Acme packages skills derived from that knowledge
- Acme has a consumer workbench such as `website-dev`
- `agentpack` makes the provenance, dependency graph, stale state, and local workbench visibility legible

This should make the product value easy to explain:

- skills are not just prompt files
- they are built on source truth
- they depend on other reusable skills
- stale state and dependency impact are visible

## Sandbox Shape

Recommended structure inside the standalone `acme-demo` repo:

```text
sandbox/acme-demo/
  .agentpack/
  domains/
    brand/
      knowledge/
      skills/
      workbenches/
    research/
      skills/
    methodology/
      skills/
  package.json
  README.md
```

### Domain content

V1 should include:

- 2-4 believable knowledge files under `domains/brand/knowledge/`
- one main copywriting skill under `domains/brand/skills/`
- one supporting research skill under `domains/research/skills/`
- one supporting methodology/editorial skill under `domains/methodology/skills/`

This gives the selected skill:

- direct provenance sources
- direct required skills
- a meaningful graph for the workbench

### Workbench shell

Include one small consumer/workbench shell such as:

```text
domains/brand/workbenches/website-dev/
```

This gives the sandbox enough realism to support install and workbench-related flows without expanding into a large plugin showcase.

The workbench should include local workbench skills that reference packaged skills from the domain skill directories via `requires`.

Do not add the legacy workbench config file to the sandbox. The goal here is a domain-scoped content layout for demo and authoring flows, not a legacy workbench-config surface.

That matters because the sandbox should demonstrate both layers clearly:

- local workbench skills as the consumer-facing entry surface
- packaged skills under domain directories as the reusable capability layer

### Provenance requirement

The packaged skills used in the hero path must also reference believable source files through `metadata.sources`.

That is required so the workbench DAG can show both edge types in one coherent flow:

- workbench skill -> packaged skill dependencies
- packaged skill -> source provenance

Without both, the graph would only show half of the lifecycle story and the value of the workbench would be weaker.

## Hero Demo Path

The first sandbox should optimize for one strong demo narrative:

1. inspect a copywriting skill
2. validate it
3. run `skills dev`
4. see the local workbench open
5. edit one source file
6. watch the skill become stale
7. compare dashboard visibility with `skills stale` and `skills dependencies`

This path should make the value of the graph/workbench obvious.

For that reason, the hero path should include:

- a local workbench skill inside `domains/brand/workbenches/website-dev/skills/...`
- a packaged domain skill that the workbench skill requires
- at least one supporting packaged dependency skill
- at least two source files attached to the selected packaged skill

## Metadata And State

The sandbox should commit the metadata that helps the demo:

- `.agentpack/build-state.json`
- `.agentpack/catalog.json`

This allows:

- immediate stale demonstrations
- deterministic visibility flows
- less setup friction before a demo

The sandbox should follow the repo’s normal metadata policy and avoid committing install-state unless there is a compelling demo reason later.

## Documentation

Add a short sandbox usage doc or `README.md` inside the standalone `acme-demo` repo that explains:

- what the sandbox is for
- which command paths to run
- the recommended demo sequence
- which file to edit to trigger stale state

Also add a short mention in the main docs so developers know this is the preferred local demo target, and document submodule setup/update steps there.

## Maintenance Rules

Treat the sandbox as a curated product artifact.

Rules:

- keep it small
- keep content coherent
- prefer believable demo content over placeholder lorem ipsum
- keep one clear primary narrative
- avoid turning it into a second general fixture tree

The sandbox may later feed automated fixtures, but automated tests should not depend on it by default in v1.

## Reset And Drift

Start without a reset script unless manual testing proves it necessary.

If repeated local use dirties the sandbox often, add a small reset helper later to restore:

- source files
- `.agentpack/build-state.json`
- `.agentpack/catalog.json`

That should be a follow-up only if needed.

## Testing Impact

V1 does not require automated tests to consume the sandbox directly.

Instead:

- keep current integration fixtures for fast automated verification
- use the sandbox for manual product testing and demos
- optionally promote parts of the sandbox into fixtures later if that becomes useful

## Recommendation

Proceed with:

```text
sandbox/acme-demo/
```

as a pinned git submodule to a standalone `acme-demo` repo that tells one believable marketing/copywriting lifecycle story for Acme, supports the `skills dev` workbench demo path, and serves as the default human-usable local sandbox for `agentpack`.
