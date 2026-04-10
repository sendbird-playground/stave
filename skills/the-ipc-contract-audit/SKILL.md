---
name: the-ipc-contract-audit
description: Audit Stave multi-file contracts before or during changes. Use when a task touches provider runtime options, IPC payloads, window.api, schemas, NormalizedProviderEvent, replay payloads, or asks for a contract or sync checklist. Trigger on phrases like "ipc", "schema", "runtimeOptions", "window.api", "provider event", "계약", "스키마", "동기화 체크".
compatible-tools: [claude, codex]
category: safety
---

# The IPC Contract Audit

Treat schema changes as end-to-end runtime changes, not local type edits.

## Required Chain

When the task changes a provider or IPC payload, inspect this full chain:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `src/types/window-api.d.ts`
- `electron/preload.ts`
- `electron/main/ipc/schemas.ts`
- producer call sites
- consumer call sites

Do not assume TypeScript is enough. `electron/main/ipc/schemas.ts` can still reject the runtime payload.

## Event Sync Checks

When adding, renaming, or reshaping a normalized event:

- update the TypeScript union
- update the Zod schema
- update provider emitters
- update replay handlers
- update diagnostics if the event is user-visible

## Common Failure Modes

1. New field added in TypeScript only
2. New event added without Zod support
3. Event renamed on the producer but not on replay or consumer paths

## Symmetry Rule

If the behavior is meant to be provider-agnostic, inspect both Claude and Codex adapters.

## Verification

- run `bun run typecheck` after contract changes
- if provider runtime behavior changed, smoke-check both Claude and Codex paths

## Output

Return:

- the contract group you audited
- files confirmed
- files still at risk
- verification still required
