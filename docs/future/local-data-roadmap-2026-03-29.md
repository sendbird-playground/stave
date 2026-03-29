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

### LMDB

Use LMDB as the hot local cache layer:

- repo-map snapshots
- formatted first-turn context text
- workspace/worktree cache pointers
- other read-heavy local caches where lookup latency matters more than relational querying

LMDB is the right sidecar for fast reuse across many projects, many worktrees, and many task windows.

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
- LMDB is strong for hot local key-value cache reuse.
- LanceDB is strong for embedding-backed retrieval.
- DuckDB is strong for analytics and aggregate queries.

Trying to force one engine to do all four jobs would make the codebase and runtime behavior worse.

## Rollout Order

### Phase 1

- keep SQLite as-is
- add LMDB-backed repo-map/context cache
- remove renderer-only single-workspace cache assumptions

### Phase 2

- expose cache freshness/source metadata for debugging
- decide whether repo-map context should be persisted deeper into task/session surfaces

### Phase 3

- add LanceDB only if semantic retrieval becomes a real product need
- keep this isolated from the repo-map hot-cache path

### Phase 4

- add DuckDB only when Stave ships local analytics, audit-log exploration, or heavier statistics
- keep DuckDB as an analytical sidecar, not as the primary application store

## Guardrails

- Do not move durable workspace/task/message state out of SQLite.
- Do not put repo-map hot-cache traffic into DuckDB.
- Do not add LanceDB before there is a concrete retrieval feature that needs embeddings.
- Do not treat DuckDB as a general-purpose replacement for either SQLite or LMDB.
