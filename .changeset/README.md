# Changesets

Add a changeset in feature PRs for user-facing behavior changes:

```bash
npx changeset
```

For root CLI releases, choose `@alavida/agentpack-release`. The release workflow mirrors that tracker version onto the publishable root package `@alavida/agentpack`.

On pushes to `main`, GitHub Actions uses Changesets to either:

- open or update the `Version Packages` release PR when pending changesets exist
- publish to npm when the generated release PR is merged

Manual git tags are no longer the normal release path for this repo.
