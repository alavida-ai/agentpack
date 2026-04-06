# Live GitHub Issues Backlog Refresh

Captured from `alavida-ai/agentpack` open issues on 2026-04-02.

## Current Open Issues

| Priority | Issue | Updated | Summary |
|---|---|---|---|
| 1 | `#95` | 2026-03-31 | Codex local-skill activation conflicts with an active `author dev` session. |
| 2 | `#94` | 2026-03-31 | Plugin skill disappears silently when `dist/` has not been built. |
| 3 | `#93` | 2026-03-30 | Compiler-mode rejects useful non-agentpack frontmatter metadata. |
| 4 | `#90` | 2026-03-23 | `materialize` omits dependency skills from authored `dist/` bundles. |
| 5 | `#89` | 2026-03-20 | Published npm version is missing the `materialize` command. |
| 6 | `#77` | 2026-03-17 | Add catalog-backed skill discovery and search. |
| 7 | `#74` | 2026-03-17 | Compile authoring syntax into runtime-optimized skill output. |
| 8 | `#73` | 2026-03-17 | `author dev` validates unrelated sibling skills and blocks targeted work. |
| 9 | `#67` | 2026-03-17 | `skills list` should surface newer registry versions. |
| 10 | `#60` | 2026-03-16 | Extend the compiler graph to knowledge files, testing, and reporting. |
| 11 | `#45` | 2026-03-16 | Build the isolated agent-eval sandbox harness. |

## Dependency Shape

- `#90` is the runtime-bundle correctness bug.
- `#94` is the user-facing failure mode around that authored/plugin bundle path and should be fixed in the same stream or immediately after `#90`.
- `#89` is a release follow-up after the implementation behind `materialize` is correct.
- `#95` is adjacent to the same runtime/materialization surface, but it is a larger workflow issue than `#90` and `#94`.
- `#93` is independent and small enough to ship separately once the compiler contract is clear.
- `#74` and `#73` still map to the workspace compiler/runtime design in [2026-03-16-agentpack-workspace-compiler-runtime-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-16-agentpack-workspace-compiler-runtime-design.md).
- `#45` remains a foundation item for broader autonomous evaluation, but it should not block closing the current authored-runtime defects if those fixes are covered by the existing harness layers.

## Recommended Order

1. `#90` and `#94` together.
2. `#95`.
3. `#93`.
4. `#89`.
5. `#73`.
6. `#74`.
7. `#67`.
8. `#77`.
9. `#45`.
10. `#60`.

## Why This Order

- `#90` is the concrete runtime defect that breaks self-contained plugin bundles.
- `#94` is the missing guardrail on the same path; fixing only the error message without fixing bundle behavior leaves the core path weak.
- `#95` is the next highest user pain because it blocks Codex local-skill workflows in active repos.
- `#93` is likely a smaller compiler acceptance change and does not need to wait on the larger workflow items.
- `#89` should happen only after the shipped command behavior is correct.
- `#45` is important, but the repo already has harness design and several existing automated layers. It should shape new implementation work, not delay obvious high-signal bugfixes that can already be covered by repo-lab and integration harnesses.

## Existing Plan Coverage

- `#90`: existing implementation plan in [2026-03-23-authored-plugin-closure-dist.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/plans/2026-03-23-authored-plugin-closure-dist.md)
- older March issue cluster (`#24`, `#26`, `#37`, `#10`, `#29`): [2026-03-15-github-issues-backlog.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/plans/2026-03-15-github-issues-backlog.md)
- `#74`, `#73`, `#67`: design notes in [2026-03-16-agentpack-workspace-compiler-runtime-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-16-agentpack-workspace-compiler-runtime-design.md)
- harness baseline: [2026-03-15-agentpack-harness-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-15-agentpack-harness-design.md)

## Start-Now Shortlist

If the goal is to address issues immediately in this repo, start with:

1. `#90`: finish the authored `dist/` closure fix using the existing plan and integration harness.
2. `#94`: add an explicit missing-`dist/` failure path or documented prebuild guard in the same area.
3. `#95`: design a Codex-specific local activation flow that does not require tearing down an unrelated `author dev` session.

## Notes

- The local backlog document from 2026-03-15 is now stale relative to the live GitHub queue.
- There is a dirty local change at `sandbox/acme-demo`; avoid touching it while working through the issue backlog.
