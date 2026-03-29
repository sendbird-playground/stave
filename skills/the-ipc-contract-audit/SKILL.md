---
name: the-ipc-contract-audit
description: Audit Stave multi-file contracts before or during changes. Use when a task touches provider runtime options, IPC payloads, window.api, schemas, NormalizedProviderEvent, replay payloads, or asks for a contract/sync checklist. Trigger on phrases like "ipc", "schema", "runtimeOptions", "window.api", "provider event", "계약", "스키마", "동기화 체크".
compatible-tools: [claude, codex]
category: safety
---

# The IPC Contract Audit

Treat schema changes as end-to-end changes.

## Required Checks

When the task changes a provider or IPC payload, inspect:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `electron/preload.ts`
- `src/types/window-api.d.ts`
- `electron/main/ipc/schemas.ts`
- producer and consumer call sites

## Event Sync Checks

When adding or renaming a normalized event:

- update the TypeScript union
- update the Zod schema
- update provider emitters
- update replay handlers
- update diagnostics if the event is user-visible

## Verification

- run `bun run typecheck` after contract changes
- if provider runtime behavior changed, smoke-check both Claude and Codex paths

## Output

Return:

- the contract group you audited
- files confirmed
- files still at risk
- verification still required
