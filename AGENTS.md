# AGENTS.md

## Purpose

Project policy entrypoint for `/home/astyfx/stave`.

## Local Override

`AGENTS.local.md` is a project-local overlay convention for this repository. It is not an official `agents.md` standard feature.

## Base Policy

If no local overlay exists, load and prioritize user's `AGENTS.md` as the primary policy source.

## Release Workflow

For version bumps, release commits, changelog generation, tags, or pushes to the Stave remotes:

- Use `$stave-patch-release`.
- Generate or refresh `CHANGELOG.md` with `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s` instead of hand-writing release sections.
- Keep release tags in `vX.Y.Z` form. Incremental `conventional-changelog` generation depends on semver tags.
- If the repo has no prior semver release tag, stop and report that the release flow needs a baseline tag before incremental changelog generation is safe.
- Push the release commit and matching release tag to both `origin` and `public`.

## UI Components

When using an existing shadcn component, prefer generating it with `bunx --bun shadcn@latest add <component>` instead of hand-writing or directly vendoring the wrapper first.

After generating shadcn components or copying UI code from external sources, verify that import paths match this project's configured aliases before finishing. In this repo, `tsconfig.json` resolves `@/*` to `src/*`, so generated `src/...` imports should be rewritten to `@/...`. More generally, do not assume copied code uses this repo's path layout; reconcile imports with the current `tsconfig` and `components.json` settings.
