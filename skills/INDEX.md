# Skills Index

| Name | Category | Compatible Tools | Trigger Summary |
| --- | --- | --- | --- |
| `stave-patch-release` | `release` | `claude`, `codex` | Stave patch release workflow: bump the patch version, refresh `CHANGELOG.md`, create the release commit and `vX.Y.Z` tag, then push both to `origin` and `public`. |
| `stave-worktree-pr-flow` | `workflow` | `claude`, `codex` | Ship current work as a PR in one pass: reuse the current workspace-linked worktree when already in one, otherwise create a temporary worktree, commit with Conventional Commits, push, create PR, then clean up the temporary worktree. |
