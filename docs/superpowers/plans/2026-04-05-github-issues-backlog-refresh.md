# Live GitHub Issues Backlog Refresh

Captured from `alavida-ai/agentpack` open issues on 2026-04-05.

## Current Open Issues

| Priority | Issue | Updated | Summary |
|---|---|---|---|
| 1 | `#98` | 2026-04-05 | Support JSON-based `agentpack` instruction blocks for grouped skill and source guidance in markdown. |
| 2 | `#97` | 2026-04-04 | Bundle `scripts/`, `lib/`, and `data/` into authored `dist/` closures for plugin-compatible distribution. |
| 3 | `#95` | 2026-03-31 | Codex local-skill activation conflicts with active `author dev` sessions. |
| 4 | `#94` | 2026-03-31 | Plugin skill disappears silently when `dist/` has not been built. |
| 5 | `#93` | 2026-03-30 | Compiler-mode rejects useful non-agentpack metadata frontmatter. |

## Shape Of The Queue

- The open backlog is down to five issues.
- `#98` is the newest product-facing documentation and renderer convention request.
- `#97`, `#95`, and `#94` all sit on the authored-runtime and local activation surface.
- `#93` remains an isolated compiler acceptance issue.

## Recommended Order

1. `#97`
2. `#94`
3. `#95`
4. `#93`
5. `#98`

## Why This Order

- `#97` is the concrete runtime-distribution defect. It breaks self-contained plugin delivery for skills that depend on bundled scripts and libraries.
- `#94` is the adjacent failure mode on the same authored `dist/` path and should ship with or immediately after the closure fix.
- `#95` is the next operational workflow problem on the same local-skill/runtime surface.
- `#93` is likely a smaller compiler contract change and can move independently once the authored-runtime fixes are stable.
- `#98` is important, but it appears to be a renderer/parser feature rather than a blocking runtime defect.

## Existing Plan Coverage

- `#97`: closely matches the authored bundle closure work in [2026-03-23-authored-plugin-closure-dist.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/plans/2026-03-23-authored-plugin-closure-dist.md)
- `#95`: related runtime/local activation behavior appears in [2026-03-16-agentpack-workspace-compiler-runtime-implementation.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/plans/2026-03-16-agentpack-compiler-runtime-implementation.md)
- `#93`: compiler behavior is covered by the compiler/runtime design docs, especially [2026-03-16-agentpack-workspace-compiler-runtime-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-16-agentpack-workspace-compiler-runtime-design.md)
- Harness baseline: [2026-03-15-agentpack-harness-design.md](/Users/alexandergirardet/alavida/agentpack/docs/superpowers/specs/2026-03-15-agentpack-harness-design.md)

## Notes

- This snapshot was generated from live GitHub issues via `gh issue list` against `alavida-ai/agentpack`.
- Older local backlog notes are stale relative to the current GitHub queue.
- There is existing unrelated local work in `sandbox/acme-demo` and an untracked `2026-04-02` refresh note; this refresh intentionally does not modify them.
