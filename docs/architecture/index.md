# Architecture Map

This file is the fast entrypoint for codebase orientation.

## Read Order

1. `AGENTS.md` for repo policy, boundaries, and contract guardrails
2. `docs/architecture/runtime.md` for runtime topology
3. `docs/architecture/local-mcp-embedded-plan.md` for packaged-app automation architecture
4. `docs/architecture/conversation-flow.md` for turn lifecycle
5. `docs/providers/provider-runtimes.md` for provider-specific paths
6. `docs/architecture/entrypoints.md` for task-to-file routing
7. `docs/architecture/contracts.md` for multi-file contract checklists

## Top-Level Layout

- `src/` renderer, state, session UI, editor UI
- `electron/` main process, preload bridge, provider runtimes, persistence
- `electron/main/stave-*` packaged-app local automation / MCP surface
- `server/` browser-only dev bridge
- `docs/` stable product and architecture reference
- `skills/` repo-local reusable workflows
- `tests/` unit and e2e coverage

## Primary Hotspots

- `src/store/app.store.ts`
  - main renderer-side coordination point
  - read targeted slices instead of the whole file
- `electron/providers/claude-sdk-runtime.ts`
  - Claude turn execution, event normalization, subagent progress
- `electron/providers/codex-sdk-runtime.ts`
  - Codex turn execution, thread reuse, diff tracking
- `electron/main/ipc/schemas.ts`
  - strict IPC validation boundary
- `src/lib/session/provider-event-replay.ts`
  - normalized event replay into shared chat state
- `src/lib/pr-status.ts`
  - PR status enum, derivation, icon/color/action config
  - see [Workspace PR Status](../features/workspace-pr-status.md)

## High-Risk Boundaries

- Renderer must not import Node-only modules directly
- Provider option changes are never local-only; treat them as contract changes
- `NormalizedProviderEvent` and the matching Zod schema must stay in sync
- Quick orientation work should prefer docs and targeted entrypoints over broad file dumps

## Use This With

- `docs/architecture/entrypoints.md` when you need the first files to inspect
- `docs/architecture/contracts.md` when a change crosses renderer, preload, IPC, and provider runtime
- `docs/architecture/repo-map-spec.md` when implementing the next search/index layer
