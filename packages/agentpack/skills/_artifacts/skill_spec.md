# Agentpack — Skill Spec

`agentpack` is a package-backed lifecycle CLI for sophisticated agent skills and plugins. It helps teams turn source knowledge into maintained skillgraphs, keep those skillgraphs aligned with source truth over time, debug local runtime state, and ship production-ready plugin artifacts or reusable packages.

The maintainer's framing is explicit: developers use `agentpack` to create and maintain skillgraphs so advanced skills do not go stale against knowledge, and to create production-ready plugins.

## Domains

| Domain | Description | Skills |
| ------ | ----------- | ------ |
| starting and shaping a skillgraph | Reasoning about what should become a skill, how knowledge maps to packages, and how graph boundaries should be modeled. | getting-started-skillgraphs, identifying-skill-opportunities, authoring-skillgraphs-from-knowledge |
| keeping a skillgraph aligned with source truth | Reasoning about provenance, validation, stale detection, and metadata maintenance. | maintaining-skillgraph-freshness |
| developing and debugging runtime skill state | Reasoning about local dev links, runtime materialization, dependency inspection, and repair workflows. | developing-and-testing-skills, repairing-broken-skill-or-plugin-state |
| shipping deployable plugin artifacts | Reasoning about plugin-local skills, bundle closure, and production artifact validation. | shipping-production-plugins-and-packages |

## Skill Inventory

| Skill | Type | Domain | What it covers | Failure modes |
| ----- | ---- | ------ | -------------- | ------------- |
| getting-started-skillgraphs | lifecycle | starting and shaping a skillgraph | first authoring loop, repo-root rule, inspect/validate/dev routing | 3 |
| identifying-skill-opportunities | core | starting and shaping a skillgraph | opportunity discovery, skill/package boundaries, requires edges, packaged vs plugin-local capability | 3 |
| authoring-skillgraphs-from-knowledge | core | starting and shaping a skillgraph | SKILL.md, package.json, metadata.sources, requires, dependency sync | 3 |
| maintaining-skillgraph-freshness | lifecycle | keeping a skillgraph aligned with source truth | validate, stale, build-state, catalog | 3 |
| developing-and-testing-skills | core | developing and debugging runtime skill state | skills dev, unlink, local dashboard, local runtime links | 3 |
| repairing-broken-skill-or-plugin-state | lifecycle | developing and debugging runtime skill state | missing dependencies, dependency/status/env inspection, plugin diagnostics | 3 |
| shipping-production-plugins-and-packages | core | shipping deployable plugin artifacts | plugin inspect/validate/build/dev, release-readiness, deployable artifacts | 3 |

## Failure Mode Inventory

### getting-started-skillgraphs (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | running authoring commands from the wrong repo | CRITICAL | docs/introduction.mdx | — |
| 2 | starting with install instead of authoring validation | HIGH | skills/agentpack-cli/SKILL.md | — |
| 3 | treating the dev dashboard as the authoring surface | MEDIUM | docs/commands.mdx | — |

### identifying-skill-opportunities (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | copying knowledge into one giant skill | HIGH | maintainer interview | — |
| 2 | using plugin boundaries as the dependency model | CRITICAL | docs/architecture.mdx | shipping-production-plugins-and-packages |
| 3 | omitting provenance sources for knowledge-backed skills | CRITICAL | docs/architecture.mdx | authoring-skillgraphs-from-knowledge |

### authoring-skillgraphs-from-knowledge (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | editing package dependencies instead of requires | CRITICAL | skills/agentpack-cli/SKILL.md | maintaining-skillgraph-freshness |
| 2 | shipping a skill package without SKILL.md in files | HIGH | docs/commands.mdx | — |
| 3 | using missing or invalid package metadata | HIGH | docs/commands.mdx | shipping-production-plugins-and-packages |

### maintaining-skillgraph-freshness (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | treating stale detection as automatic without validate | CRITICAL | docs/commands.mdx | developing-and-testing-skills |
| 2 | not committing build-state and catalog in authoring repos | HIGH | README.md | — |
| 3 | using install-state as authored provenance | MEDIUM | docs/current-state.mdx | repairing-broken-skill-or-plugin-state |

### developing-and-testing-skills (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | expecting the current agent session to pick up new links | HIGH | README.md | — |
| 2 | assuming unresolved requires block local dev links | MEDIUM | docs/commands.mdx | repairing-broken-skill-or-plugin-state |
| 3 | using no-dashboard mode and expecting workbench actions | MEDIUM | docs/introduction.mdx | — |

### repairing-broken-skill-or-plugin-state (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | debugging plugin bundle failures without inspect | HIGH | docs/commands.mdx | shipping-production-plugins-and-packages |
| 2 | treating affected dependents as healthy because they still resolve | HIGH | docs/current-state.mdx | maintaining-skillgraph-freshness |
| 3 | repairing missing runtime state by hand-editing local materializations | MEDIUM | docs/architecture.mdx | developing-and-testing-skills |

### shipping-production-plugins-and-packages (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | ------- | -------- | ------ | ------------ |
| 1 | declaring plugin-local skill requires without matching devDependencies | CRITICAL | docs/commands.mdx | repairing-broken-skill-or-plugin-state |
| 2 | forgetting the plugin manifest and expecting validate to infer it | HIGH | docs/commands.mdx | — |
| 3 | assuming a packaged skill and a bundled plugin are the same release unit | HIGH | README.md | identifying-skill-opportunities |

## Tensions

| Tension | Skills | Agent implication |
| ------- | ------ | ----------------- |
| fast local iteration vs governed source truth | developing-and-testing-skills ↔ maintaining-skillgraph-freshness | agents can optimize for quick local success and leave authored provenance drifting |
| simple delivery shell vs reusable graph boundaries | identifying-skill-opportunities ↔ shipping-production-plugins-and-packages | agents can hide reusable capability edges inside plugins instead of keeping them explicit |
| empty-repo simplicity vs production-ready lifecycle discipline | getting-started-skillgraphs ↔ shipping-production-plugins-and-packages | agents can follow only the happy path and miss release-readiness requirements |

## Cross-References

| From | To | Reason |
| ---- | -- | ------ |
| getting-started-skillgraphs | authoring-skillgraphs-from-knowledge | the first working loop should immediately feed into correct packaged skill authoring |
| authoring-skillgraphs-from-knowledge | maintaining-skillgraph-freshness | provenance choices determine whether stale detection stays meaningful |
| developing-and-testing-skills | repairing-broken-skill-or-plugin-state | runtime iteration often exposes dependency and state problems that need explicit repair flows |
| shipping-production-plugins-and-packages | identifying-skill-opportunities | deployable packaging quality depends on graph boundaries chosen earlier |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
| ----- | ---------- | -------------------- |
| getting-started-skillgraphs | — | command routing and lifecycle stage selection |
| identifying-skill-opportunities | — | skill/package/plugin boundary heuristics |
| authoring-skillgraphs-from-knowledge | — | authored metadata and release-readiness checklist |
| maintaining-skillgraph-freshness | — | build-state and catalog metadata behavior |
| developing-and-testing-skills | — | local workbench actions and runtime link behavior |
| repairing-broken-skill-or-plugin-state | — | diagnostic interpretation for status, missing, dependencies, and plugin inspect |
| shipping-production-plugins-and-packages | — | plugin bundle closure and production validation rules |

## Remaining Gaps

| Skill | Question | Status |
| ----- | -------- | ------ |
| identifying-skill-opportunities | Split when knowledge should be reused as a composable capability; compose task-specific skills with `requires` rather than flattening them. | resolved |
| repairing-broken-skill-or-plugin-state | Prioritize stale-skill repair as the first guided repair path. | resolved |
| shipping-production-plugins-and-packages | Recommend bundled plugins when shipping several skills together, hooks, or MCP tools; otherwise favor standalone reusable packages. | resolved |

## Recommended Skill File Structure

- **Core skills:** identifying-skill-opportunities, authoring-skillgraphs-from-knowledge, developing-and-testing-skills, shipping-production-plugins-and-packages
- **Framework skills:** none identified; the library is framework-agnostic
- **Lifecycle skills:** getting-started-skillgraphs, maintaining-skillgraph-freshness, repairing-broken-skill-or-plugin-state
- **Composition skills:** none yet; the maintainer indicated the library has what it needs right now
- **Reference files:** likely useful for command routing, bundle diagnostics, and skill/package/plugin boundary heuristics

## Composition Opportunities

| Library | Integration points | Composition skill needed? |
| ------- | ------------------ | ------------------------- |
| npm / GitHub Packages | package publication, dependency resolution, plugin vendoring | no |
| Claude / Codex skill dirs | repo-local materialization into `.claude/skills` and `.agents/skills` | no |
| TanStack Intent | shipped-skill validation and install flow | no |
