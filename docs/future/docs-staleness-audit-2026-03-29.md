# Docs Staleness Audit (2026-03-29)

This note tracks documentation that was stale during the repo-map cache roadmap work and what should be updated before later phases land.

## Updated Now

### `README.md`

Updated to:

- add the future local-data roadmap section
- reflect optional LSP-backed TypeScript/JavaScript support alongside Python
- reflect in-memory Map cache approach (LMDB removed)

### `docs/README.md`

Updated to link:

- `future/local-data-roadmap-2026-03-29.md`
- `future/docs-staleness-audit-2026-03-29.md`

### `docs/features/language-intelligence.md`

Was stale because it still described project LSP support as effectively Python-only.

Updated to reflect current behavior:

- optional TypeScript/JavaScript LSP support
- optional Python LSP support
- TypeScript and Python command overrides in settings

## Updated With The Cache Simplification Phase

### `docs/architecture/repo-map-spec.md`

Updated to reflect that repo-map context caching now uses:

- in-memory `Map` cache in the renderer (one entry per workspace)
- async pre-warming via `getRepoMap` IPC on workspace load
- synchronous `Map.get` read on first AI turn (no IPC, no blocking)

The previous LMDB-backed multi-tier cache (`L1 memory -> L2 LMDB -> L3 filesystem`) was reverted due to over-engineering for the data volume involved (~2-4 KB per workspace).

### `docs/future/repo-map-multilayer-cache-design-2026-03-29.md`

Deleted. The LMDB multilayer cache design was implemented and subsequently reverted. The rationale is documented in `docs/future/local-data-roadmap-2026-03-29.md`.

### `docs/future/agent-exploration-harness-plan-2026-03-29.md`

Updated to describe the current first-turn path as:

- TopBar pre-warming through the in-memory cache
- synchronous best-effort first-turn lookup via `Map.get`

## Watchlist For Future Phases

These docs are not stale right now, but they should be revisited when the next implementation phase lands.

### `docs/developer/diagnostics.md`

Update when Stave exposes cache source, freshness, or repo-map health information in developer-facing UI. (Note: a cache diagnostics card was added to Settings > Developer.)

### `docs/features/session-replay.md`

Update only if repo-map cache metadata, retrieval traces, or analytics surfaces become visible in Session Replay.

### `README.md`

Update again when:

- DuckDB is introduced for local analytics
- LanceDB is introduced for semantic retrieval
- extra native dependency caveats or packaging notes become necessary

### `docs/architecture/repo-map-spec.md`

Update again when:

- cache source/freshness metadata is surfaced beyond the developer settings card
- semantic retrieval is connected to repo-map exploration
- quick-open or diagnostics start consuming repo-map outputs directly

## Current Assessment

The most clearly stale document was `docs/features/language-intelligence.md`.

The repo-map documentation was updated to reflect the simplified in-memory cache approach after the LMDB implementation was reverted.
