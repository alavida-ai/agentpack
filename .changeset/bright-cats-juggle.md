---
"@alavida/agentpack": minor
---

Refactor the compiler and dev runtime pipeline around package-partitioned compiled state and package-local runtime artifacts.

- compile authored skill packages into package-keyed `.agentpack/compiled.json` state without clobbering other packages
- emit package-local `dist/` runtime `SKILL.md` artifacts and materialize from built output instead of raw source
- move dev/workbench onto shared build, runtime selection, and materialization services
- improve dashboard graph behavior with internal vs external dependency typing, source provenance edges, and correct stale vs affected propagation
- support relative validate/build targeting from package directories and nested workspace dependency discovery in `skills list`
