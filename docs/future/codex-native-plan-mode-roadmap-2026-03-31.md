# Codex Native Plan Mode Roadmap (Historical, 2026-03-31)

## Status

This roadmap is now mostly historical.

As of 2026-04-07, Stave's primary Codex runtime uses the App Server transport
instead of the older TypeScript SDK exec bridge. Native plan mode is therefore
available on the main path.

## What Shipped

- Codex plan turns now use the App Server `collaborationMode.mode = "plan"` path.
- Native `plan` items and `item/plan/delta` events are mapped directly into
  Stave `plan_ready` events.
- Plan turns still force the effective Codex runtime to `read-only` plus
  `approvalPolicy = never`.
- Stave keeps plan threads separate from normal Codex turns so plan-only context
  does not leak into implementation threads.
- Some models still return plain assistant text instead of native `plan` items.
  Stave now keeps a fallback that promotes the final assistant segment into a
  plan response when native plan items are absent.

## Legacy Context

The original March 31 plan described the older bridge implementation built on
`@openai/codex-sdk` plus `codex exec --experimental-json`. That path remains in
the repo only as a rollback target and still contains the old final-agent-message
promotion and `todo_list` fallback logic.

## Remaining Follow-ups

1. Remove or archive the rollback-only SDK path after the App Server runtime has soaked long enough.
2. Add dedicated App Server runtime tests instead of relying only on provider/replay coverage plus live smoke checks.
3. Decide whether the Codex UI should still use the `experimental` label now that the primary transport is native.
