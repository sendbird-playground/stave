# Skills Index

| Name | Category | Compatible Tools | Trigger Summary |
| --- | --- | --- | --- |
| `stave-patch-release` | `release` | `claude`, `codex` | Stave patch release workflow: bump the patch version, refresh `CHANGELOG.md`, create the release commit and `vX.Y.Z` tag, then push both to `origin` and `public`. |
| `the-worktree-pr-flow` | `workflow` | `claude`, `codex` | Move the current dirty branch state into a dedicated temporary `git worktree`, commit it with a Conventional Commit message, push the branch, open a GitHub PR, and clean up the temporary worktree. |
