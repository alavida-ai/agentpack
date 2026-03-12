# Authored Metadata

- `SKILL.md` owns `name`, `description`, `metadata.sources`, and `requires`
- `package.json.agentpack.skills` owns the exported skill map and each exported skill path
- `package.json` owns package-level distribution metadata such as package name, version, publish config, and repository
- `requires` uses canonical ids like `@scope/package:skill-name`
- `skills validate` syncs managed cross-package dependencies from `requires` and refreshes `.agentpack/build-state.json`
