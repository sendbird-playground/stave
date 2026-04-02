# Scroll Handoff

## Task
Stabilize chat scroll-to-bottom during workspace switches and add gated diagnostics for bottom restoration.

## Status
Verify

## Last Completed Step
Made `ConversationVirtualList` run a follow-up container bottom sync on restore-to-bottom, added localStorage-gated `[conversation-scroll]` diagnostics, and keyed chat scroll scope by `activeWorkspaceId:activeTaskId`.

## Next Action
Manually verify workspace-to-workspace task switches with `localStorage.setItem("stave:debug:conversation-scroll", "1")`; if the issue persists, inspect `restore-to-bottom` and `container-bottom-sync` log order.

## Open Question
Does the repro only happen when the input dock or plan viewer height changes after the workspace swap?

## Changed Files
- `src/components/ai-elements/conversation.tsx`
- `src/components/session/ChatPanel.tsx`

## Notes
`bun run typecheck` passed.
