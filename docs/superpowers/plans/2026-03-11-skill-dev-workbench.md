# Skill Dev Workbench Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-skill local development workbench to `agentpack skills dev`, with default dashboard launch, file watching, and a React plus D3 visibility UI backed by existing lifecycle logic.

**Architecture:** Keep `skills dev` as the CLI entrypoint and orchestration surface, but move workbench model construction into the application/domain layers and local server/watch behavior into infrastructure. Serve a small React app that renders a focused DAG for one selected skill and calls local endpoints for existing lifecycle actions.

**Tech Stack:** Node.js, Commander, React, React DOM, D3, native HTTP server or lightweight local server module, existing Node test runner

---

## File Structure

### Existing files to modify

- `package.json`
  Add dashboard runtime and build dependencies plus scripts if needed for bundling UI assets.
- `src/commands/skills.js`
  Extend `skills dev` options and CLI output for dashboard startup, fallback, and shutdown behavior.
- `src/lib/skills.js`
  Keep current `skills dev` behavior working while delegating new workbench startup and watch refresh responsibilities to focused modules.
- `src/domain/skills/skill-graph.js`
  Reuse or extend graph helpers for focused single-skill workbench graph derivation.
- `test/integration/skills-dev.test.js`
  Extend coverage for dashboard startup, `--no-dashboard`, and workbench refresh behavior.

### New application files

- `src/application/skills/build-skill-workbench-model.js`
  Build the canonical selected-skill workbench model for the UI.
- `src/application/skills/run-skill-workbench-action.js`
  Adapt existing lifecycle use cases for dashboard action buttons.
- `src/application/skills/start-skill-dev-workbench.js`
  Coordinate model build, server startup, browser launch, and watcher refresh callbacks.

### New infrastructure files

- `src/infrastructure/runtime/skill-dev-workbench-server.js`
  Start and stop the local dashboard server, expose JSON endpoints, and serve static UI assets.
- `src/infrastructure/runtime/open-browser.js`
  Handle browser launch with headless-safe fallback behavior.
- `src/infrastructure/runtime/watch-skill-workbench.js`
  Watch the selected skill and direct source/dependency files for refresh triggers.

### New presentation files

- `src/dashboard/index.html`
  Static HTML entry document for the workbench.
- `src/dashboard/main.jsx`
  React bootstrap for the workbench app.
- `src/dashboard/App.jsx`
  Top-level UI composition: graph canvas, inspector, action bar, and status surfaces.
- `src/dashboard/components/SkillGraph.jsx`
  D3-backed graph renderer for the focused single-skill DAG.
- `src/dashboard/components/InspectorPanel.jsx`
  Selection-driven inspector panel.
- `src/dashboard/components/ActionBar.jsx`
  Buttons for `check stale`, `show dependencies`, `validate skill`, and `refresh graph`.
- `src/dashboard/lib/api.js`
  UI-side fetch helpers for local workbench endpoints.

### New tests

- `test/application/build-skill-workbench-model.test.js`
  Deterministic tests for graph nodes, edges, statuses, and explanations.
- `test/integration/skills-dev-workbench.test.js`
  New focused integration tests for server startup and workbench-specific behavior.

## Chunk 1: Core Workbench Model And Server Contracts

### Task 1: Add failing tests for the selected-skill workbench model

**Files:**
- Create: `test/application/build-skill-workbench-model.test.js`
- Check: `src/domain/skills/skill-graph.js`
- Check: `src/domain/skills/skill-provenance.js`
- Check: `test/integration/fixtures.js`

- [ ] **Step 1: Write the failing test for a selected skill with direct sources and direct required skills**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillWorkbenchModel } from '../../src/application/skills/build-skill-workbench-model.js';

describe('buildSkillWorkbenchModel', () => {
  it('builds a focused graph for one selected skill', () => {
    const result = buildSkillWorkbenchModel({
      repoRoot: '/repo',
      selectedSkill: {
        name: 'value-copywriting',
        packageName: '@alavida/value-copywriting',
        skillFile: '/repo/skills/copywriting/SKILL.md',
        sources: ['domains/value/knowledge/tone-of-voice.md'],
        requires: ['@alavida/research'],
      },
      dependencyRecords: [
        { packageName: '@alavida/research', status: 'current' },
      ],
      sourceStatuses: new Map([['domains/value/knowledge/tone-of-voice.md', 'current']]),
      selectedStatus: 'current',
    });

    assert.equal(result.selected.packageName, '@alavida/value-copywriting');
    assert.equal(result.nodes.length, 3);
    assert.equal(result.edges.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/application/build-skill-workbench-model.test.js`
Expected: FAIL with module-not-found or missing export for `buildSkillWorkbenchModel`

- [ ] **Step 3: Write minimal implementation**

Create `src/application/skills/build-skill-workbench-model.js` with a small pure function:

```js
export function buildSkillWorkbenchModel({
  repoRoot,
  selectedSkill,
  dependencyRecords,
  sourceStatuses,
  selectedStatus,
}) {
  const selectedNode = {
    id: selectedSkill.packageName,
    type: 'skill',
    packageName: selectedSkill.packageName,
    name: selectedSkill.name,
    skillFile: selectedSkill.skillFile,
    status: selectedStatus,
  };

  const sourceNodes = selectedSkill.sources.map((source) => ({
    id: `source:${source}`,
    type: 'source',
    path: source,
    status: sourceStatuses.get(source) || 'unknown',
  }));

  const dependencyNodes = dependencyRecords.map((dependency) => ({
    id: dependency.packageName,
    type: 'dependency',
    packageName: dependency.packageName,
    status: dependency.status || 'unknown',
  }));

  return {
    selected: selectedNode,
    nodes: [selectedNode, ...sourceNodes, ...dependencyNodes],
    edges: [
      ...sourceNodes.map((node) => ({ source: node.id, target: selectedNode.id, kind: 'provenance' })),
      ...dependencyNodes.map((node) => ({ source: selectedNode.id, target: node.id, kind: 'requires' })),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/application/build-skill-workbench-model.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/application/build-skill-workbench-model.test.js src/application/skills/build-skill-workbench-model.js
git commit -m "test: add skill workbench model foundation"
```

### Task 2: Add lifecycle explanations and stale-state coverage to the model

**Files:**
- Modify: `src/application/skills/build-skill-workbench-model.js`
- Modify: `test/application/build-skill-workbench-model.test.js`
- Check: `src/application/skills/list-stale-skills.js`
- Check: `src/domain/skills/skill-provenance.js`

- [ ] **Step 1: Write the failing test for stale and affected explanations**

```js
it('explains stale sources and affected dependencies', () => {
  const result = buildSkillWorkbenchModel({
    repoRoot: '/repo',
    selectedSkill: {
      name: 'value-copywriting',
      packageName: '@alavida/value-copywriting',
      skillFile: '/repo/skills/copywriting/SKILL.md',
      sources: ['domains/value/knowledge/selling-points.md'],
      requires: ['@alavida/core-writing'],
    },
    dependencyRecords: [
      { packageName: '@alavida/core-writing', status: 'affected' },
    ],
    sourceStatuses: new Map([['domains/value/knowledge/selling-points.md', 'changed']]),
    selectedStatus: 'stale',
  });

  assert.match(result.selected.explanation, /selling-points\.md/i);
  assert.equal(result.nodes.find((node) => node.packageName === '@alavida/core-writing').status, 'affected');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/application/build-skill-workbench-model.test.js`
Expected: FAIL because explanation fields are missing

- [ ] **Step 3: Write minimal implementation**

Extend the model builder to attach:

```js
selectedNode.explanation = selectedStatus === 'stale'
  ? `Stale because one or more recorded sources changed: ${selectedSkill.sources.join(', ')}`
  : 'Current against recorded build-state';
```

and for dependency/source nodes:

```js
explanation: node.status === 'affected'
  ? 'Affected by upstream authored state changes'
  : node.status === 'changed'
    ? 'Changed since recorded build-state'
    : 'No current lifecycle issue detected'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/application/build-skill-workbench-model.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/application/build-skill-workbench-model.test.js src/application/skills/build-skill-workbench-model.js
git commit -m "feat: add lifecycle explanations to skill workbench model"
```

### Task 3: Add failing integration coverage for dashboard startup defaults and `--no-dashboard`

**Files:**
- Create: `test/integration/skills-dev-workbench.test.js`
- Check: `test/integration/fixtures.js`
- Check: `src/commands/skills.js`
- Check: `src/lib/skills.js`

- [ ] **Step 1: Write the failing integration tests**

Add two tests:

```js
it('starts a workbench server by default during skills dev', async () => {
  const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
  await session.waitForOutput(/Workbench URL:/);
});

it('skips workbench startup with --no-dashboard', async () => {
  const result = runCLI(['skills', 'dev', '--no-dashboard', 'skills/copywriting'], { cwd: repo.root });
  assert.match(result.stdout, /Linked Skill:/);
  assert.doesNotMatch(result.stdout, /Workbench URL:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because `skills dev` does not yet emit workbench startup output

- [ ] **Step 3: Write minimal implementation**

Add the new option in `src/commands/skills.js`:

```js
.option('--no-dashboard', 'Skip starting the local skill development workbench')
```

Pass the flag through to the dev startup path and emit placeholder workbench startup metadata from a focused helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/integration/skills-dev-workbench.test.js src/commands/skills.js src/lib/skills.js
git commit -m "feat: add skills dev dashboard startup flag"
```

### Task 4: Implement the local workbench server contract without the full UI yet

**Files:**
- Create: `src/application/skills/start-skill-dev-workbench.js`
- Create: `src/infrastructure/runtime/skill-dev-workbench-server.js`
- Create: `src/infrastructure/runtime/open-browser.js`
- Modify: `src/lib/skills.js`
- Modify: `src/commands/skills.js`
- Test: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Write the failing test for server metadata**

```js
it('returns server metadata that the CLI can print', async () => {
  const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
  await session.waitForOutput(/Workbench URL: http:\/\/127\.0\.0\.1:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because no server starts yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- `start-skill-dev-workbench.js` to compose model build + local server startup
- `skill-dev-workbench-server.js` with a small `http.createServer()` that serves:
  - `GET /api/model`
  - `POST /api/actions/refresh`
  - placeholder `GET /` HTML response until the real UI lands
- `open-browser.js` with a small helper that can be disabled in tests

Wire the returned metadata through `startSkillDev()`:

```js
{
  workbench: {
    enabled: true,
    url: 'http://127.0.0.1:4123',
    port: 4123,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/skills/start-skill-dev-workbench.js src/infrastructure/runtime/skill-dev-workbench-server.js src/infrastructure/runtime/open-browser.js src/lib/skills.js src/commands/skills.js test/integration/skills-dev-workbench.test.js
git commit -m "feat: start local skill dev workbench server"
```

## Chunk 2: Real Dashboard UI And Watch-Driven Refresh

### Task 5: Add the dashboard frontend toolchain and a failing render test

**Files:**
- Modify: `package.json`
- Create: `src/dashboard/index.html`
- Create: `src/dashboard/main.jsx`
- Create: `src/dashboard/App.jsx`
- Create: `src/dashboard/components/ActionBar.jsx`
- Create: `src/dashboard/components/InspectorPanel.jsx`
- Create: `src/dashboard/components/SkillGraph.jsx`
- Create: `src/dashboard/lib/api.js`

- [ ] **Step 1: Add the UI dependencies and build script**

Add dependencies and scripts:

```json
{
  "dependencies": {
    "d3": "^7.9.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  },
  "scripts": {
    "build:dashboard": "node scripts/build-dashboard.mjs"
  }
}
```

- [ ] **Step 2: Write the failing render test or smoke assertion**

If adding a UI test harness is too heavy for v1, add a server-level smoke assertion in `test/integration/skills-dev-workbench.test.js` that fetches `/` and expects:

```js
assert.match(html, /Skill Dev Workbench/i);
assert.match(html, /data-app-root/i);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because the real dashboard shell is not served yet

- [ ] **Step 4: Write minimal implementation**

Create `src/dashboard/index.html`:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="app" data-app-root></div>
    <script type="module" src="/assets/dashboard.js"></script>
  </body>
</html>
```

Create `scripts/build-dashboard.mjs` to bundle `src/dashboard/main.jsx` into a static asset served by the local server.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS for the new workbench integration assertions

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/build-dashboard.mjs src/dashboard src/infrastructure/runtime/skill-dev-workbench-server.js test/integration/skills-dev-workbench.test.js
git commit -m "build: add skill dev dashboard frontend shell"
```

### Task 6: Implement the focused React plus D3 workbench UI

**Files:**
- Modify: `src/dashboard/App.jsx`
- Modify: `src/dashboard/components/SkillGraph.jsx`
- Modify: `src/dashboard/components/InspectorPanel.jsx`
- Modify: `src/dashboard/components/ActionBar.jsx`
- Modify: `src/dashboard/lib/api.js`
- Test: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Write the failing test for inspector and graph rendering**

Add a fetch-based smoke test against the served HTML/JSON endpoints:

```js
assert.match(modelJson, /"edges":/);
assert.match(modelJson, /"selected":/);
```

If a lightweight browser-like test is added later, extend it then. For v1 keep this to contract testing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because the dashboard does not yet consume or render the model

- [ ] **Step 3: Write minimal implementation**

Implement `App.jsx` with:

```jsx
export function App() {
  const [model, setModel] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  // load model, render action bar, graph, and inspector
}
```

Implement `SkillGraph.jsx` so D3 renders:

- one selected skill node
- direct source nodes on the left
- direct dependency nodes on the right
- clickable edges and nodes

Implement `InspectorPanel.jsx` to show:

- selected node metadata
- lifecycle explanation
- relationship summaries

Implement `ActionBar.jsx` to call:

- `POST /api/actions/check-stale`
- `POST /api/actions/show-dependencies`
- `POST /api/actions/validate-skill`
- `POST /api/actions/refresh`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS with the dashboard shell and endpoint contract intact

- [ ] **Step 5: Commit**

```bash
git add src/dashboard test/integration/skills-dev-workbench.test.js
git commit -m "feat: render single-skill workbench dashboard"
```

### Task 7: Add watch-driven refresh for the selected skill neighborhood

**Files:**
- Create: `src/infrastructure/runtime/watch-skill-workbench.js`
- Modify: `src/application/skills/start-skill-dev-workbench.js`
- Modify: `src/infrastructure/runtime/skill-dev-workbench-server.js`
- Modify: `src/lib/skills.js`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Check: `src/infrastructure/runtime/watch-tree.js`

- [ ] **Step 1: Write the failing watch-refresh integration test**

```js
it('refreshes the workbench model when a selected source changes', async () => {
  const session = startCLI(['skills', 'dev', 'skills/copywriting'], { cwd: repo.root });
  await session.waitForOutput(/Workbench URL:/);

  writeFileSync(join(repo.root, 'domains', 'value', 'knowledge', 'tone-of-voice.md'), '# changed\n');

  await session.waitForOutput(/Workbench Refreshed:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because only the skill directory is watched today

- [ ] **Step 3: Write minimal implementation**

Create `watch-skill-workbench.js` to watch:

- selected `SKILL.md`
- selected `package.json`
- direct `metadata.sources`
- immediate files used to resolve direct dependency state

On change:

- rebuild the selected-skill workbench model
- update the server's in-memory model
- emit a CLI-visible refresh line such as `Workbench Refreshed: <reason>`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/runtime/watch-skill-workbench.js src/application/skills/start-skill-dev-workbench.js src/infrastructure/runtime/skill-dev-workbench-server.js src/lib/skills.js test/integration/skills-dev-workbench.test.js
git commit -m "feat: refresh skill dev workbench on source changes"
```

### Task 8: Add action endpoints backed by existing lifecycle use cases

**Files:**
- Create: `src/application/skills/run-skill-workbench-action.js`
- Modify: `src/infrastructure/runtime/skill-dev-workbench-server.js`
- Modify: `src/dashboard/lib/api.js`
- Modify: `src/dashboard/components/ActionBar.jsx`
- Modify: `test/integration/skills-dev-workbench.test.js`
- Check: `src/application/skills/inspect-skill.js`
- Check: `src/application/skills/list-stale-skills.js`
- Check: `src/application/skills/validate-skills.js`

- [ ] **Step 1: Write the failing endpoint contract test**

```js
it('runs validate-skill through a workbench action endpoint', async () => {
  const response = await fetch(`${workbenchUrl}/api/actions/validate-skill`, { method: 'POST' });
  const payload = await response.json();
  assert.equal(payload.action, 'validate-skill');
  assert.equal(payload.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration/skills-dev-workbench.test.js`
Expected: FAIL because the action endpoint does not exist

- [ ] **Step 3: Write minimal implementation**

Implement `run-skill-workbench-action.js` to adapt action names to existing use cases:

```js
export async function runSkillWorkbenchAction(action, context) {
  if (action === 'check-stale') return inspectStaleSkillUseCase(context.packageName, { cwd: context.cwd });
  if (action === 'show-dependencies') return inspectSkillDependencies(context.target);
  if (action === 'validate-skill') return validateSkillsUseCase({ target: context.target, cwd: context.cwd });
  if (action === 'refresh') return { refreshed: true };
  throw new Error(`Unsupported workbench action: ${action}`);
}
```

Expose those actions over `POST /api/actions/:name`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/skills/run-skill-workbench-action.js src/infrastructure/runtime/skill-dev-workbench-server.js src/dashboard/lib/api.js src/dashboard/components/ActionBar.jsx test/integration/skills-dev-workbench.test.js
git commit -m "feat: add skill dev workbench lifecycle actions"
```

### Task 9: Finish docs and validate the full flow

**Files:**
- Modify: `README.md`
- Modify: `docs/commands.mdx`
- Modify: `docs/current-state.mdx`
- Modify: `docs/testing.mdx`
- Test: `test/integration/skills-dev.test.js`
- Test: `test/integration/skills-dev-workbench.test.js`

- [ ] **Step 1: Write the failing docs expectation**

Add the missing command behavior notes to the docs before considering the feature done:

- `skills dev` launches the local workbench by default
- `--no-dashboard` disables it
- watch scope includes selected sources
- dashboard is visibility-only, not authoring

- [ ] **Step 2: Run verification before docs edits**

Run: `npm test`
Expected: PASS or known failures only from documentation omissions

- [ ] **Step 3: Write minimal documentation updates**

Update:

- `README.md` quick start and `skills dev` behavior
- `docs/commands.mdx` command contract and flag documentation
- `docs/current-state.mdx` implemented scope
- `docs/testing.mdx` new workbench coverage expectations

- [ ] **Step 4: Run final verification**

Run: `npm test`
Expected: PASS

Run: `node --test test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md docs/commands.mdx docs/current-state.mdx docs/testing.mdx test/integration/skills-dev.test.js test/integration/skills-dev-workbench.test.js
git commit -m "docs: describe skill dev workbench"
```
