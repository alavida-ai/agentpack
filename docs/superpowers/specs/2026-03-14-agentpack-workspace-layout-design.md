# Agentpack Workspace Layout Design

## Goal

Normalize the repository to the standard monorepo shape so `@alavida/agentpack` is a normal workspace package managed directly by Changesets, instead of a special root package with custom release glue.

## Current Problem

The repository currently mixes two models:

- the repo root is the published package `@alavida/agentpack`
- the repo also uses npm workspaces for `packages/*`

That shape forced custom release infrastructure:

- a private release-tracker package
- root-version synchronization
- a custom publish script with special handling for the root package

This is operationally fragile because the root package is not treated like the other workspace packages. Each release fix has to account for that mismatch instead of using the normal Changesets path.

## Desired Shape

Adopt the standard monorepo layout:

```text
repo/
  package.json              # private workspace manager
  packages/
    agentpack/              # published CLI package
      package.json
      bin/
      src/
      skills/
      README.md
    agentpack-auth-probe/   # published support package
      package.json
```

The repository root becomes private and owns:

- workspace management
- dev/test scripts
- docs and CI

The published CLI package becomes `packages/agentpack`, which owns:

- runtime code
- package version
- published files
- CLI entrypoints

## Architecture

### 1. Published Package Boundary

Move the distributable package assets from the root into `packages/agentpack`:

- `bin/`
- `src/`
- `skills/`
- package README

The package manifest in `packages/agentpack/package.json` becomes the authoritative npm package definition for `@alavida/agentpack`.

### 2. Private Root Workspace

The root `package.json` becomes a private workspace manager. It no longer defines the published `@alavida/agentpack` package and no longer carries publish-specific fields like `bin`, `files`, or the package version contract for release automation.

It still owns repository-level scripts such as:

- `test`
- local smoke scripts
- docs/build helpers
- `changeset`

### 3. Thin Dev Wrappers

Keep root `bin/agentpack.js` and `bin/intent.js` as thin wrappers that delegate to `packages/agentpack/bin/*`.

This preserves existing local development ergonomics and avoids unnecessary churn in docs and sandbox instructions that reference `bin/agentpack.js` from a repo checkout.

These wrappers are a development convenience only. They are not part of the published package contract.

### 4. Standard Release Flow

Once `@alavida/agentpack` is a normal workspace package, the release path becomes standard:

- pending changesets update `packages/agentpack/package.json`
- `changesets/action` creates the release PR
- merging the release PR runs `changeset publish`

Delete the custom release bridge:

- `packages/agentpack-release`
- `scripts/version-packages.mjs`
- `scripts/release.mjs`

The workflow should go back to the normal Changesets contract, while retaining `.npmrc` setup for npmjs and GitHub Packages auth.

### 5. Test And Script Retargeting

Tests and local scripts that import root `src/*` modules will point at `packages/agentpack/src/*`.

Integration tests that execute the CLI may continue to use the root `bin/agentpack.js` wrapper so developer-local usage stays stable.

## Error Handling And Compatibility

This migration is intended to preserve CLI behavior. The risk surface is operational, not user-facing:

- wrong relative imports after the move
- release workflow assumptions tied to root `package.json`
- scripts/tests that read package metadata from the old location

Compatibility choices:

- preserve root CLI wrapper paths
- keep package name `@alavida/agentpack`
- keep current runtime behavior unchanged

## Testing Strategy

1. Release-contract coverage should assert the new standard shape:
   - root is private
   - `packages/agentpack/package.json` is the published package
   - workflow uses direct Changesets version/publish
   - custom tracker/release scripts are gone

2. Existing CLI and integration tests should pass against the moved package source.

3. Manual verification should confirm:
   - root wrapper CLI still works from a repo checkout
   - release workflow still succeeds
   - npm publishes `packages/agentpack` directly

## Recommendation

Do the migration in one coherent patch. Partial migration leaves both layouts alive and creates more confusion than the current state.
