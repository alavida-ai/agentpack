# Plugin Lifecycle

Use this reference when the user is working with plugin-local skills, bundled skill dependencies, or plugin artifact testing.

## Two Artifact Types

Keep this boundary clear:

- packaged skills are libraries
- plugins are deployable runtime shells

A packaged skill can be reused across repos. A plugin artifact is built for execution and can vendor packaged skills into a self-contained output.

## Dependency Truth

For plugins, local plugin skill `requires` are the authored dependency truth.

That means:

- local plugin skills declare which packaged skills they need
- plugin `package.json.devDependencies` must contain those packaged skills
- `plugin validate` checks that the declared package dependencies are actually present

Do not move that dependency truth into `plugin.json`.

## Build Flow

Use this flow when the user wants a runnable plugin artifact:

1. `agentpack plugin inspect <plugin-dir>`
2. `agentpack plugin validate <plugin-dir>`
3. `agentpack plugin build <plugin-dir>`

Use `agentpack plugin dev <plugin-dir>` when the user wants rebuild-on-change behavior.

## What Build Produces

The plugin source tree is not the final runtime artifact.

`plugin build`:

- syncs local skill dependencies
- resolves direct and transitive packaged skill closure
- vendors those packaged skills into the output
- writes bundled provenance
- produces a self-contained artifact under `.agentpack/dist/plugins/<plugin-name>/`

That built artifact is what should be tested with `claude --plugin-dir`.

## Consumer Boundary

For plugin consumers, the built plugin artifact should behave the same way whether it came from:

- `plugin dev`
- `plugin build`
- or a published plugin package

When the user is testing “what will the consumer get”, push them toward the built artifact, not the plugin source tree.
