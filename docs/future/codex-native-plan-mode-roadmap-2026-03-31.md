# Codex Native Plan Mode Roadmap (2026-03-31)

## Current state

Stave now exposes an experimental Codex plan toggle on top of the TypeScript
SDK path (`@openai/codex-sdk` + `codex exec --experimental-json`).

Current implementation details:

- Stave enables Codex plan turns with `collaboration_mode_kind = "plan"`.
- Stave forwards `plan_mode_reasoning_effort` from the active Codex reasoning setting.
- Stave forces Codex plan turns onto a `read-only` sandbox so plan turns do
  not mutate the workspace even if normal Codex turns use a writable sandbox.
- Stave forces the effective Codex approval policy to `never` during plan
  turns so the read-only planning loop does not keep pausing for approval.
- The current TypeScript SDK path does not surface first-class `plan` items or
  `item/plan/delta` events.
- In practice, the exec JSON stream currently exposes plan-mode progress as
  `todo_list` items plus a final `agent_message`.
- Stave therefore treats the last plan-mode agent message as the final plan
  response, with a todo-list markdown fallback when no final plan message is available.

This keeps the UI usable today, but it is still a bridge implementation rather
than true Codex-native plan parity.

## Graduation trigger

Promote Codex plan mode from experimental to first-class support when one of
the following becomes available in the TypeScript SDK surface Stave uses:

1. `ThreadItem` includes a stable `plan` item type.
2. `ThreadEvent` exposes stable plan-specific streaming events.
3. Stave migrates Codex plan turns from the exec JSON path to the app-server
   protocol path with stable `plan` item and plan delta support.

## Migration plan

When the SDK or transport is ready:

1. Remove the final-agent-message promotion fallback from `electron/providers/codex-sdk-runtime.ts`.
2. Map native Codex `plan` items directly to Stave `plan_ready` events.
3. Prefer native plan deltas over todo-list-derived fallback plan text.
4. Drop the `experimental` labeling in the Codex plan UI.
5. Revisit persisted plan-thread behavior so native Codex conversation ids can
   be resumed safely across sessions without sharing one slot with normal Codex turns.

## Notes

- The current experimental toggle should remain compatible with future native
  support because it already threads a distinct `codexExperimentalPlanMode`
  runtime option through renderer, IPC, and provider runtime layers.
- The intended end state is Claude-like plan handling without relying on
  heuristic promotion of the final agent message.
