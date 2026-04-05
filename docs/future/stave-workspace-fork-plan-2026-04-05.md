# Stave Workspace Fork Plan

## Objective

Define a Stave-native fork feature that captures the user-visible benefit of Codex fork without depending on provider-specific thread forking APIs.

## Recommendation

Implement fork as a Stave-level workflow:

1. User clicks `Fork from here` on a user prompt row.
2. Stave creates a new git worktree workspace from the source workspace branch/HEAD.
3. Stave creates one new task in that workspace.
4. Stave copies chat history up to the selected turn boundary into the new task.
5. Stave clears provider-native session ids so the fork starts as a fresh provider session.

This should be framed as a common Stave capability, not a Codex-only feature.

## Why This Shape Fits Stave

- Stave already treats git worktrees as first-class workspace units.
- Stave already persists task messages, prompt drafts, and provider session ids per workspace.
- Stave already has adjacent primitives:
  - `createWorkspace(...)` for worktree creation
  - `duplicateTask(...)` for task/message cloning
  - `continueWorkspaceFromSummary(...)` for branch-off into a new workspace
- Codex native thread resume exists, but Stave is multi-provider. A provider-native fork abstraction would be asymmetrical and harder to explain in shared UI.

## Product Positioning

### User-Facing Meaning

`Fork from here` means:

- preserve the original task/workspace unchanged
- branch into a new isolated worktree
- keep only the conversation context up to the chosen turn
- continue with a fresh native provider session

### What It Is Not

- not a replacement for `Continue`
- not a task copy in the same workspace
- not a provider-native thread clone
- not a guarantee that uncommitted filesystem state from the source workspace is duplicated in MVP

## Scope

### MVP

- Entry point on user prompt rows only
- Turn-boundary history copy
- New workspace + new task creation
- Empty `providerSessionByTask` and `nativeSessionReadyByTask` for the forked task
- Fork metadata persisted for traceability
- Clean-workspace requirement for source worktree

### Post-MVP

- Dirty workspace carry-over via patch apply
- Fork from command palette / task menu
- Fork lineage UI (parent/child graph, badges, navigation)
- Optional provider-optimized fork paths if an official provider API is exposed later

## Functional Design

### Fork Anchor

Use a user prompt as the explicit anchor, but fork the whole completed turn:

- include all messages up to the selected user message
- if that prompt already has assistant output before the next user message, include that assistant output too
- exclude later turns

Reason:

- the UI stays prompt-oriented
- the copied context is semantically complete
- we avoid forking from tool-stream fragments

### Workspace Strategy

Create the new workspace from the source workspace branch/HEAD, not from PR base branch.

Reason:

- `Continue` is next-chapter flow from base branch
- `Fork` is alternate-branch flow from the current working line

### Provider Session Strategy

Do not carry native provider session ids into the fork.

Reason:

- Stave currently resumes providers by persisted native session id
- reusing the same native session would blur lineage between source and fork
- clearing the session keeps fork behavior provider-agnostic and deterministic

## Dirty Worktree Policy

### MVP Decision

Block fork when the source workspace has uncommitted changes.

The confirmation dialog should explain:

- fork currently copies conversation context, not arbitrary dirty filesystem state
- commit or stash changes first to get a precise code snapshot

### Why

- current worktree creation path branches from git refs, not from live dirty trees
- Stave does not currently store per-prompt workspace snapshots
- task checkpoints capture the task-start commit only, not every prompt boundary

## Data Model

### New Metadata

Add fork lineage metadata to the forked task, and optionally to workspace information:

- `parentTaskId`
- `parentWorkspaceId`
- `forkAnchorMessageId`
- `forkedAt`
- `forkSourceProviderId`
- `forkSourceBranch`
- `forkSourceCommit`

This can live on the task model or in a parallel map if task shape churn should be minimized.

### Existing State To Reuse

- `messagesByTask`
- `messageCountByTask`
- `taskWorkspaceIdById`
- `providerSessionByTask`
- `nativeSessionReadyByTask`
- `taskCheckpointById`

## Store / Runtime Design

### New Store Action

Add a store action similar to:

```ts
forkWorkspaceFromMessage(args: {
  taskId: string;
  anchorMessageId: string;
  workspaceName: string;
}): Promise<{ ok: boolean; message?: string }>;
```

### Helper Decomposition

Add focused helpers for:

- resolving the source workspace/task context
- validating the selected message is a user prompt
- slicing canonical task history to the anchored turn
- checking source workspace cleanliness
- cloning task/messages into a target workspace snapshot

### Persistence Behavior

The fork should persist a new workspace snapshot immediately after creation with:

- one forked task
- sliced message history
- empty provider sessions
- fresh checkpoint for the new workspace/task

## UI Plan

### Entry Point

Add `Fork from here` to user-message row actions in the chat timeline.

Eligibility:

- user message only
- no active turn on the source task
- workspace is not archived/missing

### Dialog

Prompt for:

- workspace name / branch name
- short explanation of what will be copied
- warning if workspace is dirty or if fork is blocked

## Files Likely Affected In Implementation

- `src/components/session/...` message row action UI
- `src/store/app.store.ts`
- `src/store/workspace-session-state.ts`
- `src/store/project.utils.ts`
- `src/types/chat.ts`
- `electron/persistence/sqlite-store.ts`
- `tests/workspace-integrity-regression.test.ts`
- `tests/bridge-persistence-regression.test.ts`
- message replay / provider session tests around task duplication and resume

## Risks

### Product Risks

- users may assume dirty filesystem state is copied when it is not
- `Continue` and `Fork` may be confused if both appear near PR/workspace actions

### Technical Risks

- accidental reuse of provider native session ids
- wrong workspace ownership after fork persistence
- copying incomplete turn history when assistant/tool streaming is still in progress

## Rollout Phases

1. Message-slice helper + fork metadata model
2. Store action + persistence path
3. Chat UI action + dialog
4. Tests for workspace ownership, provider session reset, and replay integrity
5. Optional dirty-worktree follow-up

## Done Criteria

- user can fork from a user prompt into a new workspace
- original task/workspace remain unchanged
- forked task contains only history up to the anchored turn
- forked task starts with no native provider session id
- workspace ownership and persistence tests pass
- docs/tooltips clearly distinguish `Fork` from `Continue`
