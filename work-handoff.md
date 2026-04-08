# Work Handoff

## Objective
Bring Stave's approval-request UX closer to Claude CLI / Codex CLI by adding a composer-side "guide instead" flow for paused approvals, while staying inside the current provider approval and user-input contracts.

## Active Task Path
.

## Current Status
Verify

## Completed
- Reconfirmed that shared provider contracts still model approval responses as `approved: boolean`, while `user_input` is a separate event family.
- Added a composer-side `Guide Instead` flow to [`src/components/session/chat-input-approval-queue.tsx`](/Users/jacob.kim/workspace/stave/.stave/workspaces/fix__accept/src/components/session/chat-input-approval-queue.tsx) for the newest pending approval.
- Added `Tab` handling in [`src/components/session/ChatInput.tsx`](/Users/jacob.kim/workspace/stave/.stave/workspaces/fix__accept/src/components/session/ChatInput.tsx) so the latest approval can open the guidance draft UI without reopening the trace.
- Added prompt-staging helpers in [`src/components/session/chat-input.utils.ts`](/Users/jacob.kim/workspace/stave/.stave/workspaces/fix__accept/src/components/session/chat-input.utils.ts) so rejecting an approval can stage a contextual next-turn prompt.
- Narrowed confirmation/queue imports away from the `@/components/ui` barrel so SSR-style component tests no longer trip `window` access during module load.
- Updated README and the provider approval guide to describe the new `Tab` / `Guide Instead` workflow and its current limitation.
- Passed `bun run typecheck`.
- Passed `bun test tests/chat-input-approval-queue.test.tsx tests/chat-input.utils.test.ts`.

## Remaining Work
- Manual desktop smoke check for the queue flow in both normal and compact chat layouts.
- Decide whether trace-level approval cards should get the same "guide instead" affordance or whether the composer queue remains the only entry point.
- Decide whether a future provider-contract change should support true in-turn "deny with guidance" instead of the current "reject and stage next turn" workflow.

## Recommended Next Actions
1. Run the app and verify `Enter` still approves the latest request while `Tab` opens the queue guidance textarea only when focus is outside editable fields.
2. Deny an approval through `Reject & Draft` and confirm the staged prompt survives until the turn fully stops and then autofocuses the composer.
3. If product wants closer CLI parity, inspect provider runtime contracts end-to-end before adding any new `respondApproval` payload shape.

## Nice-to-Have Follow-Ups
- Add an interaction-level component test for `ChatInput` keyboard handling if a lightweight DOM harness becomes available.
- Consider showing the queued staged guidance more explicitly in the composer while the turn is still blocked.

## Open Questions
- Should `Guide Instead` stay as a Stave-only UX convenience, or should approval responders be extended to carry structured follow-up text into provider runtimes later?

## Changed Files
- README.md
- docs/features/provider-sandbox-and-approval.md
- src/components/ai-elements/confirmation.tsx
- src/components/session/ChatInput.tsx
- src/components/session/chat-input-approval-queue.tsx
- src/components/session/chat-input.utils.ts
- tests/chat-input-approval-queue.test.tsx
- tests/chat-input.utils.test.ts
- work-handoff.md

## Notes
- Current implementation is intentionally honest about the contract boundary: it does not pretend Stave can inject extra text into an already-paused approval callback. It denies the request and stages the next user turn with contextual prompt text instead.
