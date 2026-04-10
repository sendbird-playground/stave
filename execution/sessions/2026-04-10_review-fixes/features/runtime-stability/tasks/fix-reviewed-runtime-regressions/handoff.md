# Handoff

## Objective
Fix the runtime regressions identified in the recent Claude review, then re-check the previously held items against the updated code.

## Task Path
execution/sessions/2026-04-10_review-fixes/features/runtime-stability/tasks/fix-reviewed-runtime-regressions

## Current Status
Done

## Scope
- Fix confirmed workspace script runtime issues.
- Fix provider/local-MCP shutdown and ownership cleanup gaps.
- Guard terminal session creation against stale tab races.
- Re-evaluate held review items after verification.

## Plan
- [x] Re-verify each reported issue against current code.
- [x] Patch confirmed runtime/resource-management bugs.
- [x] Run typecheck and targeted tests.
- [x] Reassess the previously held review items against the patched code.

## Progress
- 2026-04-10 15:23 +0900: Re-verified the Claude review against current code and separated confirmed issues from overcalls.
- 2026-04-10 15:24 +0900: Started patching workspace-scripts, provider runtime shutdown, provider owner cleanup, local MCP cache cleanup, and PTY stale-tab handling.
- 2026-04-10 15:32 +0900: Added regression tests for provider runtime shutdown cleanup and workspace script process cleanup disposal.
- 2026-04-10 15:34 +0900: Passed typecheck and targeted Bun tests, then re-checked the previously held review items against the patched code.
- 2026-04-10 23:12 +0900: Investigated a new `MaxListenersExceededWarning` on `WebContents.destroyed` and traced it to repeated LSP sender subscription registration in `session-manager.ts`.
- 2026-04-10 23:14 +0900: Added a sender-dedup guard in the LSP session manager and a focused regression test to keep the same sender/session pair from accumulating duplicate `destroyed` listeners.

## Decisions
- Use lightweight tracking only; a single `handoff.md` is enough for this fix set.
- Treat the provider polling-stream retention issue as a bounded-retention problem, not an immediate delete-on-done bug.

## Verification
- Passed `bun run typecheck`.
- Passed `bun test tests/provider-runtime-stream-order.test.ts tests/workspace-scripts-state.test.ts tests/local-mcp-service-bridge.test.ts tests/terminal-session-slot-registry.test.ts`.
- Re-ran `bun run typecheck` after the final provider shutdown cleanup adjustment.
- Re-ran `bun test tests/provider-runtime-stream-order.test.ts` after the final provider shutdown cleanup adjustment.
- Passed `bun test tests/lsp-session-manager.test.ts`.
- Re-ran `bun run typecheck` after the LSP sender-dedup change.

## Next Actions
None.

## Open Questions
None.

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

## Notes
- The highest-risk bug was the missing `listWorkspaceScriptProcessesForWorkspace` import in `stopAllWorkspaceScriptProcesses()`, which would have crashed at runtime.
- The latest `MaxListenersExceededWarning` was not a generic Electron warning; it came from the LSP session manager re-registering the same renderer sender against the same session on repeated requests.
- Re-check result for the held items:
  - Event-bridge unsubscribe warnings remain non-issues in the current lifecycle because the bridges are single-registration guards, not accumulating listeners.
  - The terminal delivery-mode race is still not confirmed from the current code path. The updated logic still buffers pending push output before poll reads, and no concrete drop path was reproduced here.

## Auto Snapshot

- Timestamp: 2026-04-10_232719
- Working Directory: /Users/jacob.kim/workspace/stave/.stave/workspaces/fix__lint-error-log
- Snapshot File: /Users/jacob.kim/.agents/claude/session-snapshots/2026-04-10_232719.md
- Recent Git Status:
```text
 M electron/main/eslint/eslint-service.ts
```

- Timestamp: 2026-04-10_222835
- Working Directory: /Users/jacob.kim/workspace/stave/.stave/workspaces/fix__notification-history
- Snapshot File: /Users/jacob.kim/.agents/claude/session-snapshots/2026-04-10_222835.md
- Recent Git Status:
```text
 M src/components/layout/TopBarNotifications.tsx
```
