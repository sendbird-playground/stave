# Local Data Roadmap (2026-03-29)

This document defines the intended split between Stave's local storage layers so future features do not overload a single database with incompatible jobs.

## Target Split

### SQLite

Keep SQLite as the durable application state store:

- workspaces
- tasks
- messages
- turns
- other relational app records that need straightforward persistence and debugging

SQLite remains the source of truth for Stave state.

### In-Memory Map Caches

Use plain `Map` caches in the renderer process for small, read-heavy data:

- repo-map context text (~2-4 KB per workspace)
- formatted first-turn injection content
- other lightweight caches that are cheap to regenerate on app restart

These caches are pre-warmed asynchronously on workspace load and read synchronously (`Map.get`) during message composition. No persistence is needed — the data is small enough to regenerate in milliseconds.

> **Note:** An LMDB-backed multi-tier cache was previously implemented and reverted. The overhead of a native addon, `sendSync` IPC blocking the renderer, git shell-outs for cache keys, and 298 lines of infrastructure was not justified for caching a 2-4 KB string per workspace.

### LanceDB

Reserve LanceDB for semantic retrieval only:

- code/document embeddings
- semantic chunk lookup
- hybrid search when keyword and structural search are not enough

Do not introduce LanceDB until Stave actually needs embedding-backed retrieval.

### DuckDB

Reserve DuckDB for local analytics and audit-style workloads:

- audit-log analysis
- usage statistics
- aggregate reporting across sessions, tasks, or providers
- heavier read-mostly queries that benefit from OLAP-style execution

DuckDB is not a cache replacement. It is the likely future engine for analytical views and offline statistics.

## Why Separate Them

- SQLite is strong for durable relational state.
- In-memory caches are appropriate for small, regenerable, read-heavy data.
- LanceDB is strong for embedding-backed retrieval.
- DuckDB is strong for analytics and aggregate queries.

Trying to force one engine to do all jobs — or over-engineering a cache for small data — would make the codebase and runtime behavior worse.

## Rollout Order

### Phase 1

- keep SQLite as-is
- use in-memory `Map` caches for repo-map context (implemented)
- pre-warm caches asynchronously on workspace load
- add cache diagnostics viewer in Settings > Developer

### Phase 2

- expose cache freshness/source metadata for debugging
- decide whether repo-map context should be persisted deeper into task/session surfaces
- if persistence across app restarts becomes necessary, use a simple JSON file per workspace (not a database)

### Phase 3

- add LanceDB only if semantic retrieval becomes a real product need
- keep this isolated from the repo-map cache path

### Phase 4

- add DuckDB only when Stave ships local analytics, audit-log exploration, or heavier statistics
- keep DuckDB as an analytical sidecar, not as the primary application store

## Guardrails

- Do not move durable workspace/task/message state out of SQLite.
- Do not over-engineer caches for small data volumes (< 1 MB total across all workspaces).
- Do not add LanceDB before there is a concrete retrieval feature that needs embeddings.
- Do not treat DuckDB as a general-purpose replacement for SQLite.
