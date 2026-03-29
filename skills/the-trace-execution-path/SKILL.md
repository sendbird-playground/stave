---
name: the-trace-execution-path
description: Trace a behavior, event, or request path through the Stave codebase. Use when the request asks "where does this happen", "execution path", "call flow", "흐름 추적", "어디서 처리돼", or needs the exact producer -> bridge -> consumer chain.
compatible-tools: [claude, codex]
category: navigation
---

# The Trace Execution Path

Trace forward and backward across boundaries.

## Workflow

1. Identify the user-facing trigger or event name.
2. Find the producer.
3. Cross the nearest contract boundary:
   - renderer -> preload
   - preload -> main IPC
   - IPC -> provider runtime
   - provider event -> replay -> UI
4. Confirm the consumer and any replay or persistence path.
5. Check tests that mention the same type, event, or function.

## Stave-Specific Guidance

- For provider-turn questions, start with `docs/architecture/conversation-flow.md`.
- For renderer-to-main flow, inspect `src/types/window-api.d.ts`, `electron/preload.ts`, and `electron/main/ipc/`.
- For provider output rendering, inspect `src/lib/session/provider-event-replay.ts` and the chat panel components.

## Output

Return:

- entrypoint
- forward path
- reverse path
- contract files
- likely breakpoints or tests

## Avoid

- describing only one side of a boundary
- stopping before checking the matching schema or replay consumer
