# Work Handoff

## Objective
Fix the runtime regressions identified in the recent Claude review and re-check the previously held review items against the patched code.

## Active Task Path
execution/sessions/2026-04-10_review-fixes/features/runtime-stability/tasks/fix-reviewed-runtime-regressions

## Current Status
Done

## Completed
- Fixed the missing `listWorkspaceScriptProcessesForWorkspace` import in `workspace-scripts/executor.ts`, removing the `ReferenceError` crash path in `stopAllWorkspaceScriptProcesses()`.
- Cleared finite-script timeout handles on normal process completion/error so completed child runs do not retain stale timers.
- Captured and disposed `node-pty` `onData` / `onExit` subscriptions for service scripts, and prevented a stopped service from later emitting a spurious `completed` event.
- Added provider runtime shutdown cleanup and wired it into host-service shutdown, including cleanup for task-scoped and default provider caches.
- Added proactive renderer-destroy cleanup for provider push-stream owner bookkeeping.
- Bounded local MCP workspace session cache growth and cleaned settled persist-chain entries; added host-service shutdown cleanup for local MCP runtime state.
- Reduced completed polling stream retention from the active 15-minute TTL to a shorter post-completion retention window.
- Guarded PTY session creation so a tab removed during async session creation closes the stale backend session instead of leaving an orphan mapping.
- Added regression tests for workspace script process cleanup disposal and provider runtime shutdown stream cleanup.
- Stopped the LSP session manager from stacking duplicate `WebContents.destroyed` listeners for the same sender/session pair.
- Added `tests/lsp-session-manager.test.ts` to keep that `MaxListenersExceededWarning` path covered.
- Passed `bun run typecheck`.
- Passed `bun test tests/provider-runtime-stream-order.test.ts tests/workspace-scripts-state.test.ts tests/local-mcp-service-bridge.test.ts tests/terminal-session-slot-registry.test.ts`.
- Passed `bun test tests/lsp-session-manager.test.ts`.

## Remaining Work
- Manual desktop smoke check for terminal focus/restore and tab removal flows would still add confidence, but no automated failures remain in the touched areas.

## Recommended Next Actions
1. If this ships soon, do one Electron manual smoke pass for docked terminal, CLI session, and workspace switching.

## Nice-to-Have Follow-Ups
- Add an interaction-level regression test around async tab removal during PTY session creation if a lightweight harness becomes available for `usePtySessionSurface`.

## Open Questions
- None.

## Changed Files
- electron/host-service.ts
- electron/host-service/local-mcp-runtime.ts
- electron/main/lsp/session-manager.ts
- electron/main/ipc/provider.ts
- electron/main/workspace-scripts/executor.ts
- electron/main/workspace-scripts/state.ts
- electron/providers/runtime.ts
- electron/providers/types.ts
- src/components/layout/usePtySessionSurface.ts
- tests/lsp-session-manager.test.ts
- tests/provider-runtime-stream-order.test.ts
- tests/workspace-scripts-state.test.ts
- execution/sessions/2026-04-10_review-fixes/features/runtime-stability/tasks/fix-reviewed-runtime-regressions/handoff.md
- work-handoff.md

## Notes
- Re-checked the previously held review items after the patch:
  - Event-bridge unsubscribe warnings remain low-confidence and do not currently show an accumulating leak path because each bridge is single-registration guarded.
  - The terminal delivery-mode race is still not confirmed from the current code; no concrete output-loss path was reproduced from the push-to-poll buffering logic.
- A separate Electron warning path was confirmed in the LSP layer: repeated LSP requests from the same renderer were re-attaching `destroyed` listeners to the same `WebContents`.
