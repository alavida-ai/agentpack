# Agentpack Autonomous Agent-Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the final outer-loop harness that dispatches fresh Claude Code agents into isolated E2B sandboxes, runs realistic agentpack tasks against synthetic and real repos, captures confusion and UX friction, and stores replayable result bundles.

**Architecture:** Keep the existing local harness as the deterministic inner loop, and add a separate autonomous eval runner on top. The runner provisions an E2B sandbox, prepares the repo under test and the agentpack build under test, launches Claude Code inside the sandbox, optionally opens the workbench through E2B Desktop, captures transcript/commands/screenshots/diffs, and grades both objective success and product friction. The scenario matrix is the source of truth for what we test.

**Tech Stack:** Node.js, npm, E2B JS SDK, `@e2b/desktop`, Claude Code CLI, Playwright, git, existing agentpack CLI/runtime, JSON result bundles

---

## File Structure

### New Runtime Files

- Create: `scripts/run-agent-evals.mjs`
  - top-level CLI entrypoint for autonomous agent evals
- Create: `scripts/agent-eval/scenarios.js`
  - scenario catalog and schema validation
- Create: `scripts/agent-eval/prepare-sandbox.mjs`
  - E2B sandbox creation, repo prep, env prep
- Create: `scripts/agent-eval/run-claude-code.mjs`
  - Claude Code launch and transcript capture
- Create: `scripts/agent-eval/log-learning-event.mjs`
  - append-only learning log helper used by the harness hook/wrapper
- Create: `scripts/agent-eval/run-browser-checks.mjs`
  - dashboard/browser integration using `@e2b/desktop` and Playwright
- Create: `scripts/agent-eval/grade-run.mjs`
  - objective and friction scoring
- Create: `scripts/agent-eval/write-result-bundle.mjs`
  - artifact persistence
- Create: `scripts/agent-eval/redact-secrets.mjs`
  - transcript/result redaction helpers
- Create: `scripts/agent-eval/sandbox-template/`
  - pinned E2B template config and Dockerfile if needed

### New Tests

- Create: `test/agent-eval/scenarios.test.js`
  - scenario schema and catalog validation
- Create: `test/agent-eval/prepare-sandbox.test.js`
  - sandbox prep and env shaping
- Create: `test/agent-eval/run-claude-code.test.js`
  - runner behavior with a fake Claude subprocess
- Create: `test/agent-eval/grade-run.test.js`
  - grading and friction classification
- Create: `test/agent-eval/write-result-bundle.test.js`
  - artifact bundle correctness
- Create: `test/agent-eval/run-browser-checks.test.js`
  - browser observer behavior with stubs
- Create: `test/integration/agent-eval-smoke.test.js`
  - local smoke contract around the top-level runner without E2B network dependency

### Docs And Config

- Modify: `package.json`
  - add `test:agent-evals` and any supporting scripts
- Modify: `README.md`
  - document the autonomous eval harness and how it complements `test:sandboxes`
- Modify: `packages/agentpack/README.md`
  - same as root README
- Modify: `AGENTS.md`
  - require this harness for agent-facing UX work once available
- Modify: `CLAUDE.md`
  - same harness-first rule

### Optional Result Output Paths

- Create on demand: `eval-results/<run-id>/...`
  - structured output bundles for completed runs

## Chunk 1: Lock Scenario And Result Schemas

### Task 1: Define scenario schema and starter catalog

**Files:**
- Create: `scripts/agent-eval/scenarios.js`
- Create: `test/agent-eval/scenarios.test.js`
- Reference: `docs/superpowers/specs/2026-03-15-agentpack-autonomous-agent-eval-harness-design.md`

- [ ] **Step 1: Write the failing schema tests**

Cover:
- required scenario fields
- valid run modes: `autonomous`, `checkpointed`
- valid repo sources: `synthetic`, `agonda`, `superpowers`
- valid task classes
- at least one starter scenario per user-story group

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/scenarios.test.js
```

Expected:
- FAIL because `scripts/agent-eval/scenarios.js` does not exist

- [ ] **Step 3: Implement the scenario schema and starter scenarios**

Include starter scenarios for:
- synthetic install
- synthetic new-skill authoring
- synthetic stale repair
- synthetic runtime drift
- `agonda` validate/publish-style task
- `superpowers` conversion/debug task
- dashboard/dev task

Store:
- scenario id
- repo source
- prompt
- success criteria
- run mode
- budgets
- browser requirements
- expected artifacts

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/scenarios.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-eval/scenarios.js test/agent-eval/scenarios.test.js
git commit -m "feat: add agent eval scenario schema"
```

### Task 2: Define result bundle, learning log, and final report schemas

**Files:**
- Modify: `scripts/agent-eval/scenarios.js`
- Create: `test/agent-eval/write-result-bundle.test.js`
- Create: `scripts/agent-eval/write-result-bundle.mjs`
- Create: `scripts/agent-eval/log-learning-event.mjs`

- [ ] **Step 1: Write the failing result bundle tests**

Assert:
- bundle layout
- required JSON files
- transcript path
- screenshots path
- append-only learning log shape
- final markdown and JSON report shapes
- grader output shape

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/write-result-bundle.test.js
```

Expected:
- FAIL because writer implementation does not exist

- [ ] **Step 3: Implement bundle writer**

Emit:
- `scenario.json`
- `sandbox.json`
- `transcript.ndjson`
- `commands.ndjson`
- `browser.ndjson`
- `learning-log.ndjson`
- `grader.json`
- `report.json`
- `report.md`
- `summary.md`

- [ ] **Step 3a: Add the learning log helper**

Support:
- append-only NDJSON writes
- low-noise event kinds like `pain_point`, `learning`, `wrong_turn`, `helpful_signal`, `checkpoint`
- a stable schema suitable for later aggregation

- [ ] **Step 3b: Ensure the bundle writer persists both raw and synthesized feedback**

Persist:
- raw `learning-log.ndjson`
- human-readable `report.md`
- structured `report.json`

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/write-result-bundle.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-eval/write-result-bundle.mjs test/agent-eval/write-result-bundle.test.js scripts/agent-eval/scenarios.js
git add scripts/agent-eval/log-learning-event.mjs
git commit -m "feat: add agent eval learning log and result bundle writer"
```

## Chunk 2: Add E2B Sandbox Provisioning

### Task 3: Implement sandbox preparation around real E2B APIs

**Files:**
- Create: `scripts/agent-eval/prepare-sandbox.mjs`
- Create: `test/agent-eval/prepare-sandbox.test.js`
- Create: `scripts/agent-eval/sandbox-template/README.md`
- Create: `scripts/agent-eval/sandbox-template/e2b.toml`
- Optional Create: `scripts/agent-eval/sandbox-template/e2b.Dockerfile`

**Docs to use:**
- E2B sandbox creation and command execution
- E2B template build docs
- E2B `getHost()` style host exposure for sandbox-local servers

- [ ] **Step 1: Write failing preparation tests**

Assert:
- sandbox config is built from scenario
- repo source paths are resolved
- env vars are shaped for Claude Code and agentpack
- task repo and tool repo paths are kept distinct

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/prepare-sandbox.test.js
```

Expected:
- FAIL because sandbox provisioner does not exist

- [ ] **Step 3: Implement `prepareSandbox()`**

Use E2B concepts explicitly:
- create sandbox from pinned template
- run commands in sandbox with sandbox command APIs
- copy or clone repos into the sandbox
- expose prepared directories and env config back to the runner

The function should return:
- sandbox instance metadata
- task repo path
- tool repo path or installed CLI path
- env block
- browser capability flag

- [ ] **Step 4: Add template metadata**

Document or encode:
- Node/npm
- Playwright
- Claude Code CLI
- git
- agentpack prerequisites

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/prepare-sandbox.test.js
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-eval/prepare-sandbox.mjs scripts/agent-eval/sandbox-template test/agent-eval/prepare-sandbox.test.js
git commit -m "feat: add e2b sandbox preparation for agent evals"
```

## Chunk 3: Add Claude Code Runner

### Task 4: Implement Claude Code session runner

**Files:**
- Create: `scripts/agent-eval/run-claude-code.mjs`
- Create: `test/agent-eval/run-claude-code.test.js`

- [ ] **Step 1: Write failing runner tests**

Assert:
- prompt is constructed from scenario
- cwd is set to the task repo
- transcript events are captured
- learning events can be appended during the run
- autonomous mode does not inject messages
- checkpointed mode can inject bounded nudges
- timeouts stop the run cleanly

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/run-claude-code.test.js
```

Expected:
- FAIL because runner implementation does not exist

- [ ] **Step 3: Implement the runner**

It should:
- launch Claude Code non-interactively
- pass the scenario prompt
- capture stdout/stderr incrementally
- collect tool/command activity if available from the process stream
- expose a harness-owned hook or wrapper path for incremental learning log drops
- support timeout cancellation
- return transcript and exit metadata

- [ ] **Step 4: Add checkpoint injection support**

Support:
- predefined checkpoint prompts
- controller-provided observation messages
- bounded retry count

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/run-claude-code.test.js
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-eval/run-claude-code.mjs test/agent-eval/run-claude-code.test.js
git commit -m "feat: add claude code agent eval runner"
```

## Chunk 4: Add Browser Observer

### Task 5: Implement browser/dashboard checks with E2B Desktop and Playwright

**Files:**
- Create: `scripts/agent-eval/run-browser-checks.mjs`
- Create: `test/agent-eval/run-browser-checks.test.js`

**Docs to use:**
- `@e2b/desktop` screenshot API
- `open()` and window/application management
- desktop/browser interaction methods

- [ ] **Step 1: Write failing browser observer tests**

Assert:
- it can open a URL in the sandbox
- it can take screenshots
- it can report node count and key labels
- it can produce browser event records for the bundle

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/run-browser-checks.test.js
```

Expected:
- FAIL because browser observer implementation does not exist

- [ ] **Step 3: Implement browser observer**

The observer should:
- accept a dev server URL or workbench URL
- open it inside the sandbox desktop/browser
- take screenshots
- optionally run Playwright assertions against expected selectors
- write browser event records

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/run-browser-checks.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-eval/run-browser-checks.mjs test/agent-eval/run-browser-checks.test.js
git commit -m "feat: add browser observer for agent evals"
```

## Chunk 5: Add Grading, Friction Classification, And Redaction

### Task 6: Implement run grading

**Files:**
- Create: `scripts/agent-eval/grade-run.mjs`
- Create: `test/agent-eval/grade-run.test.js`

- [ ] **Step 1: Write failing grading tests**

Assert:
- objective success grading from command/file evidence
- friction grading from retries, wrong turns, learning-log events, and final reports
- classification tags for confusion categories

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/grade-run.test.js
```

Expected:
- FAIL because grader does not exist

- [ ] **Step 3: Implement grader**

Compute:
- `objectiveCompletion`
- `productFriction`
- `classifications`
- `summary`

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/grade-run.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-eval/grade-run.mjs test/agent-eval/grade-run.test.js
git commit -m "feat: add agent eval grading"
```

### Task 7: Implement redaction for transcripts and result bundles

**Files:**
- Create: `scripts/agent-eval/redact-secrets.mjs`
- Modify: `scripts/agent-eval/write-result-bundle.mjs`
- Add or extend: `test/agent-eval/write-result-bundle.test.js`

- [ ] **Step 1: Add failing redaction tests**

Assert:
- literal registry tokens are removed
- env-style auth references are not expanded
- transcript and summary files are scrubbed before persistence
- learning log and final reports are scrubbed before persistence

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/agent-eval/write-result-bundle.test.js
```

Expected:
- FAIL on unredacted secret fixtures

- [ ] **Step 3: Implement redaction**

Redact:
- npm auth tokens
- registry credentials
- known sandbox secrets
- any literal secrets surfaced by commands

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test test/agent-eval/write-result-bundle.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-eval/redact-secrets.mjs scripts/agent-eval/write-result-bundle.mjs test/agent-eval/write-result-bundle.test.js
git commit -m "feat: redact secrets from agent eval results"
```

## Chunk 6: Add Top-Level Runner And Local Smoke

### Task 8: Implement `scripts/run-agent-evals.mjs`

**Files:**
- Create: `scripts/run-agent-evals.mjs`
- Create: `test/integration/agent-eval-smoke.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing smoke tests**

Assert:
- runner accepts `--scenario`
- runner lists scenarios
- runner writes results to `eval-results/<run-id>`
- runner can dry-run without contacting E2B

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/integration/agent-eval-smoke.test.js
```

Expected:
- FAIL because the top-level runner does not exist

- [ ] **Step 3: Implement top-level runner**

It should:
- parse args
- load scenario
- prepare sandbox
- run Claude Code
- optionally run browser checks
- grade the run
- write the bundle
- print a concise summary

- [ ] **Step 4: Add npm script**

Add:

```json
"test:agent-evals": "node scripts/run-agent-evals.mjs"
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test test/integration/agent-eval-smoke.test.js
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/run-agent-evals.mjs package.json test/integration/agent-eval-smoke.test.js
git commit -m "feat: add top-level agent eval runner"
```

## Chunk 7: Add Synthetic Scenarios First

### Task 9: Implement the initial synthetic scenario suite

**Files:**
- Modify: `scripts/agent-eval/scenarios.js`
- Modify: `scripts/run-agent-evals.mjs`
- Add tests where useful under: `test/agent-eval/`

- [ ] **Step 1: Add synthetic scenarios**

Include:
- `synthetic/install-package`
- `synthetic/new-skill`
- `synthetic/stale-repair`
- `synthetic/runtime-drift`
- `synthetic/dev-dashboard`

- [ ] **Step 2: Dry-run each synthetic scenario locally**

Run:

```bash
node scripts/run-agent-evals.mjs --scenario synthetic/install-package --dry-run
node scripts/run-agent-evals.mjs --scenario synthetic/new-skill --dry-run
node scripts/run-agent-evals.mjs --scenario synthetic/stale-repair --dry-run
node scripts/run-agent-evals.mjs --scenario synthetic/runtime-drift --dry-run
node scripts/run-agent-evals.mjs --scenario synthetic/dev-dashboard --dry-run
```

Expected:
- each scenario resolves and validates

- [ ] **Step 3: Commit**

```bash
git add scripts/agent-eval/scenarios.js scripts/run-agent-evals.mjs
git commit -m "feat: add synthetic agent eval scenarios"
```

## Chunk 8: Add Real Repo Scenarios

### Task 10: Add `agonda` scenarios

**Files:**
- Modify: `scripts/agent-eval/scenarios.js`
- Reference: isolated `agonda` worktree path and/or configurable source path

- [ ] **Step 1: Add `agonda` scenarios**

Include:
- validate and inspect a real source-backed skill
- stale repair after changing a knowledge file
- author or update a source-backed skill

- [ ] **Step 2: Dry-run the `agonda` scenarios**

Run:

```bash
node scripts/run-agent-evals.mjs --scenario agonda/validate --dry-run
node scripts/run-agent-evals.mjs --scenario agonda/stale-repair --dry-run
node scripts/run-agent-evals.mjs --scenario agonda/author-skill --dry-run
```

Expected:
- each scenario resolves repo source and budgets correctly

- [ ] **Step 3: Commit**

```bash
git add scripts/agent-eval/scenarios.js
git commit -m "feat: add agonda agent eval scenarios"
```

### Task 11: Add `superpowers` scenarios

**Files:**
- Modify: `scripts/agent-eval/scenarios.js`
- Reference: isolated `superpowers` worktree path and/or configurable source path

- [ ] **Step 1: Add `superpowers` scenarios**

Include:
- convert or repair a skill graph
- debug an import or alias issue
- run `skills dev` and inspect the graph

- [ ] **Step 2: Dry-run the `superpowers` scenarios**

Run:

```bash
node scripts/run-agent-evals.mjs --scenario superpowers/convert-skill --dry-run
node scripts/run-agent-evals.mjs --scenario superpowers/dependency-debug --dry-run
node scripts/run-agent-evals.mjs --scenario superpowers/dev-graph --dry-run
```

Expected:
- each scenario resolves repo source and budgets correctly

- [ ] **Step 3: Commit**

```bash
git add scripts/agent-eval/scenarios.js
git commit -m "feat: add superpowers agent eval scenarios"
```

## Chunk 9: Documentation And Operator Workflow

### Task 12: Document the harness for operators

**Files:**
- Modify: `README.md`
- Modify: `packages/agentpack/README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add README documentation**

Document:
- what this harness is for
- how it differs from `test:sandboxes`
- required env vars and template setup
- how to run a single scenario
- where results are written

- [ ] **Step 2: Update agent instructions**

State:
- agent-facing UX work should use this harness before claiming usability is good
- deterministic harness remains required for correctness

- [ ] **Step 3: Verify docs references**

Run:

```bash
rg -n "test:agent-evals|agent eval|E2B|Claude Code" README.md packages/agentpack/README.md AGENTS.md CLAUDE.md
```

Expected:
- all docs mention the new harness consistently

- [ ] **Step 4: Commit**

```bash
git add README.md packages/agentpack/README.md AGENTS.md CLAUDE.md
git commit -m "docs: add autonomous agent eval harness guidance"
```

## Chunk 10: First Real Baseline Runs

### Task 13: Execute a narrow baseline and inspect results

**Files:**
- Result output only: `eval-results/`

- [ ] **Step 1: Run one synthetic scenario end to end**

Run:

```bash
npm run test:agent-evals -- --scenario synthetic/new-skill
```

Expected:
- one complete result bundle under `eval-results/`

- [ ] **Step 2: Run one `agonda` scenario**

Run:

```bash
npm run test:agent-evals -- --scenario agonda/validate
```

Expected:
- one complete result bundle under `eval-results/`

- [ ] **Step 3: Run one `superpowers` dashboard scenario**

Run:

```bash
npm run test:agent-evals -- --scenario superpowers/dev-graph
```

Expected:
- screenshots and browser events recorded

- [ ] **Step 4: Review confusion classifications**

Check:
- result bundles contain learning log, final reports, and grader output
- at least one friction category can be extracted from a real run

- [ ] **Step 5: Commit runner code, not result artifacts**

```bash
git status --short
git add scripts package.json test README.md packages/agentpack/README.md AGENTS.md CLAUDE.md
git commit -m "feat: add autonomous agent eval harness"
```

## Verification Commands

Run these before claiming the harness is ready:

```bash
node --test test/agent-eval/scenarios.test.js
node --test test/agent-eval/prepare-sandbox.test.js
node --test test/agent-eval/run-claude-code.test.js
node --test test/agent-eval/run-browser-checks.test.js
node --test test/agent-eval/grade-run.test.js
node --test test/agent-eval/write-result-bundle.test.js
node --test test/integration/agent-eval-smoke.test.js
npm run test:agent-evals -- --scenario synthetic/new-skill --dry-run
```

If E2B and Claude Code credentials are configured:

```bash
npm run test:agent-evals -- --scenario synthetic/new-skill
npm run test:agent-evals -- --scenario agonda/validate
npm run test:agent-evals -- --scenario superpowers/dev-graph
```

## Notes For The Implementer

- Use the real E2B API model, not a home-grown fake abstraction:
  - sandbox creation
  - command execution
  - template build/config
  - desktop/browser open and screenshot APIs
- Keep the runner separable from the grading layer
- Keep secrets out of bundles by default
- Do not let this harness replace the deterministic harness
- Use scenario definitions as the product contract for what agentpack should enable

Plan complete and saved to `docs/superpowers/plans/2026-03-15-agentpack-autonomous-agent-eval-harness.md`. Ready to execute?
