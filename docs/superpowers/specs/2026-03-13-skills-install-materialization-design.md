# Skills Install Materialization Design

## Summary

Fix the install and runtime materialization path for package-backed skills so `agentpack skills install` behaves like a package manager at resolution time and like a discovery-directory materializer at runtime.

This patch covers:

- issue `#16` — install should materialize only the requested package closure
- issue `#17` — install should safely replace pre-existing symlinks
- issue `#19` — `skills env` should report the actual installed package and its exported/materialized skills
- issue `#20` — multi-skill packages should materialize discoverable top-level runtime entries

This patch does not cover GitHub Packages auth fallback (`#18`) and does not attempt to complete the broader multi-skill authoring/validation architecture outside the install/env path.

## Problem

The current runtime path conflates three separate concerns:

1. package installation
2. exported skill structure inside an installed package
3. top-level discovery directories scanned by Claude/Codex

Today, install state is rebuilt by scanning all installed packages in `node_modules`, and materialization assumes one `SKILL.md` at package root. That creates four failures:

- unrelated pre-existing packages get rematerialized
- multi-skill packages are installed but their nested skills are unreachable
- `skills env` reflects accidental global state instead of requested installs
- stale symlinks cause repeated `EEXIST` failures

## Design Goals

- Keep npm package semantics intact: package is the install and ownership unit.
- Make runtime discoverability explicit: each invocable skill must appear as a top-level directory under `.claude/skills/` and `.agents/skills/`.
- Support multi-skill packages without converting them into plugins.
- Preserve single-skill package behavior unless namespacing is required.
- Make `skills env` report what agentpack actually installed and materialized, not what happened to already exist in `node_modules`.

## Runtime Model

Three units must be treated separately:

- **Package unit**: npm package, versioning, direct/transitive ownership, uninstall ownership
- **Export unit**: one declared skill export inside `package.json.agentpack.skills`
- **Materialized unit**: one top-level runtime entry visible to agent discovery

One installed package may own many exported skills and many materialized runtime entries.

## Materialization Contract

### Single-skill packages

If a package exports exactly one skill, materialize a single top-level runtime entry using the existing flat skill name.

Example:

- package: `@alavida-ai/value-copywriting`
- exported skill: `value-copywriting`
- materialized entry: `value-copywriting`

### Multi-skill packages

If a package exports more than one skill:

- materialize the root/orchestrator skill as the bare package entry point
- materialize every other exported skill as a namespaced entry

Example for `@alavida-ai/prd-development`:

- root/orchestrator: `prd-development`
- sub-skills:
  - `prd-development:proto-persona`
  - `prd-development:problem-statement`
  - `prd-development:epic-hypothesis`

### Discovery constraint

Each materialized entry must point at a directory that contains a `SKILL.md` at its root, because Claude/Codex discovers skills by scanning top-level directories under `.claude/skills/` or `.agents/skills/`.

Nested exports inside an installed package are not discoverable unless agentpack fans them out into that directory shape.

## Package Export Source of Truth

For installed packages, `package.json.agentpack.skills` becomes the authoritative export map.

Agentpack must stop inferring “one package equals one root `SKILL.md`” during install/env materialization. Instead it must:

1. read the installed package manifest
2. enumerate exported skills from `agentpack.skills`
3. locate each exported `SKILL.md`
4. derive the runtime materialized name for that export
5. materialize one top-level runtime entry per export

If a package has no declared export map, current single-skill root behavior may remain as a compatibility fallback for now.

## Install Resolution

Install remains package-based.

`skills install <target>` should:

1. derive the direct requested package set
2. run `npm install --no-save` for those requested targets
3. derive the resolved package closure for those direct installs
4. rebuild install state and materialization from that closure only

It must not rebuild from every package that happens to be present in `node_modules`, because that is what causes issue `#16` and contributes to `#19`.

## Install State

`.agentpack/install.json` must become the source of truth for installed package ownership and runtime materialization.

Each installed package record should include:

- package name
- package version
- direct flag
- requested target
- source package path
- exported skills

Each exported skill record should include:

- canonical skill name
- runtime materialized name
- source path inside the installed package
- materialized targets

This allows `skills env` and uninstall cleanup to work without rescanning ambient `node_modules` state.

## Env Output

`skills env` should stay package-oriented.

That is closer to real package ecosystems:

- the package is the install/version/ownership unit
- exported modules are runtime entry points inside that package

For each package, env output should show:

- package name
- direct vs transitive
- version
- exported skill names
- materialized runtime entry names/paths

That keeps ownership accurate while making multi-skill materialization visible.

## Uninstall Behavior

Uninstall also remains package-based.

When uninstalling a direct package:

1. remove it from the direct requested package set
2. recompute the remaining resolved package closure
3. rebuild install state and materialization from the remaining closure
4. remove packages and materialized runtime entries no longer present in that closure

This means uninstalling `@alavida-ai/prd-development` should remove:

- its own materialized runtime entries
- dependency packages that become orphaned

But it must preserve any dependency package still required by another direct install.

## Symlink Reconciliation

Materialization should always reconcile the target path before linking.

For each runtime entry target:

- if the target path already exists as a symlink, remove and recreate it
- if the target path exists as an old materialized directory, remove and recreate it
- if the target path exists outside the managed discovery roots, do nothing

This resolves the repeated `EEXIST` failure mode in issue `#17`.

## Architectural Boundaries

This patch should change:

- installed-package resolution and rebuild behavior
- install state structure
- runtime materialization logic
- env output
- uninstall cleanup behavior as needed to honor the new install state

This patch should not change:

- plugin packaging/runtime
- GitHub Packages auth fallback
- broader authored multi-skill validation/catalog/build-state behavior

Those broader authoring paths still assume one `SKILL.md` at package root and can be handled separately.

## Risks

### Mixed identity risk

Multi-skill packages will have:

- canonical exported skill names
- runtime materialized names

These are not always identical because sub-skills become namespaced at runtime. Install state must record both explicitly.

### Backward compatibility risk

Single-skill packages should keep their current flat runtime name.

For multi-skill packages, the chosen convention is:

- root stays bare
- sub-skills are namespaced

That creates a mixed naming shape, but it preserves the most natural primary entry point.

### Partial architecture risk

This patch intentionally stops at install/materialization/env. Validation, stale detection, and authored package discovery for multi-skill packages remain incomplete and should not be claimed as solved by this work.

## Recommended Test Coverage

Add regression coverage for:

1. multi-skill install materializes root and namespaced sub-skills
2. install only materializes the requested closure, not unrelated pre-existing packages
3. install succeeds when managed symlink targets already exist
4. `skills env` reports the requested package and its exported/materialized skills
5. uninstall removes orphaned materialized runtime entries for removed packages but preserves shared dependencies
