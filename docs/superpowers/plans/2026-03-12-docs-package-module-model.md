# Package Module Docs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update public docs, built-in skill references, and intent validation guidance to reflect the package-backed skill module model and current CLI commands.

**Architecture:** Keep the update documentation-only and align all user-facing explanations around one core model: packages are distribution units, exported skills are runtime modules, and canonical references use `@scope/package:skill`. Refresh command docs and release/docs guidance where the old single-skill assumption leaks through.

**Tech Stack:** MDX docs, built-in `SKILL.md` files, TanStack Intent validation

---

## Chunk 1: Public Docs

**Files:**
- Modify: `docs/how-it-works.mdx`
- Modify: `docs/cli-skills.mdx`
- Modify: `docs/schema-package-json.mdx`
- Modify: `docs/skill-dependencies.mdx`

- [ ] Update core conceptual model language to distinguish packages from exported skills/modules.
- [ ] Document explicit `agentpack.skills` exports in `package.json`.
- [ ] Document canonical `@scope/package:skill` `requires` references.
- [ ] Refresh command descriptions/examples where install/materialization behavior changed.

## Chunk 2: Built-In Skill Guidance

**Files:**
- Modify: `skills/agentpack-cli/SKILL.md`
- Modify: `skills/agentpack-cli/references/skill-lifecycle.md`
- Modify: `skills/authoring-skillgraphs-from-knowledge/SKILL.md`
- Modify: `skills/authoring-skillgraphs-from-knowledge/references/authored-metadata.md`
- Modify: `skills/shipping-production-plugins-and-packages/SKILL.md`

- [ ] Update built-in skill instructions to teach package-backed modules and canonical references.
- [ ] Remove outdated one-package-one-skill assumptions where present.
- [ ] Align authoring/package guidance with the new explicit manifest contract.

## Chunk 3: Validation And Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-03-12-changesets-release-flow.md`

- [ ] Update release/validation notes if needed to match the current workflow/auth checks.
- [ ] Run `npm run intent:validate`.
- [ ] Run a quick targeted docs grep to confirm canonical examples exist in the updated surfaces.
