---
name: publishing-skill-packages
description: Use when preparing and publishing agentpack skill packages to npm or GitHub Packages, including package.json configuration, registry setup, and release validation.
type: lifecycle
library: agentpack
library_version: "0.1.10"
sources:
  - "alavida-ai/agentpack:docs/publishing.mdx"
  - "alavida-ai/agentpack:docs/authentication.mdx"
  - "alavida-ai/agentpack:docs/schema-package-json.mdx"
---

```agentpack
source publishingGuide = "docs/publishing.mdx"
source authenticationGuide = "docs/authentication.mdx"
source packageJsonSchema = "docs/schema-package-json.mdx"
```

# Publishing Skill Packages

Use this skill when the user has authored a skill graph and needs to publish it as a package to npm or GitHub Packages.

Publishing is the boundary between authoring and distribution. Everything before this point is local; everything after makes the skill available to consumer repos. This skill covers the validation, configuration, and registry decisions required to cross that boundary correctly.

## Setup

### Prerequisites

Before publishing, the user must have:

- A valid skill package with `SKILL.md` and `package.json`
- A working `agentpack publish validate` pass
- An npm account (for public packages) or a GitHub token with `write:packages` scope (for GitHub Packages)
- Node.js 20+ and npm

### Identify the publishing target

Ask the user which registry they are publishing to before giving configuration advice:

- **npm public registry** (`https://registry.npmjs.org/`) -- for open-source or publicly shared skill packages
- **GitHub Packages** (`https://npm.pkg.github.com`) -- for private, org-scoped, or team-internal skill packages

The registry choice determines `publishConfig.registry` in `package.json` and the `.npmrc` authentication setup.

## Core Patterns

### 1. Validate before publishing

Always run validation before publishing. This is not optional.

```bash
agentpack publish validate path/to/skill-package
```

Validation checks:

- `name` and `version` are present in `package.json`
- Each discovered export `SKILL.md` parses correctly
- `files` includes the exported skill paths
- Every cross-package skill import is mirrored in `dependencies`
- `@scope/*` packages include a `repository` field
- `@scope/*` packages set `publishConfig.registry` appropriately

A passing validate means the package contract and exported skills are structurally sound. Do not publish without it.

### 2. Configure package.json for distribution

A publishable `package.json` requires these fields:

```json
{
  "name": "@acme/brand-copywriting",
  "version": "1.2.0",
  "description": "Brand copywriting package.",
  "files": [
    "SKILL.md",
    "skills/",
    "!skills/_artifacts"
  ],
  "agentpack": {
    "root": "skills"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/acme-corp/knowledge-base.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Field-by-field:

| Field | Required | Purpose |
|---|---|---|
| `name` | Yes | Scoped package name (e.g., `@acme/brand-copywriting`). |
| `version` | Yes | Semver version. Bump with `npm version patch/minor/major`. |
| `description` | Recommended | Package-level summary for registry listing. |
| `files` | Yes | Controls what gets published. Must include the root `SKILL.md` and skill directories. Must exclude `_artifacts`. |
| `agentpack.root` | If named exports | Directory for named export discovery. Omit for single-skill packages that only use the root `SKILL.md`. |
| `repository` | Yes | Source repo URL. Required for scoped packages. |
| `publishConfig` | Yes | Registry URL. Determines where `npm publish` sends the tarball. |
| `dependencies` | Managed | Cross-package package requirements derived from exported skill imports. Do not edit manually. |

### 3. The files array

The `files` array controls what npm includes in the published tarball. Get this right:

```json
"files": [
  "skills/",
  "!skills/_artifacts"
]
```

- Include `"skills/"` (or the specific subdirectories containing your exported `SKILL.md` files).
- Exclude `"!skills/_artifacts"` -- the `_artifacts` directory contains build metadata (skill tree, domain map, spec) that is used for development only and must not ship.
- If you have other assets (README, supporting data), include those explicitly.
- Keep it tight: only ship what consumers need at runtime.

### 4. Publishing to npm (public packages)

For open-source or publicly shared packages, publish to the npm public registry:

```json
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org/"
}
```

Authenticate with npm:

```bash
npm login
```

Then publish:

```bash
agentpack publish validate path/to/skill-package
npm publish -w path/to/skill-package
```

### 5. Publishing to GitHub Packages (private/org packages)

For private or org-internal packages, publish to GitHub Packages:

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com"
}
```

Configure `.npmrc` in the publishing repo:

```ini
@acme:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Authenticate:

```bash
export GITHUB_PACKAGES_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Then publish:

```bash
agentpack publish validate path/to/skill-package
npm publish -w path/to/skill-package
```

For CI publishing in GitHub Actions:

```yaml
- name: Publish skill package
  env:
    GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_PACKAGES_TOKEN }}
  run: |
    cat << EOF > "$HOME/.npmrc"
    //npm.pkg.github.com/:_authToken=$GITHUB_PACKAGES_TOKEN
    EOF
    npm publish -w path/to/skill-package
```

### 6. Version bumping

agentpack reads but never writes the version. Bump it yourself before publishing:

```bash
npm version patch -w path/to/skill-package
```

Or `minor` / `major` depending on the change. If the repo uses Changesets, follow that flow instead of manual `npm version`.

### 7. Optional TanStack Intent metadata

agentpack publishes normal npm packages. The contract agentpack owns is:

- compiled skill exports
- package discovery via root `SKILL.md` and optional `agentpack.root`
- npm publish/install behavior

If the user also wants their package to participate in TanStack Intent's package ecosystem, treat that as upstream metadata, not an agentpack feature contract. agentpack does not currently validate or consume TanStack Intent-specific `package.json` fields.

If the user asks for TanStack Intent discoverability specifically:

- tell them to follow the current upstream TanStack Intent packaging docs
- keep that metadata separate from agentpack's required package shape
- do not imply that `agentpack publish validate` checks or guarantees TanStack Intent indexing

### 8. The dependency sync model

agentpack syncs `dependencies` in `package.json` from cross-package skill imports in exported skills, similar to how `go mod tidy` syncs `go.mod`:

1. Read cross-package skill imports from each exported `SKILL.md`
2. Compare against `dependencies` in `package.json`
3. Add cross-package requirements that are missing
4. Remove entries no longer referenced
5. Write `package.json`

This sync runs automatically during `agentpack author dev`. `agentpack publish validate` checks alignment but does not write. Never manually edit managed cross-package dependencies -- they will be overwritten on the next `author dev` run.

## Common Mistakes

### Forgetting to include skills in files

```json
// WRONG -- skills directory not included
"files": ["src/", "README.md"]

// CORRECT -- skills directory included
"files": ["skills/", "README.md"]
```

Without the skill directories in `files`, npm publishes an empty package. Consumers install it but get no skills. `agentpack publish validate` catches this when the `files` field exists.

### Publishing _artifacts

```json
// WRONG -- artifacts ship to consumers
"files": ["skills/"]

// CORRECT -- artifacts excluded
"files": ["skills/", "!skills/_artifacts"]
```

The `_artifacts` directory contains development metadata (skill tree YAML, domain map, spec). It is not needed at runtime and should never ship. Exclude it explicitly.

### Missing repository metadata

```json
// WRONG -- no repository field
{
  "name": "@acme/brand-copywriting",
  "version": "1.0.0"
}

// CORRECT -- repository declared
{
  "name": "@acme/brand-copywriting",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/acme-corp/knowledge-base.git"
  }
}
```

Scoped packages require a `repository` field. `agentpack publish validate` enforces this for `@scope/*` packages. Without it, consumers cannot trace the package back to its source.

### Wrong registry configuration

```json
// WRONG -- private package pointing at public registry
{
  "name": "@acme/internal-skills",
  "publishConfig": {
    "registry": "https://registry.npmjs.org/"
  }
}

// CORRECT -- private package pointing at GitHub Packages
{
  "name": "@acme/internal-skills",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Scoped packages intended for org-internal use must point at GitHub Packages (or another private registry). Publishing a private package to the public npm registry exposes it publicly. `agentpack publish validate` checks that `@scope/*` packages set `publishConfig.registry` to `https://npm.pkg.github.com`.

### Manually editing managed dependencies

```json
// WRONG -- manually adding a cross-package dependency
"dependencies": {
  "@acme/design-tokens": "^1.0.0"
}
```

If the dependency comes from a skill import, agentpack manages it. Manual edits get overwritten on the next `author dev` run. Only add dependencies manually if they are not skill-to-skill references.

### Hardcoding tokens in .npmrc

```ini
# WRONG -- token committed to repo
//npm.pkg.github.com/:_authToken=ghp_xxxxxxxxxxxxxxxxxxxx

# CORRECT -- token from environment variable
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Never hardcode authentication tokens. Use environment variables and set them in shell profiles or CI secrets.

### Skipping validation before publish

Publishing without validation risks shipping a broken package: missing skill paths, missing dependencies. Always run `agentpack publish validate` before `npm publish`. There is no undo for a published version.

## Publishing Checklist

Before running `npm publish`, confirm:

1. `agentpack publish validate` passes
2. `package.json` has `name`, `version`, `description`
3. `files` includes root `SKILL.md`, skill directories, and excludes `_artifacts`
4. Each discovered export `SKILL.md` has valid frontmatter
5. `repository` field points to the source repo
6. `publishConfig.registry` matches the intended registry
7. Version has been bumped since the last publish
8. `.npmrc` uses environment variable references, not hardcoded tokens
9. Cross-package dependencies derived from skill imports are managed (not manually edited)

## What Gets Published vs What Stays Local

| Artifact | Published | Stays local |
|---|---|---|
| `SKILL.md` files | Yes | -- |
| `package.json` | Yes | -- |
| `skills/_artifacts/` | No | Development metadata |
| `.agentpack/compiled.json` | No | Compiled state |
| `.agentpack/install.json` | No | Consumer install state |
| `.agentpack/dev-session.json` | No | Dev session state |
| `.agentpack/materialization-state.json` | No | Runtime state |
| Source knowledge files | No | Stay in authoring repo |

## References

Ground publishing decisions in [the publishing guide](source:publishingGuide){context="source of truth for the validate-publish-install cycle and consumer registry setup"}.

Use [the authentication guide](source:authenticationGuide){context="source of truth for npm registry wiring, token setup, and CI auth configuration"}.

Use [the package.json schema](source:packageJsonSchema){context="source of truth for required fields, validation checks, and the dependency sync model"}.
