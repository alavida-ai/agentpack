# Live Test

Status: active  
Date: 2026-03-09

## Purpose

Provide human-run live tests for the real package-backed skills lifecycle, including the harder cross-repo dependency scenario:

- new packaged skill with `metadata.sources`
- local workbench skill depending on that packaged skill
- packaged skill depending on another packaged domain skill
- workbench/plugin consumption in another repo
- missing dependency detection
- install and rematerialization into `.claude/skills/` and `.agents/skills/`

This file is not the automated fixture suite. It is the real-world checklist for proving the CLI in live repos.

## Before You Start

For the full cross-repo scenario to work, these must be true:

1. The packaged skill is a real npm package.
2. The packaged skill is not marked `"private": true`.
3. The packaged skill uses real semver dependency ranges, not `file:` dependencies.
4. The package has:
   - `name`
   - `version`
   - `repository`
   - `publishConfig.registry = "https://npm.pkg.github.com"`
5. The consumer repo has `.npmrc` routing:
   - `@alavida:registry=https://npm.pkg.github.com`
6. The consumer repo has auth available for GitHub Packages.
7. The workbench/plugin delivery path is already defined separately from skill package delivery.

Important boundary:

- plugin/workbench delivery gets the workbench into the consumer repo
- `agentpack skills install` gets the missing skill packages into the consumer repo and materializes them

## Scenario 1: Author A New Packaged Skill

Goal:

- create a new packaged skill with one or two real sources
- make it depend on an existing packaged domain skill

Checklist:

1. Create a new package directory.
2. Add `SKILL.md` with:
   - `name`
   - `description`
   - `metadata.sources`
   - `requires`
3. Add `package.json` with:
   - scoped package name
   - version
   - repository
   - publish registry
   - dependency declaration matching `requires`

Pass if:

- `agentpack skills validate <package-dir>` returns `valid: true`
- `agentpack skills inspect <package-dir>` shows the expected `sources` and `requires`

Suggested commands:

```bash
agentpack skills inspect /path/to/new-package
agentpack skills validate /path/to/new-package
```

## Scenario 2: Local Workbench Skill Depends On The Packaged Skill

Goal:

- add a local workbench skill in `skills/`
- make it depend on the new packaged skill

Checklist:

1. Create or update a workbench-local skill in:
   - `domains/.../workbenches/.../skills/<skill-name>/SKILL.md`
2. Add:
   - `requires: [@alavida/your-new-skill]`
3. Confirm the workbench/plugin still points at `./skills/`

Pass if:

- `agentpack skills inspect <local-workbench-skill>` shows the expected `requires`

Suggested command:

```bash
agentpack skills inspect domains/.../workbenches/.../skills/<skill-name>
```

## Scenario 3: Validate Release Readiness

Goal:

- prove the new package is structurally publishable

Checklist:

1. Run validation on the packaged skill.
2. Confirm validation returns npm next steps.

Pass if:

- validation succeeds
- output includes:
  - `npm version patch`
  - `npm publish`

Suggested command:

```bash
agentpack skills validate /path/to/new-package
```

## Scenario 4: Publish The Packaged Skill

Goal:

- make the new skill available to another repo through GitHub Packages

Checklist:

1. Run:
   - `npm version patch|minor|major`
2. Run:
   - `npm publish`
3. Confirm the package exists in GitHub Packages.
4. Confirm any packaged dependency also exists there.

Pass if:

- the new package is installable from the private registry
- the dependency chain resolves through registry packages, not local `file:` references

Important:

- agentpack does not publish for you
- npm publishes; agentpack validates and guides

## Scenario 5: Ship The Workbench / Plugin To Another Repo

Goal:

- get the consuming workbench/plugin into another repo

Checklist:

1. Install or copy the workbench/plugin into the consumer repo using your chosen delivery path.
2. Confirm the local workbench skill exists in the consumer repo.
3. Confirm that local skill still declares the packaged dependency.

Pass if:

- the consumer repo can inspect the local workbench skill
- that local skill requires the packaged dependency package

Suggested command:

```bash
agentpack skills inspect domains/.../workbenches/.../skills/<skill-name>
```

## Scenario 6: Detect Missing Skill Dependencies In The Consumer Repo

Goal:

- prove the consumer repo can see that the workbench/plugin is incomplete

Checklist:

1. In the consumer repo, do not install the packaged dependencies yet.
2. Run:
   - `agentpack skills missing`
3. Run:
   - `agentpack skills status`

Pass if:

- `missing` shows the missing packaged skills
- `status` reports an incomplete or attention-needed environment
- remediation points at `agentpack skills install <package>`

Suggested commands:

```bash
agentpack skills missing
agentpack skills status
```

## Scenario 7: Install And Materialize Missing Dependencies

Goal:

- bring the missing skills into the consumer repo and surface them to agents

Checklist:

1. Run:
   - `agentpack skills install @alavida/your-new-skill`
   or
   - `agentpack skills install --workbench <workbench-path>`
2. Run:
   - `agentpack skills env`
3. Inspect:
   - `.agentpack/install.json`
   - `.claude/skills/`
   - `.agents/skills/`

Pass if:

- the direct package is installed
- the transitive dependency package is installed
- both are symlinked into `.claude/skills/` and `.agents/skills/`
- `missing` now returns zero

Suggested commands:

```bash
agentpack skills install @alavida/your-new-skill
agentpack skills env
agentpack skills missing
```

## Scenario 8: Prove The Runtime Graph Is Correct

Goal:

- confirm the installed dependency graph is inspectable and complete

Checklist:

1. Run:
   - `agentpack skills dependencies @alavida/your-new-skill`
2. Confirm the direct dependency package appears.
3. Run:
   - `agentpack skills status`
4. Confirm the environment is no longer incomplete.

Pass if:

- dependency visibility is correct
- installed graph matches expected direct/transitive roles

Suggested commands:

```bash
agentpack skills dependencies @alavida/your-new-skill
agentpack skills status
```

## Scenario 9: Prove Stale Detection On The New Skill

Goal:

- confirm the new package is governed by its declared sources

Checklist:

1. Regenerate `.agentpack/build-state.json` if needed.
2. Change one file in `metadata.sources`.
3. Run:
   - `agentpack skills stale`
   - `agentpack skills stale @alavida/your-new-skill`
4. Restore the source file.

Pass if:

- the package becomes stale
- the changed source file is shown explicitly
- detail mode shows recorded and current hashes

Suggested commands:

```bash
agentpack skills stale
agentpack skills stale @alavida/your-new-skill
```

## Scenario 10: Remove The Direct Skill And Reconcile

Goal:

- confirm uninstall cleans up the runtime graph and materialization

Checklist:

1. Run:
   - `agentpack skills uninstall @alavida/your-new-skill`
2. Run:
   - `agentpack skills env`
3. Inspect:
   - `.agentpack/install.json`
   - `.claude/skills/`
   - `.agents/skills/`

Pass if:

- the direct skill is removed
- orphaned transitive dependencies are removed
- dead symlinks are removed
- runtime state is clean

Suggested commands:

```bash
agentpack skills uninstall @alavida/your-new-skill
agentpack skills env
```

## Minimum Production Work Still Needed

If you want this exact cross-repo scenario to be truly production-real, do these next:

1. Move publishable skills out of spike-only locations.
2. Remove `private: true` from publishable packages.
3. Replace `file:` dependency specs with semver ranges.
4. Add real `.npmrc` and token setup for GitHub Packages.
5. Publish one real package chain to GitHub Packages.
6. Add a CI workflow that publishes changed skill packages.
7. Test the consumer repo against registry packages, not local paths.

Once that is done, the scenario above becomes a real production flow rather than a local/distribution rehearsal.
