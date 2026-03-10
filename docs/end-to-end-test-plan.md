# End-to-End Test Plan

This document captures the intended end-to-end validation flow for `agentpack` across local authored skills, plugin-local skills, bundled plugin artifacts, and external package dependencies.

The goal is to prove the full lifecycle works in the right order:

1. author a packaged skill
2. use it locally with `skills dev`
3. depend on it from a plugin-local skill
4. run `plugin dev` and `plugin build`
5. consume the built plugin artifact from another repo
6. validate external-registry dependency behavior
7. verify source-backed skills become stale and can be rebuilt cleanly

## Current Concrete Test Case

Use this document to run one real scenario end to end.

### Repos

- authoring repo: `/Users/alexandergirardet/alavida/knowledge-base/Alavida`
- CLI repo: `/Users/alexandergirardet/alavida/agentpack`
- consumer repo: any separate local repo or temp repo used only to consume the built plugin artifact

### Authored packaged skill under test

- packaged skill: `domains/operations/skills/agonda-prioritisation/`
- package name: `@alavida-ai/agonda-prioritisation`

### Source files under test

- `domains/operations/knowledge/plan.yaml`
- `domains/operations/knowledge/execution-methodology.md`
- `domains/operations/knowledge/workspace-lifecycle.md`
- `domains/operations/knowledge/linear-conventions.md`

### What this scenario should prove

- a source-backed packaged skill can be authored and dev-linked locally
- that packaged skill can later be depended on by a plugin-local skill
- plugin build/dev can vendor the packaged skill into a self-contained plugin artifact
- changing one operations source file makes the packaged skill stale

## Scope Boundary

This test plan is only about the `agentpack` lifecycle:

- packaged skill authoring
- packaged skill validation and dev linking
- plugin-local dependency declaration
- plugin artifact build/dev
- stale detection and rebuild

It does not require TanStack Intent. Intent may be used separately to ship docs-backed library skills, but it is not part of this `agentpack` end-to-end validation flow.

## Gate 1: Packaged Skill Authoring

Create a new packaged skill under a domain path such as:

`domains/<domain>/skills/<skill-name>/`

Minimum files:

- `SKILL.md`
- `package.json`

The skill should include:

- `name`
- `description`
- `metadata.sources`
- `requires` if needed

Validation flow:

```bash
cd /Users/alexandergirardet/alavida/knowledge-base/Alavida
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills inspect domains/operations/skills/agonda-prioritisation
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills validate domains/operations/skills/agonda-prioritisation
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills dev domains/operations/skills/agonda-prioritisation
```

Expected outcomes:

- inspect shows correct metadata
- validate passes and syncs managed dependencies if needed
- `skills dev` makes the skill discoverable in `.claude/skills/` and `.agents/skills/`
- a fresh agent session can see the newly linked skill
- stopping `skills dev` removes those links
- validation must be run from the knowledge-base repo root, because `metadata.sources` resolve relative to the current repo

## Gate 2: Local Plugin Dependency

Create or update a plugin-local skill inside a plugin such as:

`<plugin>/skills/<local-skill>/SKILL.md`

That local plugin skill should declare:

```yaml
requires:
  - @scope/authored-packaged-skill
```

The plugin package must declare the required packaged skill in `devDependencies`.

Concrete dependency for this scenario:

```yaml
requires:
  - @alavida-ai/agonda-prioritisation
```

Suggested plugin-local skill shape:

- local skill name: `prioritisation`
- purpose: route task-triage or planning questions to the packaged operations skill

Validation flow:

```bash
cd /absolute/path/to/plugin-repo
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin inspect /absolute/path/to/plugin
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin validate /absolute/path/to/plugin
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin dev /absolute/path/to/plugin
```

Expected outcomes:

- plugin inspection shows the expected direct/transitive bundle closure
- plugin validation passes
- plugin dev builds an artifact under `.agentpack/dist/plugins/<plugin-name>/`
- the artifact contains both the local plugin skill and the vendored packaged skill

## Gate 3: Artifact Consumption From Another Repo

Build the plugin artifact:

```bash
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin build --clean /absolute/path/to/plugin
```

Use the built artifact from another repo:

```bash
claude --plugin-dir /absolute/path/to/repo/.agentpack/dist/plugins/<plugin-name>
```

Expected outcomes:

- plugin loads successfully outside the source repo
- bundled packaged skill is available through the plugin artifact
- behavior matches the source-repo `plugin dev` experience

## Gate 4: Distribution / External Registry Dependency

This gate validates the publish/install order for plugin dependencies that are not local repo packages.

Required ordering:

1. publish the packaged skill first
2. install it into the plugin repo
3. validate/build the plugin
4. publish the plugin

Plugin rules:

- external bundled skill packages belong in plugin `devDependencies`
- `plugin dev` and `plugin build` should not silently install them
- if missing or not installed, the CLI should report:
  - missing from `package.json devDependencies`
  - or not installed
  - suggest running `npm install`

Validation flow:

```bash
npm install
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin validate /absolute/path/to/plugin
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin build /absolute/path/to/plugin
```

Expected outcomes:

- external packaged skills resolve from `node_modules`
- plugin artifact vendors those installed package skills
- provenance records them in `bundled-skills.json`

## Gate 5: Source-Backed Skill Evolution

Use a packaged skill with `metadata.sources`.

Update one of the referenced source files after the initial skill and plugin tests pass.

Concrete update for this scenario:

- edit `domains/operations/knowledge/plan.yaml`
- change the current cycle priorities in a way that should affect prioritisation advice
- then re-run stale detection and validation

Validation flow:

```bash
cd /Users/alexandergirardet/alavida/knowledge-base/Alavida
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills stale
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills stale domains/operations/skills/agonda-prioritisation
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js skills validate domains/operations/skills/agonda-prioritisation
node /Users/alexandergirardet/alavida/agentpack/bin/agentpack.js plugin build --clean /absolute/path/to/plugin
```

Expected outcomes:

- `skills stale` reports the packaged skill as stale
- detail mode shows recorded vs current hashes
- revalidation/rebuild flow remains explicit
- rebuilt plugin artifact reflects the updated packaged skill contents

## Suggested Execution Order

Run the gates in this order:

1. Gate 1: packaged skill authoring
2. Gate 2: local plugin dependency
3. Gate 3: artifact consumption
4. Gate 4: external-registry dependency
5. Gate 5: source-backed evolution

## Minimum Passing Run For Right Now

If you only want to prove the currently implemented pieces before creating the plugin-local consumer, run this subset:

1. Gate 1 with `domains/operations/skills/agonda-prioritisation`
2. edit one operations source file
3. Gate 5 for stale detection and revalidation

That proves:

- packaged skill authoring works
- source-backed validation works
- local dev linking works
- stale detection works

Then add Gate 2 and Gate 3 once the plugin-local consumer exists.

## Open Questions To Validate During Execution

- Should `plugin` commands resolve `.` relative to the current working directory instead of repo root?
- Should `plugin dev` print an absolute `--plugin-dir` path instead of a repo-relative path?
- Should `skills dev` warn more explicitly when dependencies are unresolved from both the repo and `node_modules`?
- Do we want a dedicated deployment command to enforce publish order for packaged skills before plugins?
