# Work Handoff

## Objective
Stabilize provider approval semantics so pending approvals/user-inputs block further progression instead of being locally advanced by Stave.

## Active Task Path
tracking/sessions/2026-04-07_approval-semantics/features/provider-approval/tasks/block-pending-turns

## Current Status
Verify

## Completed
- Blocked follow-up `sendUserMessage` calls while approval or user-input remains pending.
- Disabled `ChatInput` submission while a pending approval or user-input exists, even if `activeTurnId` has already dropped.
- Added plain `Enter` approval for the latest pending approval in the active task when focus is not inside an editable or interactive control.
- Removed local fallback that marked approval/user-input as responded without an active provider turn.
- Kept replayed turns blocked when `done` arrives before the pending approval is resolved.
- Filtered stale `taskWorkspaceIdById` ownership to current workspaces during project/workspace activation.
- Added regression tests and passed targeted verification.

## Remaining Work
- Manual in-app repro check for the original approval flow.
- If cross-project conversation bleed still occurs, inspect provider session reuse and cached workspace restoration next.

## Recommended Next Actions
1. Reproduce a Claude approval flow and a Codex approval flow end-to-end in the app UI.
2. Verify that approving/denying from the chat bubble still works after workspace switches.
3. Verify that `Enter` does not auto-approve while focus is inside buttons, inputs, or editable fields.
4. If project A content still appears in project B conversations, instrument provider session resume paths and workspace cache restores.

## Open Questions
- Whether unresolved approval + unexpected `done` should emit a dedicated warning message in chat.

## Changed Files
- tracking/sessions/2026-04-07_approval-semantics/features/provider-approval/tasks/block-pending-turns/handoff.md
- src/store/provider-message.utils.ts
- src/lib/session/provider-event-replay.ts
- src/store/app.store.ts
- src/store/project.utils.ts
- src/components/session/ChatInput.tsx
- src/components/ai-elements/confirmation.tsx
- src/components/session/chat-input.utils.ts
- tests/provider-event-replay.test.ts
- tests/provider-request-sanitization.test.ts
- tests/bridge-persistence-regression.test.ts
- tests/chat-input-utils.test.ts

## Notes
- Verification run:
  - `bun run typecheck`
  - `bun test tests/provider-event-replay.test.ts tests/provider-request-sanitization.test.ts tests/bridge-persistence-regression.test.ts`
  - `bun test tests/chat-input-utils.test.ts`
