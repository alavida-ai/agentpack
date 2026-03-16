# Agentpack — Skill Spec

`agentpack` is a package-backed lifecycle CLI for source-backed agent skills. It helps teams turn source knowledge into maintained skillgraphs, keep those skillgraphs aligned with source truth over time, and debug local runtime state.

The maintainer framing is explicit: developers use `agentpack` to create and maintain skillgraphs so advanced skills do not go stale against knowledge.

## Domains

| Domain | Description | Skills |
| ------ | ----------- | ------ |
| starting and shaping a skillgraph | Reasoning about what should become a skill, how knowledge maps to packages, and how graph boundaries should be modeled. | getting-started-skillgraphs, identifying-skill-opportunities, authoring-skillgraphs-from-knowledge |
| keeping a skillgraph aligned with source truth | Reasoning about provenance, validation, stale detection, and metadata maintenance. | maintaining-skillgraph-freshness |
| developing and debugging runtime skill state | Reasoning about local dev links, runtime materialization, dependency inspection, and repair workflows. | developing-and-testing-skills |

## Skill Inventory

| Skill | Type | Domain | What it covers |
| ----- | ---- | ------ | -------------- |
| getting-started-skillgraphs | lifecycle | starting and shaping a skillgraph | first authoring loop, repo-root rule, inspect/validate/dev routing |
| identifying-skill-opportunities | core | starting and shaping a skillgraph | opportunity discovery, skill/package boundaries, and explicit requires edges |
| authoring-skillgraphs-from-knowledge | core | starting and shaping a skillgraph | SKILL.md, package.json, source provenance, requires, dependency sync |
| maintaining-skillgraph-freshness | lifecycle | keeping a skillgraph aligned with source truth | validate, stale, compiled state |
| developing-and-testing-skills | core | developing and debugging runtime skill state | author dev, unlink, local dashboard, local runtime links |

## Recommended Skill File Structure

- **Core skills:** identifying-skill-opportunities, authoring-skillgraphs-from-knowledge, developing-and-testing-skills
- **Lifecycle skills:** getting-started-skillgraphs, maintaining-skillgraph-freshness
- **Reference files:** command routing, capability boundaries, and local workbench behavior
