# Diagnostic Flows

- Stale authored skill: `skills stale` -> `skills dependencies <package>` -> `skills validate <path>`
- Missing runtime dependency: `skills missing` -> `skills install <package>` -> `skills env`
- Malformed plugin shell: `plugin inspect <dir>` -> follow `path` and `nextSteps` -> `plugin validate <dir>`

