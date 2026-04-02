# Scroll Handoff

## Task
Stabilize chat scroll-to-bottom during workspace switches and add gated diagnostics for bottom restoration.

## Status
Verify

## Last Completed Step
Fixed race condition between Virtuoso initial render and scroll-to-bottom logic:

1. **ConversationContent scope reset** — on `scrollScopeKey` change, reset `stickToBottomRef` to `true` so subsequent streaming updates keep auto-scrolling.
2. **Restoring guard (`isRestoringRef`)** — suppress Virtuoso's transient `atBottomStateChange(false)` during restore-to-bottom, which was prematurely disabling `followOutput` and breaking auto-scroll for streaming content.
3. **`restoreToBottom` always re-enables stickToBottom** — previously only `force-scroll-key` path did this; now `list-scope-change` and `fallback-no-anchor` also set `stickToBottomRef = true`.
4. **Deferred scope-change restore** — on `listKey` change, delay `restoreToBottom` by 60ms via `setTimeout` to let Virtuoso finish initial item measurement (avoids stale `scrollHeight`).
5. **Increased sync attempts** — bumped `scheduleContainerBottomSync` from 2 to 4 RAF rounds and added `finishRestore()` callback that re-asserts stickToBottom state when the sync loop completes.

## Next Action
Manually verify workspace-to-workspace task switches with `localStorage.setItem("stave:debug:conversation-scroll", "1")`; confirm:
- Clicking into a streaming task scrolls fully to bottom
- Switching between tasks with long message histories scrolls to bottom
- New streaming content keeps auto-scrolling after task switch
- Scroll button appears/disappears correctly when scrolling up/down after a switch

## Open Question
Does the repro only happen when the input dock or plan viewer height changes after the workspace swap?

## Changed Files
- `src/components/ai-elements/conversation.tsx`
- `src/components/session/ChatPanel.tsx`

## Notes
`bun run typecheck` passed (only pre-existing error in `completion-phrases.ts`).
`bun test` passed — 603 pass, 0 fail.
