# Agentpack Auth Bootstrap Design

## Goal

Reduce internal adoption friction for private skill installs by making Agent Pack handle GitHub Packages authentication as a first-class CLI workflow.

The desired user experience is:

1. Run `agentpack auth login`
2. Browser opens to GitHub token setup guidance
3. User completes the one-time token step and pastes the token back
4. Agent Pack validates it, configures the machine, and confirms success
5. User can run `agentpack skills install ...` without touching npm auth manually

## Scope

This design covers:

- whole-machine authentication for GitHub Packages
- a new `auth` command namespace
- Agent Pack-owned config and credential storage
- registry wiring for `npm.pkg.github.com`
- status and verification UX

This design does not cover:

- true OAuth-only browser authentication without PATs
- a hosted Agent Pack backend
- a skill-browsing catalog UI
- support for registries beyond GitHub Packages in v1

## Product Decision

Agent Pack will own the GitHub Packages auth bootstrap instead of expecting teammates to edit `.npmrc`, understand scopes, or run raw npm login flows.

GitHub Packages remains the backend registry because the team already has GitHub org access. Agent Pack becomes the friendly client on top.

## Command Surface

### `agentpack auth login`

Purpose:
- guide a user through one-time GitHub Packages setup
- capture and validate a GitHub token
- configure machine-level registry access for the org scope

Behavior:
- opens a browser to a GitHub token creation/help page
- explains the required token scope and what Agent Pack is configuring
- uses configured defaults for org scope and verification package unless explicit flags override them
- prompts only for token entry in the default path
- validates the token against GitHub Packages
- stores credentials securely
- updates user-level npm config for the org scope
- prints next steps

Success output should include:
- configured org scope
- configured registry
- credential storage mode
- next command suggestions

### `agentpack auth status`

Purpose:
- show whether auth is configured correctly
- show where credentials are stored
- show whether npm wiring is present

Default behavior:
- inspect local Agent Pack config
- inspect user-level npm config
- do not make a network call

Suggested output:
- configured: yes/no
- provider: GitHub Packages
- scope: `@alavida` or configured org scope
- registry: `https://npm.pkg.github.com`
- credential storage: file
- npm config: wired/missing

### `agentpack auth status --verify`

Purpose:
- confirm that the stored credential still works

Behavior:
- performs a real authenticated registry check
- reports `valid`, `invalid`, or `unreachable`

### `agentpack auth logout`

Purpose:
- remove stored credentials and Agent Pack-managed auth wiring

Behavior:
- deletes file-backed credential storage
- removes only Agent Pack-managed npm auth entries
- preserves unrelated user npm config

## Storage Model

### Config path

Use:

- `~/.config/agentpack/config.json`

Rationale:
- standard cross-tool config location
- clean separation between user config and repo state
- better long-term maintainability than a custom `~/.agentpack/config/config.json` tree

### Secret storage

Use:
- `~/.config/agentpack/credentials.json`

Requirements:
- strict file permissions
- never print the token back to the terminal
- surface file-backed storage mode honestly in `auth status`

### Config contents

`config.json` should hold non-secret settings such as:

- provider: `github-packages`
- org scope
- registry URL
- credential storage mode
- verification package
- managed npm keys
- npm config management marker

It should not store the raw token when keychain storage is available.

## npm Configuration Strategy

Agent Pack should configure the whole machine rather than a single repo.

Managed user-level npm config should include:

- `@<org>:registry=https://npm.pkg.github.com`
- `//npm.pkg.github.com/:_authToken=<token>`

Requirements:
- touch user-level npm config, not repo-local `.npmrc`
- preserve unrelated existing entries
- mark or track the Agent Pack-managed entries so logout can remove them safely
- do not set global `always-auth=true` by default

### Configuration precedence

Registry and auth resolution should use this order:

1. repo-local `.npmrc`
2. Agent Pack-managed user-level npm config
3. Agent Pack config defaults

This keeps repo-specific overrides possible while preserving a simple machine-wide default for non-technical users.

## Verification Flow

`auth login` should verify the token before claiming success.

Recommended verification flow:

1. Confirm the token is non-empty
2. Confirm Agent Pack can read the configured org scope
3. Make an authenticated request to the metadata endpoint for a configured verification package
4. Classify result as:
   - valid
   - invalid credential
   - insufficient permissions
   - network failure

`auth status --verify` should reuse the same verification path.

The verification package must be explicit in configuration, not hardcoded deep in the implementation.

## Error Handling

Errors must stay human-readable and product-level.

Examples:

- missing auth:
  - "No GitHub Packages credential is configured. Run `agentpack auth login`."
- invalid token:
  - "The saved GitHub credential was rejected by GitHub Packages."
- missing npm wiring:
  - "Credential is stored, but npm registry wiring for `@alavida` is missing."
- network issue:
  - "Could not verify GitHub Packages right now. Check your connection and try again."

Do not default to raw npm error output unless verbose mode is enabled.

## Internal Architecture

Add a small auth slice instead of mixing this logic into the current skills registry inspection flow.

Suggested responsibilities:

- `src/commands/auth.js`
  - CLI surface for login, status, logout
- `src/application/auth/*.js`
  - login, status, and logout use cases
- `src/domain/auth/*.js`
  - config and resolution helpers with no CLI concerns
- `src/infrastructure/fs/user-config-repository.js`
  - read/write `~/.config/agentpack/config.json`
- `src/infrastructure/fs/user-credentials-repository.js`
  - file credential handling
- `src/infrastructure/fs/user-npmrc-repository.js`
  - safe read/update/remove support for user-level npm config
- `src/infrastructure/runtime/open-browser.js`
  - reuse existing browser-open helper where possible

The existing skills install flow should consume a shared registry resolution helper rather than re-implementing repo-local and user-level precedence rules in multiple places.

## Security Notes

- Never print the token back to the terminal
- Never write the token into repo files
- Avoid removing unrelated user npm auth settings during logout

## Future Extensions

Possible follow-up work after v1:

- skill browsing backed by GitHub Packages metadata
- support for multiple org scopes
- support for npm private orgs and Artifactory
- real OS keychain storage
- browser-assisted login page instead of direct GitHub token page
- Agent Pack hosted auth service for true browser-first login
