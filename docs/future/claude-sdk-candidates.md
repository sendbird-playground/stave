# Claude SDK Future Candidates

Track Claude SDK features that are worth integrating later, but are not part of the current shipped runtime surface.

Last reviewed: 2026-03-16 — SDK 0.2.76, CLI 2.1.72

## Current status

- `agentProgressSummaries` is implemented in Stave and documented in [Provider runtimes](../providers/provider-runtimes.md).
- The remaining candidates below stay in backlog until their UI and data-model work is justified.

---

## `forkSession` / `getSessionInfo` / `tagSession`

Added in SDK 0.2.75–0.2.76.

SDK surface:

- `forkSession(sessionId, { upToMessageId?, title? })` — branch a session into a new transcript with fresh UUIDs
- `getSessionInfo(sessionId, { dir? })` — read metadata for a single session without scanning all sessions
- `tagSession(sessionId, tag | null, { dir? })` — apply or clear a user-set tag on a session
- `listSessions` now supports `limit` and `offset` for pagination
- `SDKSessionInfo` gained optional `tag`, `createdAt` fields; `fileSize` is now optional

Why it is deferred:

- Stave manages its own session persistence in SQLite. Adopting these would require bridging SDK-level JSONL session storage with Stave's DB model.
- `forkSession` (conversation branching) is a compelling UX feature but needs design work for branch navigation and branch-aware replay.

Likely implementation shape:

- expose branching via a "fork from here" action in Session Replay, backed by `forkSession` + a local DB record
- use `tagSession` for user-facing session labels (starred, categorized)
- `getSessionInfo` is useful for quick metadata lookups in session list without full scan

## `PostCompact` hook

Added in SDK 0.2.75 / CLI 2.1.72.

SDK surface:

- `PostCompactHookInput` — fires after conversation compaction with `trigger` (`manual` | `auto`) and `compact_summary` (the AI-generated summary)
- `SDKCompactBoundaryMessage` gained `preserved_segment` with `head_uuid`, `anchor_uuid`, `tail_uuid` for partial compaction relink

Why it is deferred:

- Stave does not yet surface compaction events in the UI. The summary could be shown as a system message or used for session-level search indexing.
- Partial compaction relink info is useful for accurate replay but requires changes to how the replay drawer resolves message chains.

Likely implementation shape:

- subscribe to `PostCompact` in the Claude runtime, emit a system turn event with the summary
- index `compact_summary` for session search
- use `preserved_segment` to improve replay fidelity after mid-conversation compaction

## MCP elicitation support

Added in CLI 2.1.72.

SDK surface:

- `ElicitationHookInput` / `ElicitationResultHookInput` — hooks for MCP servers requesting structured user input
- `ElicitationHookSpecificOutput` — programmatically accept/decline elicitation
- `ElicitationResultHookSpecificOutput` — override user response before sending to MCP server
- `SDKElicitationCompleteMessage` — emitted when URL-mode elicitation is confirmed complete
- `SDKControlElicitationRequest` control message

Why it is deferred:

- Stave now has a shared task-chat `user_input` surface that can render schema-driven MCP elicitation prompts, but the Claude SDK runtime is not yet wired to Claude's elicitation control messages.
- URL-mode elicitation still requires a stronger Claude-specific browser handoff / completion flow design.

Likely implementation shape:

- render elicitation requests as a modal dialog with schema-driven form fields
- route `ElicitationResult` back to the provider runtime
- for URL-mode, open a secure webview or external browser with callback handling

## `cancel_async_message` control

Added in SDK 0.2.76.

SDK surface:

- `SDKControlCancelAsyncMessageRequest` — drop a pending async user message from the command queue by UUID

Why it is deferred:

- Stave's current message queue is synchronous. Relevant if/when async message queuing is added.

## Worktree `sparsePaths`

Added in CLI 2.1.72.

SDK surface:

- `worktree.sparsePaths` setting — directories to include via `git sparse-checkout` (cone mode) when creating worktrees

Why it is deferred:

- Stave does not yet manage worktrees directly. Relevant when worktree-based parallel agent execution is added.

## `askUserQuestion.previewFormat`

SDK surface:

- `toolConfig.askUserQuestion.previewFormat`
- expected values: `markdown` or `html`

Why it is deferred:

- Stave currently renders `AskUserQuestion` as structured text choices.
- Supporting preview formats cleanly would require a dedicated preview surface, sanitization rules for HTML, and a clearer contract for what is shown before the user answers.

Likely implementation shape:

- extend the Claude runtime to pass provider-level tool config
- add a safe markdown/HTML preview renderer to the existing user-input card
- document allowed tags and escaping behavior before enabling HTML mode

## Claude `agent_id` / `agent_type`

SDK surface:

- hook metadata on subagent-related events
- `SubagentStart` / `SubagentStop` inputs include both `agent_id` and `agent_type`
- `BaseHookInput` now includes optional `agent_id` and `agent_type` on all hooks

Why it is deferred:

- Stave already renders subagent activity from tool usage and tool results, but it does not yet persist or visualize hook-level agent provenance.
- Exposing these fields well likely needs richer replay grouping, not just raw labels in chat.

Likely implementation shape:

- capture hook metadata in the Claude runtime and persist it into turn events
- attach stable subagent identities to Session Replay rows
- use `agent_type` for user-facing labels and `agent_id` for correlation/debug views

## Other minor additions (0.2.75–0.2.76)

Tracked for awareness, not individually actionable yet:

- `feedbackSurveyRate` setting — enterprise session quality survey probability
- `language` setting now covers voice dictation in addition to responses
- `sessionRetentionDays: 0` disables persistence entirely (deletes transcripts at startup)
- SSH `startDirectory` — default working directory for remote hosts
- Plugin manifest `options` — non-sensitive plugin config values in settings
