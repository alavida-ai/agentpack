# Acme Demo Sandbox Submodule Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sandbox/acme-demo/` to `agentpack` as a pinned git submodule to a standalone Acme demo repo, and document it as the default human-usable sandbox for demos and manual lifecycle testing.

**Architecture:** Keep demo content in its own repository so `.git` remains the repo-root boundary for both `agentpack` and `agonda-cli`. `agentpack` should only own the submodule pointer plus docs about how to initialize, update, and use the sandbox; the actual Acme repo content lives and evolves independently.

**Tech Stack:** Git submodules, existing `agentpack` CLI, markdown/JSON/package metadata, existing docs

---

## File Structure

### `agentpack` repo files to modify

- `.gitmodules`
  Register `sandbox/acme-demo` as a submodule.
- `README.md`
  Position the sandbox as the preferred repo-local demo/manual-testing target and document submodule setup.
- `docs/live-validation.mdx`
  Mention the Acme sandbox as the local demo path inside this repo.
- `docs/fixtures.mdx`
  Clarify that the sandbox is separate from automated fixtures.
- `docs/testing.mdx`
  Clarify that the sandbox is the human demo surface, not the primary automated harness.
- `sandbox/acme-demo`
  Submodule entry tracked by git, not normal checked-in files.

### `acme-demo` standalone repo files to create or modify

- `README.md`
  Human sandbox walkthrough with the hero flow.
- `package.json`
  Root package metadata for the standalone demo repo.
- `.agentpack/build-state.json`
  Committed authored build-state.
- `.agentpack/catalog.json`
  Committed authored catalog.
- `domains/brand/knowledge/tone-of-voice.md`
  Believable source doc.
- `domains/brand/knowledge/value-propositions.md`
  Believable source doc.
- `domains/brand/knowledge/proof-points.md`
  Believable source doc.
- `domains/brand/skills/copywriting/SKILL.md`
  Hero packaged skill with `metadata.sources` and packaged `requires`.
- `domains/brand/skills/copywriting/package.json`
  Package metadata for the hero skill.
- `domains/research/skills/interview-research/SKILL.md`
  Supporting packaged research skill.
- `domains/research/skills/interview-research/package.json`
  Package metadata for the research skill.
- `domains/methodology/skills/editorial-principles/SKILL.md`
  Supporting packaged methodology skill.
- `domains/methodology/skills/editorial-principles/package.json`
  Package metadata for the methodology skill.
- `workbenches/website-dev/workbench.json`
  Minimal workbench shell.
- `workbenches/website-dev/skills/copywriter/SKILL.md`
  Local workbench skill requiring the packaged hero skill.
- `workbenches/website-dev/skills/landing-page-auditor/SKILL.md`
  Optional second local workbench skill requiring packaged skills.

## Chunk 1: Wire The Submodule Into `agentpack`

### Task 1: Add the failing submodule expectation

**Files:**
- Modify: `.gitmodules`
- Check: `sandbox/acme-demo`

- [ ] **Step 1: Verify the submodule is not present yet**

Run:

```bash
git submodule status
```

Expected: no `sandbox/acme-demo` entry

- [ ] **Step 2: Add the submodule**

Run:

```bash
git submodule add <acme-demo-repo-url> sandbox/acme-demo
```

Use the real standalone repo URL once it exists.

- [ ] **Step 3: Verify the submodule is registered**

Run:

```bash
git submodule status
git config -f .gitmodules --get-regexp '^submodule\.sandbox/acme-demo\.(path|url)$'
```

Expected: `sandbox/acme-demo` appears with path and URL

- [ ] **Step 4: Commit**

```bash
git add .gitmodules sandbox/acme-demo
git commit -m "feat: add acme demo sandbox submodule"
```

### Task 2: Document submodule setup in `agentpack`

**Files:**
- Modify: `README.md`
- Modify: `docs/live-validation.mdx`
- Modify: `docs/fixtures.mdx`
- Modify: `docs/testing.mdx`

- [ ] **Step 1: Write the failing docs grep**

Run:

```bash
rg -n "submodule|acme-demo|sandbox/acme-demo" README.md docs
```

Expected: missing or incomplete references to the submodule-based sandbox

- [ ] **Step 2: Write the minimal doc updates**

Add:

- the sandbox exists at `sandbox/acme-demo`
- it is a git submodule
- contributors should run:

```bash
git submodule update --init --recursive
```

- it is the preferred human demo/manual-testing target
- it is separate from `test/fixtures`

- [ ] **Step 3: Verify docs**

Run:

```bash
rg -n "submodule|acme-demo|sandbox/acme-demo" README.md docs
```

Expected: matches in all updated docs

- [ ] **Step 4: Commit**

```bash
git add README.md docs/live-validation.mdx docs/fixtures.mdx docs/testing.mdx
git commit -m "docs: add acme sandbox submodule setup"
```

## Chunk 2: Build The Standalone `acme-demo` Repo

### Task 3: Create the standalone repo skeleton inside the submodule

**Files:**
- Create in submodule: `README.md`
- Create in submodule: `package.json`
- Create in submodule: `.agentpack/build-state.json`
- Create in submodule: `.agentpack/catalog.json`

- [ ] **Step 1: Verify the repo skeleton is missing**

Run inside the submodule:

```bash
cd sandbox/acme-demo && test -f README.md && test -f package.json
```

Expected: exit code non-zero before content exists

- [ ] **Step 2: Write the minimal root files**

Use:

`package.json`

```json
{
  "name": "@acme/demo-monorepo",
  "private": true,
  "version": "0.0.0"
}
```

`README.md`

```md
# Acme Demo Sandbox

Standalone demo monorepo for manually exercising `agentpack` and related tools.
```

`build-state.json`

```json
{
  "version": 1,
  "skills": {}
}
```

`catalog.json`

```json
{
  "version": 1,
  "skills": []
}
```

- [ ] **Step 3: Verify the files exist**

Run:

```bash
cd sandbox/acme-demo && test -f README.md && test -f package.json && test -f .agentpack/build-state.json && test -f .agentpack/catalog.json
```

Expected: exit code 0

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add README.md package.json .agentpack
git commit -m "feat: add acme demo repo skeleton"
```

### Task 4: Add believable Acme source files

**Files:**
- Create in submodule: `domains/brand/knowledge/tone-of-voice.md`
- Create in submodule: `domains/brand/knowledge/value-propositions.md`
- Create in submodule: `domains/brand/knowledge/proof-points.md`

- [ ] **Step 1: Verify the sources are missing**

Run:

```bash
cd sandbox/acme-demo && test -f domains/brand/knowledge/tone-of-voice.md
```

Expected: exit code non-zero

- [ ] **Step 2: Write minimal believable content**

Use content that mentions:

- Acme tone/voice
- provenance and lifecycle visibility
- concrete product value claims

- [ ] **Step 3: Verify the content**

Run:

```bash
cd sandbox/acme-demo && rg -n "Acme|provenance|stale|workflow" domains/brand/knowledge
```

Expected: matches in the new files

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add domains/brand/knowledge
git commit -m "feat: add acme demo knowledge sources"
```

### Task 5: Add packaged skills with provenance and dependency edges

**Files:**
- Create in submodule: `domains/methodology/skills/editorial-principles/SKILL.md`
- Create in submodule: `domains/methodology/skills/editorial-principles/package.json`
- Create in submodule: `domains/research/skills/interview-research/SKILL.md`
- Create in submodule: `domains/research/skills/interview-research/package.json`
- Create in submodule: `domains/brand/skills/copywriting/SKILL.md`
- Create in submodule: `domains/brand/skills/copywriting/package.json`

- [ ] **Step 1: Write the failing inspect expectation**

Run:

```bash
node bin/agentpack.js skills inspect sandbox/acme-demo/domains/brand/skills/copywriting
```

Expected: FAIL before the packaged skills exist

- [ ] **Step 2: Write the minimal packaged skills**

Requirements:

- `@acme/editorial-principles` with no sources
- `@acme/interview-research` requiring `@acme/editorial-principles`
- `@acme/brand-copywriting` with `metadata.sources` pointing at the brand knowledge files and `requires` pointing at the two supporting packaged skills

- [ ] **Step 3: Verify the packaged skills**

Run:

```bash
node bin/agentpack.js skills inspect sandbox/acme-demo/domains/brand/skills/copywriting
node bin/agentpack.js skills inspect sandbox/acme-demo/domains/research/skills/interview-research
```

Expected: PASS and show sources/requires correctly

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add domains/brand/skills domains/research/skills domains/methodology/skills
git commit -m "feat: add acme packaged skills"
```

### Task 6: Add local workbench skills that point at packaged skills

**Files:**
- Create in submodule: `workbenches/website-dev/workbench.json`
- Create in submodule: `workbenches/website-dev/skills/copywriter/SKILL.md`
- Create in submodule: `workbenches/website-dev/skills/landing-page-auditor/SKILL.md`

- [ ] **Step 1: Write the failing local skill inspect expectation**

Run:

```bash
node bin/agentpack.js skills inspect sandbox/acme-demo/workbenches/website-dev/skills/copywriter
```

Expected: FAIL before the local workbench skills exist

- [ ] **Step 2: Write the minimal workbench files**

Requirements:

- `copywriter` requires `@acme/brand-copywriting`
- `landing-page-auditor` requires `@acme/brand-copywriting` and `@acme/interview-research`

- [ ] **Step 3: Verify the local workbench skills**

Run:

```bash
node bin/agentpack.js skills inspect sandbox/acme-demo/workbenches/website-dev/skills/copywriter
```

Expected: PASS and shows packaged `requires`

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add workbenches/website-dev
git commit -m "feat: add acme website-dev workbench skills"
```

## Chunk 3: Commit Demo Metadata And Walkthrough

### Task 7: Generate and commit sandbox metadata from inside the submodule

**Files:**
- Modify in submodule: `.agentpack/build-state.json`
- Modify in submodule: `.agentpack/catalog.json`

- [ ] **Step 1: Run validation from inside the standalone repo**

Run:

```bash
cd sandbox/acme-demo && node ../../bin/agentpack.js skills validate
```

Expected: PASS with source paths resolving correctly because the submodule has its own `.git`

- [ ] **Step 2: Verify stale visibility baseline**

Run:

```bash
cd sandbox/acme-demo && node ../../bin/agentpack.js skills stale
```

Expected: sensible baseline output and meaningful `.agentpack` metadata

- [ ] **Step 3: Verify metadata content**

Run:

```bash
cd sandbox/acme-demo && rg -n "@acme/brand-copywriting|tone-of-voice|value-propositions" .agentpack
```

Expected: matches in committed metadata files

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add .agentpack
git commit -m "feat: commit acme demo metadata"
```

### Task 8: Write the sandbox walkthrough inside the submodule

**Files:**
- Modify in submodule: `README.md`

- [ ] **Step 1: Write the failing README grep**

Run:

```bash
cd sandbox/acme-demo && rg -n "skills dev|skills stale|tone-of-voice|website-dev|brand-copywriting" README.md
```

Expected: missing one or more key demo references

- [ ] **Step 2: Write the README walkthrough**

Include:

- what the sandbox is
- that workbench-local skills require packaged skills
- that packaged skills point at source files for the DAG
- the hero commands:

```bash
cd sandbox/acme-demo
node ../../bin/agentpack.js skills inspect domains/brand/skills/copywriting
node ../../bin/agentpack.js skills validate domains/brand/skills/copywriting
node ../../bin/agentpack.js skills dev domains/brand/skills/copywriting
```

- the exact file to edit:

```text
domains/brand/knowledge/tone-of-voice.md
```

- [ ] **Step 3: Verify the README**

Run:

```bash
cd sandbox/acme-demo && rg -n "skills dev|skills stale|tone-of-voice|website-dev|brand-copywriting" README.md
```

Expected: all demo touchpoints present

- [ ] **Step 4: Commit inside the submodule**

```bash
cd sandbox/acme-demo
git add README.md
git commit -m "docs: add acme sandbox walkthrough"
```

## Chunk 4: Final Outer-Repo Verification

### Task 9: Update the submodule pointer and verify the hero flow

**Files:**
- Modify: `sandbox/acme-demo` (submodule pointer)
- Check: `README.md`
- Check: `docs/live-validation.mdx`
- Check: `docs/fixtures.mdx`
- Check: `docs/testing.mdx`

- [ ] **Step 1: Stage the updated submodule pointer in `agentpack`**

Run:

```bash
git status --short
```

Expected: `sandbox/acme-demo` shows as modified in the outer repo after submodule commits

- [ ] **Step 2: Verify the hero flow against the submodule**

Run:

```bash
cd sandbox/acme-demo && node ../../bin/agentpack.js skills inspect domains/brand/skills/copywriting
cd sandbox/acme-demo && node ../../bin/agentpack.js skills dependencies @acme/brand-copywriting
cd sandbox/acme-demo && node ../../bin/agentpack.js skills stale
cd sandbox/acme-demo && node ../../bin/agentpack.js skills inspect workbenches/website-dev/skills/copywriter
```

Expected:

- packaged skill inspect shows believable sources and requires
- dependencies shows the packaged graph
- stale uses the committed metadata baseline
- local workbench skill inspect shows packaged-skill requirements

- [ ] **Step 3: Run the project test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit the outer repo updates**

```bash
git add .gitmodules sandbox/acme-demo README.md docs/live-validation.mdx docs/fixtures.mdx docs/testing.mdx
git commit -m "feat: add acme demo sandbox submodule"
```
