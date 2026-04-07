# Work Handoff

## Objective
Restore chat scroll behavior after the zen-mode merge so normal mode matches the pre-`v0.1.0` sticky-bottom semantics and zen mode inherits the same fix for dock/viewport layout shifts.

## Active Task Path
.

## Current Status
Verify

## Completed
- Compared the current shared chat scroll implementation against `v0.1.0`, `47b6a5e`, and `1565857`.
- Confirmed the normal-mode list/update restore path still matched `v0.1.0`; the remaining regression came from shared sticky intent being cleared by layout-driven `atBottomStateChange(false)` events.
- Updated [`src/components/ai-elements/conversation.tsx`](/Users/jacob.kim/workspace/stave/.stave/workspaces/fix__zen-mode-message-scroll--continue--20260407-102858/src/components/ai-elements/conversation.tsx) so `stickToBottom` is a shared intent ref owned by `Conversation`, reused by both `ConversationContent` and `ConversationVirtualList`.
- Stopped Virtuoso geometry changes from disabling sticky intent during dock/container resize, which allows the existing resize and extra-bottom-padding restore paths to work for both normal and zen layouts.
- Patched [`src/components/ai-elements/conversation.tsx`](/Users/jacob.kim/workspace/stave/.stave/workspaces/fix__zen-scroll/src/components/ai-elements/conversation.tsx) so native container `onScroll` no longer clears sticky intent during layout-driven or internal restore scrolls.
- Added a short sticky-intent guard window around internal scroll-to-bottom / restore operations and preserved that intent across transient Virtuoso `atBottomStateChange(false)` callbacks.
- Passed `bun run typecheck` and `bun test` on `fix/zen-scroll`.

## Remaining Work
- Manual UI smoke check for both normal and zen scroll behavior.
- If either mode still drifts, capture `stave:debug:conversation-scroll=1` logs while reproducing and compare whether the unexpected `stickToBottom=false` now comes from a real user scroll vs. an unguarded geometry change.

## Recommended Next Actions
1. In normal mode, verify bottom pinning while the input grows/shrinks and while switching tasks/workspaces.
2. In zen mode, verify bottom pinning while the overlay dock height changes and after turn completion.
3. In both modes, scroll upward, receive new content, and confirm the view does not jump back to bottom until explicitly restored.

## Nice-to-Have Follow-Ups
- Add a focused scroll-behavior regression test once there is a lightweight component test harness for Virtuoso-backed chat surfaces.

## Open Questions
- None at the code level; only manual repro confirmation remains.

## Changed Files
- src/components/ai-elements/conversation.tsx
- work-handoff.md

## Notes
- The critical distinction is now "user follow-bottom intent" vs. "current geometric at-bottom state". Layout shifts and programmatic restore scrolls should update `atBottom`, but must not clear sticky intent before the restore logic finishes.
