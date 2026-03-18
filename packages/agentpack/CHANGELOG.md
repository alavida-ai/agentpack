# Changelog

## 0.2.3

### Patch Changes

- [#86](https://github.com/alavida-ai/agentpack/pull/86) [`9426f96`](https://github.com/alavida-ai/agentpack/commit/9426f96761b8ea5120bd74ac07fd3fb104935eb8) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Fix external package navigation in the `author dev` workbench, replace authored package discovery config with the root-plus-`skills/` convention, and add top-level `agentpack materialize` for consumer runtime activation from installed workspace dependencies.

## 0.2.2

### Patch Changes

- [#83](https://github.com/alavida-ai/agentpack/pull/83) [`ec5c133`](https://github.com/alavida-ai/agentpack/commit/ec5c1336e462b229efc8d562510b217c4e00b526) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Preserve frontmatter in generated runtime `SKILL.md` files, materialize bound sources into runtime `references/` sidecars instead of inlining them, and clean up inline skill callsite rendering in bundled runtime output.

## 0.2.1

### Patch Changes

- [#78](https://github.com/alavida-ai/agentpack/pull/78) [`35d43fd`](https://github.com/alavida-ai/agentpack/commit/35d43fd64059c0348326ef743e4ebfdf5262cb71) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Fix dashboard to visualize full transitive skill graph dependencies instead of only direct imports

## 0.2.0

### Minor Changes

- [#75](https://github.com/alavida-ai/agentpack/pull/75) [`ada3ac6`](https://github.com/alavida-ai/agentpack/commit/ada3ac6125d7d46dc08444b39522d64b900220f7) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Refactor the compiler and dev runtime pipeline around package-partitioned compiled state and package-local runtime artifacts.

  - compile authored skill packages into package-keyed `.agentpack/compiled.json` state without clobbering other packages
  - emit package-local `dist/` runtime `SKILL.md` artifacts and materialize from built output instead of raw source
  - move dev/workbench onto shared build, runtime selection, and materialization services
  - improve dashboard graph behavior with internal vs external dependency typing, source provenance edges, and correct stale vs affected propagation
  - support relative validate/build targeting from package directories and nested workspace dependency discovery in `skills list`

## 0.1.13

### Patch Changes

- [#63](https://github.com/alavida-ai/agentpack/pull/63) [`60bb6c8`](https://github.com/alavida-ai/agentpack/commit/60bb6c8b1e4530740e42ea7c022c15f59a082656) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Fix compiler-first multi-skill package naming and publish validation behavior.

## 0.1.12

### Patch Changes

- [#58](https://github.com/alavida-ai/agentpack/pull/58) [`896df34`](https://github.com/alavida-ai/agentpack/commit/896df344cfd1c1cb36fbe06e4c4159df8614a85d) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Adopt compiler-first authored skill package workflows, split runtime materialization from package management, and align the CLI/docs with `author`, `publish validate`, and runtime `skills enable|disable|status`.

## 0.1.11

### Patch Changes

- [#52](https://github.com/alavida-ai/agentpack/pull/52) [`5f8f85d`](https://github.com/alavida-ai/agentpack/commit/5f8f85dc50f55157d5217045a510f35b1e8486ec) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Add tanstack-intent keyword and Intent CI workflows for skill validation, staleness checks, and change notifications

## 0.1.10

### Patch Changes

- [#48](https://github.com/alavida-ai/agentpack/pull/48) [`5dab678`](https://github.com/alavida-ai/agentpack/commit/5dab678560cdb3988a8863e7f244a1f5c8c9a73f) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Hard-delete the remaining legacy plugin-facing docs, packaged skill artifacts, and shipped plugin-oriented skills, and tighten the release contract so the old plugin surface cannot regress.

## 0.1.9

### Patch Changes

- [#46](https://github.com/alavida-ai/agentpack/pull/46) [`5d1c3b6`](https://github.com/alavida-ai/agentpack/commit/5d1c3b6255a72dbddbcdc66a1b2c8167addd427a) Thanks [@alexandergirardet](https://github.com/alexandergirardet)! - Enable changelog generation with GitHub PR links and add CI check that enforces changeset files on PRs

This file tracks important releases for the `@alavida-ai/agentpack` package.

## Unreleased

- placeholder entries will be replaced automatically by `changeset version`

## 0.1.7

- Clarified workbench messaging and fixed the empty-workbench install failure path.
