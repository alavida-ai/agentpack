# Authored Metadata

- `SKILL.md` owns `name`, `description`, `metadata.sources`, and `requires`
- `package.json` owns distribution metadata such as package name, version, publish config, and repository
- `skills validate` syncs managed dependencies from `requires` and refreshes `.agentpack/build-state.json`

