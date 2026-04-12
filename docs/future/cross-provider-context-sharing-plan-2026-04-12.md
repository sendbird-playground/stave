# Cross-Provider Context Sharing Plan

## Objective

Define a Stave-native way for Claude and Codex to:

- continue the same task without losing important context
- inherit each other's work cleanly when the active provider changes
- optionally collaborate inside one task without depending on vendor-specific session sharing

The goal is not to splice Claude and Codex native sessions together.
The goal is to make cross-provider continuation deterministic, explainable, and provider-agnostic.

## Recommendation

Implement cross-provider context sharing as a Stave-owned memory and handoff layer:

1. Keep native Claude and Codex session ids provider-local.
2. Add a shared task memory / blackboard owned by Stave.
3. Generate a structured handoff packet after each completed turn.
4. When the provider changes, seed the next turn from Stave memory + handoff instead of replaying raw transcript only.
5. Expose the shared memory through Stave Local MCP so both providers can read and write the same state during a task.
6. Add optional assistant-to-assistant collaboration later, but make it ride on the same shared memory instead of raw transcript relay.

This should be framed as a common Stave capability, not as a Claude feature or a Codex feature.

## Why This Shape Fits Stave

- Stave already keeps the task thread as the app-owned source of truth.
- Stave already stores provider-native session ids separately per task and provider.
- Stave already builds a canonical request from task history plus retrieved context before each turn.
- Stave already injects Stave-owned context such as current task awareness and referenced task replies.
- Stave Auto orchestration already proves the product can run multiple providers in one task, but current subtask coordination is still mostly prompt substitution.

Relevant current files:

- `src/store/app.store.ts`
- `src/lib/providers/canonical-request.ts`
- `src/lib/providers/provider-request-translators.ts`
- `src/lib/task-context/current-task-awareness.ts`
- `src/lib/task-context/referenced-task-context.ts`
- `src/lib/db/workspaces.db.ts`
- `electron/providers/stave-orchestrator.ts`

## Current Limitation

Today Stave preserves provider-native state only inside the same provider path.

Current behavior:

- a task persists separate native session ids for `claude-code` and `codex`
- the next turn resumes only the active provider's own session id
- provider switches rely on rebuilt prompt context, not on a shared provider-neutral task memory
- Stave Auto orchestration passes subtask outputs through prompt interpolation such as `{st-1}`

Why this is not enough:

- provider switches lose latent state that was never written into the visible transcript
- long transcripts become an expensive and noisy substitute for real handoff
- the receiving provider gets too much raw chat and too little structured state
- "let Claude and Codex talk" degrades into transcript relay rather than shared work on the same task state

## Product Positioning

### User-Facing Meaning

Cross-provider sharing should mean:

- "switch providers without losing the important state of the task"
- "let the next provider inherit the current working understanding"
- "optionally let two providers collaborate on one task with a shared blackboard"

### What It Is Not

- not a native Claude session inside Codex
- not a native Codex thread inside Claude
- not a promise that hidden internal chain-of-thought transfers across vendors
- not raw transcript mirroring as the primary mechanism

## External Direction

Recent official platform direction points the same way:

- OpenAI Responses now supports durable conversation state through Conversations and `previous_response_id`, but that state is still OpenAI-owned and OpenAI-specific.
- OpenAI also added compaction for long-running response state and remote MCP support for external tools and context.
- Anthropic keeps Claude Code memory through `CLAUDE.md` / project memory and supports remote MCP connectors, but that memory is Claude-owned rather than cross-vendor.
- MCP has continued to standardize provider-external context and tools. The latest spec published at `modelcontextprotocol.io` is dated `2025-11-25`.
- A2A was introduced publicly on `2025-04-09` as an inter-agent protocol designed specifically to let different agents collaborate without sharing internal memory or tool internals directly.

Conclusion:

- vendor-native session continuation is useful inside one provider
- cross-provider continuation needs a provider-neutral state layer
- MCP is the most practical near-term substrate for Stave
- A2A is a useful model for future inter-agent messaging, but Stave does not need full A2A adoption to get the main benefit

## Proposed Architecture

### 1. Shared Task Memory

Add a Stave-owned structured memory object per task.

Suggested sections:

- `objective`
- `constraints`
- `facts`
- `decisions`
- `openQuestions`
- `artifacts`
- `nextAction`
- `providerNotes`
- `confidence`
- `updatedAt`
- `sourceTurnIds`

This is not a full transcript.
It is the durable shared understanding of the task.

### 2. Structured Handoff Packet

After each completed provider turn, derive a bounded handoff packet.

Suggested shape:

```ts
type TaskHandoffPacket = {
  taskId: string;
  fromProvider: "claude-code" | "codex" | "stave";
  turnId: string;
  generatedAt: string;
  requestSummary: string;
  workSummary: string;
  factsDelta: string[];
  decisionsDelta: string[];
  openQuestionsDelta: string[];
  artifactsDelta: Array<{
    kind: "file" | "commit" | "plan" | "note" | "url";
    label: string;
    value: string;
  }>;
  nextRecommendedAction: string;
  confidence: "low" | "medium" | "high";
};
```

Design rules:

- small enough to inject every turn
- generated from visible work product, not hidden reasoning
- append-only by turn, with periodic compaction into task memory

### 3. Provider Switch Flow

When the active provider changes inside the same task:

1. Do not reuse the previous provider's native session id.
2. Resume the newly selected provider only from its own native session id if one already exists.
3. Always inject:
   - current task awareness
   - shared task memory snapshot
   - latest handoff packet
   - optional referenced task context
4. Prefer compact structured context over replaying the whole transcript.

This yields deterministic inheritance even when the destination provider has never seen the task before.

### 4. Stave Local MCP As The Shared Surface

Expose the shared memory through Stave Local MCP.

Suggested new tools or resources:

- `stave_get_task_memory`
- `stave_replace_task_memory`
- `stave_append_task_memory_note`
- `stave_get_latest_handoff`
- `stave_append_handoff`
- `stave_list_task_artifacts`

Why MCP is the right first substrate:

- both Claude and Codex already integrate with MCP
- Stave already has a local MCP story
- task memory becomes inspectable and editable by both providers through one contract
- the shared layer stays Stave-owned instead of being hidden inside one provider adapter

### 5. Optional Assistant-to-Assistant Collaboration

Once shared memory exists, Stave can support controlled collaboration modes:

- `Claude asks Codex to implement`
- `Codex asks Claude to review`
- `Claude and Codex alternate inside one task`

Important rule:

- the collaboration surface should write results into shared memory or handoff packets
- it should not depend on replaying every intermediate assistant utterance into the next provider

This keeps the system explainable and bounded.

## Data Model

### New State

Add task-scoped shared state such as:

- `taskMemoryByTask`
- `taskHandoffByTask`
- optional `taskArtifactIndexByTask`

Persistence targets:

- workspace snapshot for fast restore
- turn persistence for auditability
- optional SQLite tables if the payload grows beyond snapshot-friendly size

### Existing State To Reuse

- `messagesByTask`
- `providerSessionByTask`
- `workspaceInformation`
- `request_snapshot` turn persistence

## Request Construction Changes

Current request building already injects Stave-owned retrieved context before sending a provider turn.

Add two more retrieved-context blocks:

1. `stave:task-memory`
2. `stave:latest-handoff`

These should be bounded and provider-neutral.

They belong alongside:

- `stave:current-task-awareness`
- `stave:referenced-task-replies`
- optional `stave:repo-map`

## Summarization / Compaction Strategy

Do not wait for a provider switch to generate handoff.

Generate handoff:

- at normal turn completion
- before provider change
- before task duplication / fork / export
- before transcript compaction if the task becomes large

Compaction policy:

- raw transcript remains the audit log
- task memory becomes the durable semantic state
- handoff packets become the recent delta layer between the two

## UI Plan

### MVP

- show a task-level `Shared memory` section in the Information panel
- show the latest provider handoff summary in the same panel
- when switching provider, show a small note like `Using shared task memory + latest handoff`

### Later

- explicit `Ask Claude to review this` and `Ask Codex to continue this` actions
- timeline markers for provider handoff boundaries
- inspectable diff between previous and current task memory snapshot

## Rollout Phases

1. Shared task memory schema and persistence
2. Automatic handoff packet generation on turn completion
3. Inject shared memory + handoff into provider request construction
4. Expose shared memory via Stave Local MCP
5. Add provider-switch UX affordances
6. Add optional assistant-to-assistant collaboration mode

## Risks

### Product Risks

- users may expect perfect transfer of all hidden model state
- extra memory surfaces can become confusing if transcript, task memory, and notes diverge

### Technical Risks

- memory drift if task memory is updated inconsistently
- noisy handoff packets if they are generated from low-quality turns
- duplicated or conflicting state between workspace information notes and new task memory
- provider-specific assumptions leaking into the shared schema

## Non-Goals

- copying hidden vendor reasoning across providers
- sharing one provider's native session id with another provider
- implementing full A2A before Stave has its own stable shared memory model

## Open Questions

1. Should shared task memory live in workspace snapshots first, SQLite first, or both from day one?
2. Should handoff generation be rule-based first, provider-generated first, or hybrid?
3. How should Stave reconcile manual user edits to shared memory with auto-generated updates?
4. Should workspace Information panel notes eventually merge into task memory, or remain a separate workspace-scoped concept?
5. When Stave Auto runs cross-provider workers, should worker outputs update task memory incrementally or only at synthesis boundaries?

## Done Criteria

- switching between Claude and Codex within one task preserves shared task understanding without requiring full transcript replay
- provider-native session ids remain provider-local
- both providers can read and write the same Stave-owned task memory through one contract
- handoff state is inspectable, bounded, and persisted
- Stave Auto can pass work across providers through shared memory rather than prompt interpolation alone

## References

- OpenAI conversation state: <https://developers.openai.com/api/docs/guides/conversation-state>
- OpenAI MCP and connectors: <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>
- OpenAI responses compaction reference: <https://platform.openai.com/docs/api-reference/responses/compact>
- Anthropic Claude Code memory: <https://code.claude.com/docs/en/memory>
- Anthropic MCP connector: <https://platform.claude.com/docs/en/agents-and-tools/mcp-connector>
- Anthropic prompt caching: <https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching>
- MCP latest specification (`2025-11-25`): <https://modelcontextprotocol.io/specification/2025-11-25>
- A2A specification: <https://a2a-protocol.org/latest/specification/>
