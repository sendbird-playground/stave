---
name: the-explore-codebase
description: Explore an unfamiliar area of the Stave codebase quickly. Use when the request asks for workspace structure, architecture overview, relevant files, entrypoints, "where should I look first", "관련 코드 확인", "구조 파악", or broad code search before implementation.
compatible-tools: [claude, codex]
category: navigation
---

# The Explore Codebase

Start narrow, not broad.

## Workflow

1. Read `AGENTS.md` and the architecture docs before loading large implementation files.
2. Use `docs/architecture/index.md` to choose the right subsystem.
3. Use `docs/architecture/entrypoints.md` to identify the first files to inspect.
4. Use targeted `rg` searches to confirm the actual producer, bridge, and consumer files.
5. Read only the slices that answer the current question.

## Stave Hotspots

- `src/store/app.store.ts` is a coordinator, not a good first file for broad scanning.
- `electron/main/ipc/schemas.ts` is the first stop for schema-ish regressions.
- `electron/providers/claude-sdk-runtime.ts` and `electron/providers/codex-sdk-runtime.ts` should be checked together when behavior is provider-adapter-specific.
- `src/lib/session/provider-event-replay.ts` is where normalized events become shared chat state.

## Output

Return:

- the subsystem you inspected
- the first files to read
- the key contract boundaries
- the smallest next search queries or follow-up files

## Avoid

- loading entire large files when a narrower slice is enough
- treating `projectFiles` as a semantic code index
- explaining the whole repo when the user asked about one path or feature
