# Repository Instructions

## Releases

- This repo uses Changesets as the release mechanism.
- Do not use manual git tags as the normal release path.
- For user-facing changes, add a changeset with `npx changeset` in the feature PR.
- After feature PRs merge to `main`, GitHub Actions opens or updates the `Version Packages` release PR.
- Merging the generated release PR publishes the package to npm.
