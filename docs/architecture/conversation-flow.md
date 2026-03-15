# Conversation Flow

Stave keeps a single task chat UI by separating app-owned conversation state from provider-owned wire formats.

## High-level flow

1. The renderer builds a `CanonicalConversationRequest` from the task history, current user input, selected file contexts, and any persisted provider-native conversation id. Oversized historical payloads such as `file_context` content, tool outputs, and diff bodies are sanitized before the request crosses IPC so broken replay data does not block later turns.
2. The provider bridge sends that canonical request plus a small fallback prompt across preload or HTTP into the active runtime.
3. Provider-specific translators rebuild the exact Claude or Codex prompt from the canonical request inside the runtime.
4. Claude and Codex both stream back normalized `BridgeEvent` records such as `text`, `thinking`, `tool`, `approval`, `user_input`, `diff`, and `done`.
5. The renderer replays those normalized events into one shared message model and one shared chat surface.

This keeps the task thread as Stave's source of truth while still letting each provider preserve its own native conversation id when available.

## Persistence

Every persisted turn stores:

- provider id
- turn event timeline
- provider-native conversation ids
- a `request_snapshot` payload containing the canonical request used to start that turn

That data is what powers replay, request inspection, and recent-turn summaries.
