# Skill Graph Dashboard Redesign — Design Spec

**Created:** 2026-03-11
**Status:** Design
**Branch:** feature/skill-dev-workbench

---

## Problem

The current skill dev workbench dashboard is a minimal prototype — hardcoded 3-column layout, basic circles, unstyled buttons, bare inspector panel. It shows only one skill's immediate neighbors (direct sources + direct dependencies). A skill developer needs to see the full picture: the complete transitive dependency tree, which skills depend on what, what those skills do, which source files feed the tree, and whether anything is stale.

## Solution

A redesigned dashboard that renders the full transitive skill graph as an interactive top-down DAG. One view, one concept: a skill's complete world. Navigate between skills via URL routing. Adopt the agonda design language (Crimson Pro + Noto Sans Mono typography, warm dark palette, D3 tree layout with hover highlighting and glow filters).

---

## Architecture & Routing

- **Single-page app** served by the existing workbench HTTP server
- **Hash-based routing**: `/#/skill/package-name` — each skill is a root view
- **Navigation**: Click a dependency node → URL updates → graph re-renders with that skill as root
- **Breadcrumb trail**: Top of page shows navigation path (`root-skill › dep-a › dep-b`). Each segment clickable to go back. Browser back button works via `hashchange` listener. State is an array in React state, pushed on navigation, truncated on breadcrumb click (clicking `dep-a` in `root › dep-a › dep-b` drops `dep-b`), and synced with `hashchange` events. Navigating A → B → C → B shows `A › B` (deduplicated — the trail represents the path, not a stack).
- **API change**: `GET /api/model?skill=package-name` returns the full transitive model for any skill. Falls back to the dev skill when no parameter is given. If the skill is not found in the graph, return `404 { error: 'Skill not found' }`.

### Data Model Changes

`buildCurrentSkillWorkbenchModel` currently builds a shallow model (selected skill + immediate neighbors). It needs to expand to build the full transitive closure:

1. Use `resolveDependencyClosure` to walk the full dependency tree from the selected skill. **Note:** `resolveDependencyClosure` iterates `node.requires`, but `readSkillGraphNode` produces a `dependencies` array. The `resolveNode` callback must map `dependencies` → `requires` when returning nodes.
2. For each resolved dependency, include its own source files and staleness status
3. Deduplicate source files across all skills in the tree
4. Return nodes at every depth level, with a `depth` field for visual encoding (depth = shortest path from the root skill)

**Pipeline changes required:** `readSkillGraphNode` must be updated to include `description` from the parsed SKILL.md frontmatter — currently it is parsed but dropped. `buildSkillWorkbenchModel` and the new transitive builder must carry `description` and `packageVersion` through to node objects so the sidebar and tooltip can display them.

The model shape becomes:

```
{
  selected: { id, type, packageName, name, description, version, status, ... },
  nodes: [
    { id, type: 'source', path, status, depth: 0, usedBy: [skillId, ...] },
    { id, type: 'skill', packageName, name, description, version, status, depth: 1 },
    { id, type: 'dependency', packageName, name, description, version, status, depth: 2 },
    { id, type: 'dependency', packageName, name, description, version, status, depth: 3 },
    ...
  ],
  edges: [
    { source, target, kind: 'provenance' },
    { source, target, kind: 'requires' },
    ...
  ]
}
```

Source nodes include a `usedBy` array listing which skills reference them, enabling the hover-highlight interaction.

**Staleness for non-local dependencies:** Dependencies installed via npm (not local packages) will not have build-state records. These should show as `status: 'unknown'` — the builder skips staleness checks for packages where `readBuildState` has no matching record. This is expected and fine — you can't have stale sources for a published package.

---

## Graph Visualization

Top-down DAG using `d3.tree()` layout (same engine as the agonda tree.html, oriented vertically).

### DAG-to-Tree Conversion

Dependency graphs are DAGs — a skill can be depended on by multiple parents. `d3.tree()` requires a strict tree (one parent per node). To handle diamond dependencies:

- **Each shared dependency appears once**, positioned under its first-encountered parent (BFS order from root).
- **Additional parent edges** are drawn as cross-link paths outside the tree layout — same bezier style but with dashed stroke to distinguish them from the primary tree edges.
- This keeps the layout clean while still showing the full dependency picture.

### Layout

- `d3.tree()` with vertical orientation. `d3.linkVertical()` for primary tree edges. Custom bezier paths for cross-link edges.
- Source files at the top tier, selected skill below, direct dependencies below that, transitive dependencies cascading further down.
- Separation tuned per depth: more space between top-level groups, tighter at leaf level.

### Node Visual Encoding

| Node type | Radius | Fill (current) | Fill (stale) | Stroke |
|-----------|--------|----------------|--------------|--------|
| Source | 5 | `#7a9abb` (blue) | `#d4a45e` (amber) | none |
| Selected skill | 10 | `#8fa67e` (green) | `#d4a45e` (amber) | `#ffbf47` golden, 2.5px |
| Dependency | 7 | `#8fa67e` (green) | `#d4a45e` (amber) | domain color, 1.5px |
| Affected dep | 7 | transparent | — | muted amber stroke |

- **Filled** = current/healthy. **Hollow with colored stroke** = stale or affected. Matches the agonda pattern.
- Selected/root skill always has a golden stroke ring to mark "you are here."

### Stale Indication

- **Stale nodes**: Shift to amber (`#d4a45e`). Subtle CSS pulse animation — a gentle glow throb using `@keyframes` on the SVG glow filter opacity. Not jittery, ~2s cycle.
- **Affected nodes**: Muted warm tone, hollow. No pulse — they're downstream consequences, not the source of the problem.

### Edges

- **Provenance edges** (source → skill): Blue (`#7a9abb`), 50% opacity
- **Dependency edges** (skill → dep): Green (`#8fa67e`), 50% opacity
- Deeper transitive edges fade opacity per depth level (depth 2: 40%, depth 3: 30%, depth 4+: 20%)
- Bezier curves via `d3.linkVertical()`

### Source File Deduplication

Each source file appears once at the top of the graph, regardless of how many skills reference it. Source nodes store a `usedBy` array. When hovering a skill node, only that skill's provenance edges light up — everything else dims. This is the same highlight/dim pattern used in agonda's `highlightNode`.

### Interactions

- **Zoom/pan**: `d3.zoom()` with scroll-to-zoom and drag-to-pan. Same as agonda.
- **Hover**: Dims non-connected nodes, highlights the hovered node's ancestors and descendants. Glow filter (`feGaussianBlur`) on the hovered node. Tooltip follows cursor.
- **Click**: Opens the sidebar inspector for that node.
- **Label toggle**: Control button to show/hide node labels for a cleaner macro view.

### Glow Filters

SVG `<defs>` with `feGaussianBlur` + `feFlood` + `feComposite` per status color. Same technique as agonda's `glow-${domain}` filters, adapted for status colors (green glow for current, amber glow for stale).

---

## Sidebar (Inspector Panel)

Slide-out panel on the right, triggered by clicking any node.

### Behavior

- **Default**: Hidden. Full width to the graph.
- **On click**: Slides in from right (~320px). Graph area shrinks with smooth CSS transition.
- **Close**: X button or click empty graph space.

### Content

For **any node**:
- **Name** — Crimson Pro italic, large
- **Type label** — Noto Sans Mono, small caps ("SOURCE", "SKILL", "DEPENDENCY")
- **Status pill** — color-coded badge (green = current, amber = stale, muted = affected)
- **Description** — from SKILL.md frontmatter `description` field

For **source nodes** specifically:
- File path
- Staleness status
- List of skills that reference this source (`usedBy`)

For **skill/dependency nodes** specifically:
- Package version
- Direct dependency count
- Source file count
- **"View skill graph →"** link — navigates to that skill's own graph (updates URL, re-renders main canvas)

---

## Action Bar & Controls

### Breadcrumb Bar (top, below header)

Navigation path: `root-skill › dep-a › dep-b`. Each segment clickable. Noto Sans Mono, small, muted. Replaces a dedicated back button.

### Control Strip (bottom-left)

Small buttons matching agonda's `ctrl-btn` style:

- **Reset** — reset zoom/pan to default
- **Validate** — run structural validation, show results in sidebar
- **Refresh** — re-fetch model from server
- **Toggle labels** — show/hide node labels

No "Check Stale" or "Show Dependencies" buttons — the graph is the visualization of both.

### Tooltip

Floating card on hover (same as agonda). Shows:
- Name, type, status
- Description preview (truncated to ~200 chars)
- Meta pills (dependency count, source count, version)

Disappears on mouse-leave. Provides quick info without opening the sidebar.

---

## Styling & Design Language

Adopted from the agonda dashboard:

### Typography

- **Titles**: Crimson Pro, italic, 400 weight
- **Labels & technical text**: Noto Sans Mono, 400-500 weight
- **Brand/type labels**: Noto Sans Mono, small-caps, uppercase, letter-spacing 3px, 9px

### Color Palette

```
--bg: #1a1916          (warm dark background)
--surface: #252320     (panel/card background)
--border: rgba(255, 255, 255, 0.06)
--border-bright: rgba(255, 255, 255, 0.12)
--text: #e8e4dc        (primary text)
--text-dim: #9a9488    (secondary/muted text)

--status-current: #8fa67e   (green — healthy)
--status-stale: #d4a45e     (amber — needs rebuild)
--status-affected: #c4956e  (muted warm — downstream of stale)
--status-unknown: #9a9488   (gray — no build state)

--edge-provenance: #7a9abb  (blue — source → skill)
--edge-requires: #8fa67e    (green — skill → dependency)
--accent: #ffbf47           (golden — selected node ring)
```

### Background

```css
background: var(--bg);
```

Simple solid warm dark. No gradients — the current cold blue gradient is replaced.

### Controls

Agonda `ctrl-btn` style: monospace, small, surface background, subtle border, hover brightens text and adds accent border color.

---

## Server Changes

### Server Constructor Change

The server currently accepts `{ model }` (a static precomputed model) and stores it as `currentModel`. This must change to support per-skill queries:

- Replace `{ model }` with `{ buildModel(skillPackageName): Model, defaultSkill: string, repoRoot, skillDir }`
- Models are computed **on demand per request**, not cached. The `buildModel` callback is called each time `/api/model` is hit.
- `updateModel()` on the server handle is removed — the watcher instead signals a cache-invalidation (or simply relies on the builder always reading fresh filesystem state).

### New Endpoint Behavior

`GET /api/model?skill=package-name`:
- If `skill` param present: call `buildModel(skillPackageName)` for that skill
- If absent: call `buildModel(defaultSkill)` for the skill being developed
- If the skill is not found: return `404 { error: 'Skill not found' }`

### Model Builder Changes

New function `buildTransitiveSkillWorkbenchModel(repoRoot, skillPackageName)`:
1. Build the full skill graph via `buildSkillGraph`
2. Find the target skill node
3. Use `resolveDependencyClosure` to get all transitive dependencies (mapping `dependencies` → `requires` in the `resolveNode` callback)
4. For each skill in the closure, resolve its source files and staleness via `readBuildState` + `compareRecordedSources`. For non-local packages without build-state records, set `status: 'unknown'`.
5. Deduplicate source files, tracking which skills use each
6. Assign depth levels (depth = shortest path from root, computed via BFS)
7. Return the expanded model

### Watcher Changes

The watcher currently only watches the dev skill's files. For the transitive view, it should also watch dependency SKILL.md files so that navigating to a dependency shows fresh data on refresh. This is a nice-to-have — initial implementation can rely on the Refresh button.

---

## What's NOT in Scope

- **No editing**: Dashboard is read-only inspection. No editing SKILL.md or package.json.
- **No SSE/WebSocket**: No live push. Click Refresh to get latest state.
- **No search**: Graph sizes are expected to stay under ~50 nodes for any practical skill tree. Visual scanning suffices.
- **No feedback loop**: Unlike the agonda dashboard, no comment/annotation system. This is a dev tool, not a governance surface.
- **No new npm dependencies**: Uses existing React 19 + D3 7 + esbuild stack. Fonts loaded via Google Fonts CDN link, falling back to system serif (Georgia) / system monospace.

### UI States

- **Loading**: Centered spinner or "Loading..." text while the model is being fetched.
- **Error**: If `/api/model` returns an error or 404, show a centered error message with a Refresh button.
- **Empty graph**: If a skill has zero dependencies and zero source files (a single-node graph), render the lone node centered with a message: "No dependencies or sources found."
- **Tooltip clamping**: Tooltip position is clamped to the viewport bounds to prevent overflow near edges (same as agonda's `moveTooltip` logic).

---

## File Structure

Changes within `src/dashboard/`:

```
src/dashboard/
├── index.html                      — updated: new palette, fonts, layout
├── main.jsx                        — updated: add hash router
├── App.jsx                         — rewritten: breadcrumbs, sidebar, routing
├── lib/
│   ├── api.js                      — updated: skill param support
│   └── router.js                   — new: hash-based routing utilities
├── components/
│   ├── SkillGraph.jsx              — rewritten: d3.tree top-down DAG
│   ├── InspectorPanel.jsx          — rewritten: slide-out sidebar with skill details
│   ├── Breadcrumbs.jsx             — new: navigation breadcrumb trail
│   ├── ControlStrip.jsx            — new: replaces ActionBar (reset, validate, refresh, toggle). ActionBar.jsx is deleted.
│   └── Tooltip.jsx                 — new: floating hover card
```

Changes in application/domain layers:

```
src/application/skills/
├── build-skill-workbench-model.js  — updated: add buildTransitiveSkillWorkbenchModel
├── start-skill-dev-workbench.js    — updated: pass full graph context to server

src/infrastructure/runtime/
├── skill-dev-workbench-server.js   — updated: accept ?skill= query param
```
