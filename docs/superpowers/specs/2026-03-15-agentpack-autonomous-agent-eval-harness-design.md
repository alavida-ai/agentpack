# Agentpack Autonomous Agent-Eval Harness Design

**Date:** 2026-03-15

## Summary

Define the final outer-loop harness for agentpack: an isolated autonomous-agent evaluation environment that dispatches fresh Claude Code agents into E2B sandboxes, gives them real repos and real agentpack workflows, captures where they get confused, and turns that feedback into product iteration input.

This harness does not replace the existing deterministic harness. It sits above it.

- deterministic local harness proves correctness
- autonomous E2B agent harness proves usability, discoverability, and agent-facing UX

## Goal

The final harness must let us:

- dispatch a fresh isolated agent with no prior repo context
- give that agent a real task in a real repo or a synthetic repo
- let the agent use agentpack as a normal downstream user would
- optionally let the agent inspect the dashboard visually
- capture confusion, friction, wrong turns, and recovery behavior
- measure whether agentpack actually helps the agent complete the task
- turn those runs into repeatable evals we can compare over time

This harness exists because agentpack is a tool for agents. The key product question is not only "does the CLI work", but "can a fresh agent discover how to use it correctly and efficiently?"

## Product Position

This harness is the final outer layer of the testing stack:

1. TLA+ models prove state-machine semantics
2. parser/compiler tests prove language semantics
3. repo-lab integration tests prove CLI and state behavior
4. Playwright localhost tests prove dashboard rendering
5. live sandbox smoke tests prove real repos work
6. autonomous E2B agent evals prove agent-facing UX works

The autonomous harness should never be the first place a bug is found. It should be the place where product confusion, discoverability problems, and UX friction are exposed.

## Non-Goals

This harness is not:

- the primary regression layer
- a replacement for unit, integration, or TLA+ verification
- a benchmark for arbitrary model performance
- a generic multi-agent framework in v1
- a replacement for local worktrees and local deterministic harnesses

## Core Principles

- **Fresh agent, fresh context**: the dispatched agent should only know what exists inside the sandbox and what is supplied in the task prompt
- **Real tasks over synthetic benchmarks**: evals should look like actual agentpack use
- **Product friction first**: confusion and UX breakdowns matter more than raw completion speed
- **Structured feedback**: every run must emit machine-readable feedback, not only a transcript
- **Replayable runs**: tasks, sandbox prep, and grading must be reproducible
- **Visual parity**: dashboard tasks must be testable through browser automation, not manual review
- **One agent backend in v1**: Claude Code only

## Why E2B

E2B is the right outer isolation boundary for this harness because it provides:

- ephemeral remote sandboxes
- file and command execution APIs
- git integration
- sandbox templates
- browser/desktop automation APIs through `@e2b/desktop`

That is the right fit for:

- isolating the filesystem and runtime from the local machine
- dispatching a fresh agent into a disposable environment
- driving the dashboard through a real browser surface

The local harness remains primary because it is faster and more deterministic. E2B is the correct add-on for true isolated agent runs.

## V1 Scope

V1 is intentionally narrow:

- agent backend: Claude Code only
- sandbox provider: E2B only
- browser automation: Playwright plus `@e2b/desktop`
- supported repo classes:
  - synthetic fixture repos
  - `agonda`
  - `superpowers`
- supported task styles:
  - autonomous runs
  - checkpointed runs with controller nudges

V1 does not require:

- multiple agent backends
- OpenClaw integration
- public leaderboard style benchmarking
- fully automatic issue filing

## High-Level Architecture

The harness has five runtime components.

### 1. Eval Controller

Runs outside the sandbox.

Responsibilities:

- choose eval scenario
- provision the E2B sandbox
- prepare repos and environment
- launch Claude Code
- stream agent transcript and tool activity
- optionally inject checkpoint nudges
- collect artifacts, screenshots, diffs, and final reports
- run grading
- write eval results

### 2. Sandbox Provisioner

Builds and configures the E2B environment.

Responsibilities:

- create sandbox from a pinned template
- clone or mount the target repo
- make the desired agentpack version available
- configure env vars, adapters, registry settings, and test credentials
- optionally start services needed by the task

### 3. Agent Runner

Executes Claude Code inside the sandbox.

Responsibilities:

- launch Claude Code against the prepared working directory
- provide the task prompt and any harness instructions
- enforce time, token, and step budgets
- support two run modes:
  - fully autonomous
  - checkpointed

### 4. Browser Observer

Uses `@e2b/desktop` and Playwright for visual tasks.

Responsibilities:

- open the dashboard/workbench URL in the sandbox
- capture screenshots
- inspect DOM state when possible
- allow the agent or controller to observe graph/UI behavior
- record visual evidence for failures

### 5. Eval Recorder

Persists the run as a replayable artifact.

Responsibilities:

- transcript capture
- command log capture
- file diff capture
- screenshot capture
- grading output
- append-only learning log capture
- final markdown and structured report capture

## Sandbox Lifecycle

Each eval run follows one standard lifecycle.

1. Create E2B sandbox from pinned template
2. Prepare workspace
3. Install or expose the target agentpack build
4. Clone or copy the target repo
5. Seed the task fixture
6. Launch Claude Code
7. Allow autonomous or checkpointed execution
8. Optionally open dashboard/browser tooling
9. Capture artifacts continuously
10. Grade the result
11. Persist the result bundle
12. Destroy sandbox

The sandbox should be fully disposable. No run should depend on mutable global local state.

## Sandbox Template Requirements

The pinned E2B template should include:

- Node and npm
- git
- Java for TLC-related prep if needed
- Playwright browsers
- Claude Code CLI
- agentpack install/runtime prerequisites

Optional but recommended:

- Verdaccio client helpers
- jq
- ripgrep
- zsh/bash parity with local workflows

The template should be versioned so eval behavior is reproducible.

## Repo Preparation Model

Each eval run should prepare exactly two contexts inside the sandbox:

### A. Tool Context

This is the agentpack distribution under test.

Options:

- installed from a tarball or npm package produced by CI
- copied from the current local build artifact

Purpose:

- ensure the sandbox is using the exact agentpack version under evaluation

### B. Task Repo Context

This is the downstream repo the agent must work in.

Examples:

- synthetic fixture repo
- `agonda`
- `superpowers`

Purpose:

- ensure the agent experiences agentpack as a downstream user would

The agent should work primarily inside the task repo, not inside the agentpack source repo.

## Agent Context Model

The dispatched agent should receive:

- the task prompt
- the working directory
- the installed agentpack CLI and its local docs/help
- any repo-local files

The dispatched agent should not receive:

- hidden implementation notes from this session
- direct explanations of agentpack internals
- hand-authored hints unless the scenario explicitly includes them

This is critical. We are testing the product experience, not replaying my prior implementation context.

## Run Modes

The harness must support two run modes.

### Autonomous Mode

The controller provides the task and waits for completion or timeout.

Use when:

- the task should measure natural discoverability
- we want to see where the agent gets stuck without help

### Checkpointed Mode

The controller may inject additional observations or nudges at predefined checkpoints.

Use when:

- the task includes dashboard observations
- we want to test recoverability after confusing output
- we want to compare no-help vs bounded-help behavior

Checkpointing is not a fallback for poor product design. It is a diagnostic tool.

## Task Types

The harness must support these task types.

### 1. Consumer Install Tasks

Examples:

- install a skill package
- materialize it into runtimes
- verify the runtime outputs exist

Purpose:

- validate install/build/materialize flow
- expose package-manager and adapter UX

### 2. Authoring Tasks

Examples:

- author a new source-backed skill from repo docs
- bind sources correctly
- validate/build/materialize the new skill

Purpose:

- validate the compiler-mode author workflow

### 3. Migration Tasks

Examples:

- convert a legacy or informal skill into compiler-mode

Purpose:

- validate that the new language is discoverable and usable

### 4. Staleness Tasks

Examples:

- identify which skills became stale after a source change
- update the right skill

Purpose:

- validate provenance and stale diagnostics

### 5. Dependency Debugging Tasks

Examples:

- fix a missing import
- repair a bad skill alias
- resolve why materialization or validation failed

Purpose:

- validate error messages and graph/debug UX

### 6. Dev Workflow Tasks

Examples:

- run `skills dev`
- inspect the graph
- diagnose a graph issue
- verify a fix through the dashboard

Purpose:

- validate the local author workflow and graph usability

### 7. Runtime Drift Tasks

Examples:

- diagnose out-of-sync adapter outputs
- repair by rebuilding or rematerializing

Purpose:

- validate `status`, `env`, and materialization-state UX

## User Stories To Test

These are the core user stories that should define the isolated test suite.

### Story Group A: New Consumer

1. As a fresh agent, I can install a skill package into an empty repo and materialize it into the runtime without being told hidden internal details.
2. As a fresh agent, I can inspect what was installed, where it was materialized, and whether the runtime is healthy.
3. As a fresh agent, I can understand the difference between package install state and runtime materialization state from the CLI output alone.

### Story Group B: New Author

4. As a fresh agent, I can create a new compiler-mode `SKILL.md` from repo knowledge files and make it validate.
5. As a fresh agent, I can bind source files explicitly and use them with contextual body references.
6. As a fresh agent, I can build and materialize the authored skill without guessing old syntax.

### Story Group C: Legacy Conversion

7. As a fresh agent, I can convert an existing informal skill into the new compiler-backed format using only repo-local context and CLI help.
8. As a fresh agent, I can discover what the required `agentpack` block and body reference syntax look like.

### Story Group D: Staleness And Provenance

9. As a fresh agent, I can identify which skill is stale after a source file changes.
10. As a fresh agent, I can understand why the skill is stale and which source binding caused it.
11. As a fresh agent, I can repair the stale skill and verify the stale state clears.

### Story Group E: Dependency Debugging

12. As a fresh agent, I can diagnose why a skill import or alias is invalid.
13. As a fresh agent, I can use agentpack output or the graph to find the broken relationship and fix it.
14. As a fresh agent, I can recover from a failed validate/build/materialize loop without external explanation.

### Story Group F: Dev And Dashboard

15. As a fresh agent, I can run `skills dev` and successfully open or inspect the workbench.
16. As a fresh agent, I can use the graph to understand dependencies, sources, stale nodes, and contextual edges.
17. As a fresh agent, I can use the dashboard to debug a graph or provenance issue.

### Story Group G: Real Repo Objectives

18. As a fresh agent, I can use `agonda` to publish or validate a real source-backed skill graph from a knowledge repo.
19. As a fresh agent, I can use `superpowers` to transform real skills into explicit skill graphs.
20. As a fresh agent, I can complete those repo-specific tasks without relying on hidden implementation context.

## Scenario Matrix

The harness should ship a fixed starter matrix.

### Synthetic Scenarios

- empty repo install
- broken import repair
- stale source repair
- new skill authoring
- runtime drift recovery

### Real Repo Scenarios

- `agonda`: validate and repair a source-backed skill
- `agonda`: author a new source-backed skill from knowledge docs
- `superpowers`: convert one skill to compiler-mode
- `superpowers`: repair a broken graph edge or alias
- `superpowers`: run `skills dev` and debug through the dashboard

## Prompt Design

Every scenario should define:

- `system framing`
  - minimal harness instructions
- `task prompt`
  - what the agent is asked to achieve
- `success criteria`
  - what objectively counts as success
- `budget`
  - time limit
  - step limit
  - optional token budget
- `allowed tools`
  - command execution
  - file editing
  - browser observation if relevant

Prompts should be realistic and avoid hidden hints like:

- exact file path to change unless naturally part of the task
- exact command to use unless the scenario is specifically about following instructions

## Claude Code Dispatch Model

V1 should standardize on Claude Code in non-interactive harness mode.

The controller should:

- start Claude Code inside the E2B sandbox
- set the task repo as the working directory
- provide the scenario prompt
- capture all tool usage, commands, and final response

The runner should support:

- fresh one-shot sessions
- bounded checkpoint injections
- timeout and hard-stop semantics

## Dashboard Integration

Visual tasks are mandatory in this final harness.

The dashboard layer should work like this:

1. the task or controller starts `agentpack skills dev`
2. the harness captures the workbench URL
3. `@e2b/desktop` opens the URL inside the sandbox
4. Playwright or desktop APIs capture screenshots and inspect visual state
5. the agent or controller can refer to those observations during the run

The visual harness must capture:

- screenshots at key checkpoints
- node count
- expected node labels
- stale/affected indicators where relevant
- inspector panel state when used

## Artifact Bundle

Every eval run must emit one result bundle.

Recommended layout:

```text
eval-results/
  <run-id>/
    scenario.json
    sandbox.json
    transcript.ndjson
    commands.ndjson
    browser.ndjson
    learning-log.ndjson
    screenshots/
    file-diff.patch
    grader.json
    report.json
    report.md
    summary.md
```

## Structured Feedback Schema

Every run must capture both raw evidence and structured feedback.

### Raw Evidence

- full transcript
- command log
- stdout/stderr
- file diffs
- screenshots
- final repo state

### In-Session Learning Log

The harness should capture learnings continuously during the run, not only at the end.

This should be implemented through a lightweight Claude Code hook or wrapper owned by the harness, not by agentpack itself.

Recommended append-only format:

```json
{
  "ts": "2026-03-15T12:00:00.000Z",
  "kind": "pain_point|learning|wrong_turn|helpful_signal|checkpoint",
  "severity": "low|medium|high",
  "area": "cli-output|syntax|graph|dashboard|status|materialization|docs",
  "note": "",
  "evidence": ["optional command or file reference"],
  "suggested_fix": ""
}
```

The log is the raw product-learning artifact. The harness should synthesize it into the final reports.

### Final Reports

At the end of each run, the harness should emit both:

- `report.md`
  - the primary human-readable learning report
- `report.json`
  - the structured summary used for aggregation and trend analysis

Recommended `report.json` shape:

```json
{
  "outcome": "success|partial|failure",
  "confidence": 0.0,
  "summary": "",
  "pain_points": [
    {
      "area": "",
      "severity": "low|medium|high",
      "what_was_confusing": "",
      "evidence": [],
      "suggested_fix": ""
    }
  ],
  "learnings": [""],
  "helpful_things": [""]
}
```

Recommended `report.md` sections:

- outcome
- main pain points
- confusing moments
- helpful signals
- suggested product changes
- learnings

### Automatic Classification

The controller should also classify the run into one or more failure/friction categories:

- `discoverability`
- `docs-or-help`
- `syntax-confusion`
- `error-message`
- `graph-ux`
- `dashboard-ux`
- `materialization-ux`
- `status-ux`
- `staleness-ux`
- `registry-ux`
- `success-with-friction`

## Scoring Model

The harness should score two independent dimensions.

### 1. Objective Completion

Did the agent actually complete the task?

Signals:

- expected files exist
- expected commands succeed
- expected compiled/materialized outputs exist
- expected graph or stale state is reached

### 2. Product Friction

How hard was the product to use?

Signals:

- number of wrong turns
- repeated command retries
- time to first useful progress
- number of clarification-style attempts from the agent
- learning-log pain points
- final report pain points
- classification severity

The product iteration loop should prioritize friction reduction, not only completion rate.

## Pass Criteria

A scenario passes when:

- the objective grader marks the task as successful
- the transcript is complete
- the result bundle is complete
- the run stayed within budget

A scenario should still be considered diagnostically useful even if it fails, as long as artifacts and structured feedback were captured.

## CLI Surface

Recommended command surface:

```bash
npm run test:agent-evals
npm run test:agent-evals -- --scenario synthetic/new-skill
npm run test:agent-evals -- --scenario agonda/stale-repair
npm run test:agent-evals -- --scenario superpowers/dev-graph
```

Recommended internal scripts:

- `scripts/run-agent-evals.mjs`
- `scripts/agent-eval/prepare-sandbox.mjs`
- `scripts/agent-eval/run-claude-code.mjs`
- `scripts/agent-eval/run-browser-checks.mjs`
- `scripts/agent-eval/grade-run.mjs`
- `scripts/agent-eval/write-result-bundle.mjs`

## Data And Privacy Considerations

The harness must:

- redact tokens and secrets from transcripts and result bundles
- never persist literal registry auth values
- avoid pushing sandbox changes unless explicitly configured
- treat screenshots as potentially sensitive repo artifacts
- ensure the learning log and final reports are redacted before persistence

## Recommended Execution Order

1. Define scenario schema and result schema
2. Build E2B sandbox provisioner
3. Build Claude Code runner
4. Build artifact recorder
5. Build grader and structured self-report capture
6. Add Playwright and `@e2b/desktop` dashboard tasks
7. Add synthetic scenarios
8. Add `agonda` scenarios
9. Add `superpowers` scenarios
10. Run baseline evals and use the results to create UX issues

## Recommendation

Build the autonomous agent-eval harness as the final outer harness for agentpack using:

- E2B for sandbox isolation
- Claude Code as the sole v1 agent backend
- Playwright plus `@e2b/desktop` for dashboard tasks
- structured result bundles and friction classification as first-class outputs

The first purpose of this harness is not to prove that agentpack can pass a benchmark. It is to expose how a fresh agent experiences the product so we can iterate on discoverability, diagnostics, graph UX, and task completion in realistic isolated environments.
