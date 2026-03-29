# Docs Staleness Audit (2026-03-29)

This note tracks documentation that was stale during the repo-map cache roadmap work and what should be updated before later phases land.

## Updated Now

### `README.md`

Updated to:

- add the future local-data roadmap section
- reflect optional LSP-backed TypeScript/JavaScript support alongside Python
- include LMDB in the current stack summary

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

## Updated With The LMDB Phase

### `docs/architecture/repo-map-spec.md`

Updated to reflect that repo-map context caching now uses:

- main-process memory LRU
- LMDB persistent cache
- filesystem artifacts as the generated fallback layer

### `docs/future/agent-exploration-harness-plan-2026-03-29.md`

Updated to describe the current first-turn path as:

- TopBar pre-warming through the main-process cache layer
- synchronous best-effort first-turn lookup from renderer to main process

### `docs/future/repo-map-multilayer-cache-design-2026-03-29.md`

Updated to mark the LMDB cache-manager phase as implemented and to remove references to the old renderer-only cache shape.

## Watchlist For Future Phases

These docs are not stale right now, but they should be revisited when the next implementation phase lands.

### `docs/developer/diagnostics.md`

Update when Stave exposes cache source, freshness, or repo-map health information in developer-facing UI.

### `docs/features/session-replay.md`

Update only if repo-map cache metadata, retrieval traces, or analytics surfaces become visible in Session Replay.

### `README.md`

Update again when:

- DuckDB is introduced for local analytics
- LanceDB is introduced for semantic retrieval
- extra native dependency caveats or packaging notes become necessary

### `docs/architecture/repo-map-spec.md`

Update again when:

- cache source/freshness metadata is surfaced
- semantic retrieval is connected to repo-map exploration
- quick-open or diagnostics start consuming repo-map outputs directly

## Current Assessment

The most clearly stale document was `docs/features/language-intelligence.md`.

The repo-map documentation set was mostly directionally correct, but needed wording changes once the implementation moved from a renderer-local cache toward a main-process LMDB-backed cache path.
