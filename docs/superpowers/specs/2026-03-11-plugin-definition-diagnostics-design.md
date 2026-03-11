# Plugin Definition Diagnostics Design

## Summary

Add a centralized plugin definition loader that validates plugin prerequisites before plugin commands run bundle logic. This loader should return a normalized plugin definition on success and throw structured, agent-friendly diagnostics for expected setup problems.

The immediate driver is `agentpack plugin inspect`, which currently collapses missing `package.json` and incomplete package metadata into the same generic error. The design fixes that by introducing one validation boundary for plugin filesystem inputs.

## Problem

Today `plugin inspect` reaches into plugin metadata directly and reports a generic validation failure when `package.json` is absent or incomplete. That creates three problems:

1. Missing files and missing fields are treated as the same failure.
2. Human CLI output is ambiguous and not actionable enough.
3. Agents and JSON consumers have to infer recovery from error strings instead of using structured guidance.

The same pattern is likely to affect other plugin commands over time if plugin definition loading remains ad hoc.

## Goals

- Create a single boundary for plugin definition loading and prerequisite validation.
- Distinguish expected setup problems from unexpected internal failures.
- Provide structured diagnostics with deterministic next steps for agents.
- Keep command behavior consistent across `plugin inspect`, `plugin validate`, and `plugin build`.
- Preserve concise, readable CLI output by rendering from the same structured diagnostic model used for JSON output.

## Non-Goals

- Implement `plugin init`.
- Redesign all skill diagnostics in this change.
- Introduce a shared generic artifact loader for both skills and plugins in the first iteration.

## Proposed Architecture

Introduce a plugin definition loader between plugin use cases and bundle logic:

```text
command -> use case -> plugin definition loader -> bundle logic -> output
```

Responsibilities:

- Command layer:
  - parse arguments
  - select output mode
  - render success or diagnostic output

- Use case layer:
  - orchestrate the command flow
  - call the loader with the required validation level
  - call downstream plugin bundle logic only after the definition is valid

- Plugin definition loader:
  - resolve the plugin directory
  - check required files in order
  - parse and validate package metadata
  - check plugin manifest prerequisites for the active command
  - return normalized plugin data or throw a typed diagnostic error

- Bundle logic:
  - inspect bundled skills
  - resolve dependency closure
  - validate bundle constraints
  - assume trusted plugin definition input

## Public API

Primary loader entrypoint:

```js
loadPluginDefinition(target, {
  cwd,
  requirementLevel
})
```

`requirementLevel` is explicit from the start so the module is reusable across commands:

- `inspect`
- `validate`
- `build`

Successful return shape:

```js
{
  pluginDir,
  packageJsonPath,
  packageJson,
  packageName,
  packageVersion,
  pluginManifestPath,
  pluginManifest
}
```

This output is the trusted boundary object that downstream plugin logic consumes.

## Diagnostic Model

Expected setup problems should throw a typed diagnostic error with an agent-first payload:

```js
{
  code,
  message,
  path,
  nextSteps: [
    {
      action,
      path,
      reason,
      example
    }
  ],
  details
}
```

### Diagnostic Principles

- `code` is stable and machine-readable.
- `message` is concise and human-readable.
- `path` identifies the primary file or directory involved.
- `nextSteps` gives agents explicit recovery instructions without English parsing.
- `details` contains structured facts such as missing fields or active requirement level.

### Initial Diagnostic Codes

- `missing_plugin_package_json`
- `invalid_plugin_package_json`
- `missing_plugin_package_fields`
- `missing_plugin_manifest`

### Example

```js
{
  code: 'missing_plugin_package_json',
  message: 'No package.json found for plugin target',
  path: 'domains/operations/workbenches/creator/execution-ops/package.json',
  nextSteps: [
    {
      action: 'create_file',
      path: 'domains/operations/workbenches/creator/execution-ops/package.json',
      reason: 'A plugin must declare package metadata before it can be inspected',
      example: {
        name: '@alavida-ai/plugin-execution-ops',
        version: '0.1.0'
      }
    }
  ],
  details: {
    requirementLevel: 'inspect',
    missing: ['package.json']
  }
}
```

## Requirement Levels

Requirement levels keep one loader generic while allowing command-specific prerequisites.

Initial shape:

- `inspect`
  - plugin directory resolves
  - `package.json` exists and parses
  - `package.json` includes `name` and `version`
  - `.claude-plugin/plugin.json` exists

- `validate`
  - same baseline requirements as `inspect`

- `build`
  - same baseline requirements as `inspect`

The exact differences between command levels can evolve later without changing the loader contract.

## Module Layout

Suggested module structure:

```text
src/domain/plugins/
  load-plugin-definition.js
  plugin-diagnostic-error.js
  plugin-requirements.js
```

Responsibilities:

- `load-plugin-definition.js`
  - perform ordered validation and normalization
  - throw structured expected diagnostics

- `plugin-diagnostic-error.js`
  - define the typed expected error wrapper

- `plugin-requirements.js`
  - map requirement levels to required plugin files and fields

This keeps plugin bundle logic focused on plugin behavior rather than filesystem triage.

## Output Strategy

The internal model should be agent-first. Human CLI output should render from the structured diagnostic payload rather than define the payload.

This gives two projections of the same data:

- Human CLI output
  - concise summary
  - file path
  - short next step
  - optional inline example for common recovery paths

- JSON output
  - full diagnostic object
  - stable codes and details
  - deterministic next steps for agent automation

This prevents human-oriented strings from becoming the de facto API.

## Why This Is Good CLI Architecture

This design creates a clear validation boundary where external filesystem input enters the system. That is the correct place to:

- decide whether failures are expected and recoverable
- normalize raw input into trusted domain data
- keep commands thin
- avoid duplicated checks and drifting error behavior

The result is a better contract for three audiences:

- Humans:
  - clearer errors
  - less guesswork

- Agents and JSON consumers:
  - stable codes
  - machine-readable paths and examples
  - explicit recovery actions

- Maintainers:
  - one place to evolve plugin prerequisites
  - easier future support for `plugin init`
  - a reusable pattern for skill diagnostics later

## Skills Applicability

This pattern also works for skills, but the first implementation should keep skills and plugins in separate loaders with shared conventions rather than a shared generic artifact loader.

Recommended follow-on direction:

- `loadSkillDefinition(...)`
- `loadPluginDefinition(...)`

Both can emit the same style of structured diagnostics while keeping artifact-specific validation rules separate.

## Risks and Trade-Offs

- Adds a new abstraction layer, which is justified only if multiple commands share it.
- Requires discipline to keep downstream code from re-introducing ad hoc validation.
- Needs care in choosing stable diagnostic codes because JSON consumers may depend on them.

These are acceptable trade-offs because the current behavior is already exposing an implicit and weaker contract.

## Recommended Implementation Direction

1. Add the plugin definition loader and typed diagnostic error.
2. Move current plugin package and manifest prerequisite checks into the loader.
3. Update `plugin inspect` to use the loader and render diagnostics from structured data.
4. Reuse the loader from `plugin validate` and `plugin build`.
5. Add tests for missing file, invalid file, and missing field diagnostics in both text and JSON output.

## Open Questions

- Whether the human CLI should always print inline JSON examples for missing files or reserve examples for the most common cases.
- Whether future diagnostics should include a compact `docsUrl` field once plugin authoring documentation exists.

## Decision

Adopt a centralized, agent-first plugin definition diagnostic boundary and use it as the canonical source of plugin prerequisite validation for plugin commands.
