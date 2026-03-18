# Authored Metadata

- `SKILL.md` owns `name`, `description`, `source` bindings, and skill `import` declarations
- Root `SKILL.md` is the primary export; `skills/**/SKILL.md` provides named exports (discovered from the filesystem)
- `package.json` owns package-level distribution metadata such as package name, version, publish config, and repository
- `import` uses canonical ids like `@scope/package` or `@scope/package:skill-name`
- `publish validate` checks managed cross-package dependencies derived from imports and refreshes `.agentpack/compiled.json`
