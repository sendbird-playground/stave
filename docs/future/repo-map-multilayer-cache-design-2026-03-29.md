# Repo Map Multilayer Cache Design (2026-03-29)

Decision: keep the current SQLite store for durable app state, add LMDB as the hot local cache layer, and reserve LanceDB for a future semantic/vector layer.

## Goal

Support a workflow that constantly switches across:

- multiple projects
- multiple git worktrees
- multiple task windows

while keeping first-turn orientation and repo-map reuse fast.

## Storage Split

### 1. SQLite

Use SQLite only for durable Stave application state:

- workspaces
- tasks
- messages
- turns

Do not move repo-map cache into SQLite.

Why:

- SQLite is already the right fit for relational durable app state
- repo-map access is primarily key-value cache access, not SQL-heavy querying

### 2. LMDB

Use LMDB for hot local cache:

- repo-map snapshot blobs
- formatted first-turn context text
- cache metadata
- stable-key to latest-snapshot lookup

Why:

- embedded
- file-backed
- excellent read-heavy local KV behavior
- good fit for "many workspace switches, many cache hits"

### 3. LanceDB

Reserve LanceDB for a future semantic layer only:

- embeddings for code/docs chunks
- semantic retrieval
- hybrid search if Stave later needs it

Why:

- this is a different concern from repo-map snapshot caching
- semantic retrieval should not distort the hot cache design

## Keep Filesystem Artifacts

Still write:

- `repo-map.json`
- `repo-map.md`
- `repo-map-analysis.json`

These are not the primary cache anymore. They remain useful for:

- debugging
- manual inspection
- crash recovery
- external tooling

## Recommended Runtime Layers

Inside the repo-map system itself, use:

1. `L1` main-process memory LRU
2. `L2` LMDB persistent cache
3. `L3` filesystem artifacts

This sits beside the existing SQLite store, not inside it.

## Why This Is Better Than SQLite-Only

For repo-map reuse, the hot path is:

- lookup by workspace/repo state
- retrieve a blob or formatted text
- return immediately

That is a key-value cache problem.

SQLite can do it, but it is not the best shape for it when:

- many workspaces are revisited frequently
- many tasks in the same workspace reuse the same context text
- low-latency local reads matter more than relational querying

## Current State

Today Stave already has:

- repo-map filesystem cache under `<git-dir>/stave-cache/` or `.stave/cache/`
- incremental analysis cache in `repo-map-analysis.json`
- main-process repo-map context cache backed by `L1 memory LRU -> L2 LMDB -> L3 filesystem artifacts`
- TopBar pre-warming through the cache manager
- synchronous best-effort first-turn cache reads from renderer to main process

Weak points:

- first-turn injection is still best-effort and depends on a prior warm path for the active workspace
- cache source/freshness is not surfaced in diagnostics yet
- semantic retrieval and analytics are intentionally out of scope for this layer

## Cache Keys

Use two keys.

### Stable Key

Groups related snapshots for the same worktree state family.

```text
stable_key = sha256(
  normalize(repo_root) +
  "|" +
  normalize(worktree_path) +
  "|" +
  (head_sha ?? "no-git") +
  "|" +
  config_hash +
  "|" +
  repo_map_version
)
```

### Exact Cache Key

Represents the exact state we are willing to serve directly.

```text
cache_key = sha256(
  stable_key +
  "|" +
  dirty_fingerprint
)
```

## Identity Components

### `repo_root`

Canonical git top-level path when available.

Fallback:

- normalized workspace root path

### `worktree_path`

Explicit worktree identity.

Keep this separate from `repo_root`.

Why:

- untracked files
- worktree-local dirtiness
- multiple active worktrees in the same repo are first-class user context

### `head_sha`

Prefer:

- `git rev-parse HEAD`

Fallback:

- `null` for non-git workspaces

### `config_hash`

Hash of:

- `.stave/repo-map.config.json`
- repo-map generator version

### `dirty_fingerprint`

Cheap current-state fingerprint.

Recommended inputs:

- `git status --porcelain --untracked-files=normal`
- normalized changed path list

Fallback for non-git repos:

- recent file mtime/size summary

## L1 Memory LRU

Owner:

- main process

Why not renderer:

- shared by all renderer surfaces and task windows
- avoids duplicated IPC/fetch logic
- keeps hot workspaces warm across UI switches

Suggested entry:

```ts
interface RepoMapMemoryEntry {
  cacheKey: string;
  stableKey: string;
  workspacePath: string;
  repoRoot: string;
  headSha: string | null;
  configHash: string;
  dirtyFingerprint: string;
  generatedAt: string;
  accessedAt: string;
  snapshot: RepoMapSnapshot;
  contextText: string;
}
```

Suggested policy:

- keep `8-16` hot workspaces
- evict least recently accessed
- keep access updates lazy if they become noisy

## L2 LMDB Layout

Use one LMDB environment with small named databases.

Recommended logical layout:

- `repoMapMeta`
- `repoMapSnapshot`
- `repoMapContext`
- `repoMapStableLatest`
- `repoMapAccess`

### `repoMapMeta`

Key:

- `cache_key`

Value:

```json
{
  "stableKey": "...",
  "repoRoot": "...",
  "worktreePath": "...",
  "headSha": "...",
  "configHash": "...",
  "dirtyFingerprint": "...",
  "repoMapVersion": 2,
  "generatedAt": "...",
  "lastAccessedAt": "...",
  "staleAfterMs": 300000,
  "fileCount": 1234,
  "codeFileCount": 812
}
```

### `repoMapSnapshot`

Key:

- `cache_key`

Value:

- serialized `RepoMapSnapshot`

### `repoMapContext`

Key:

- `cache_key`

Value:

- formatted first-turn context text

### `repoMapStableLatest`

Key:

- `stable_key`

Value:

- latest `cache_key`

Purpose:

- fast fallback from exact miss to nearest reusable snapshot

### `repoMapAccess`

Key:

- `workspace_path`

Value:

```json
{
  "cacheKey": "...",
  "lastAccessedAt": "..."
}
```

Purpose:

- quick lookup for hot workspaces
- cleanup heuristics

## Freshness Policy

### Exact Fresh Hit

Condition:

- `cache_key` exists
- `now - generatedAt <= staleAfterMs`

Action:

- serve immediately

### Exact Stale Hit

Condition:

- `cache_key` exists
- TTL expired

Action:

- for best-effort prewarm: serve immediately and queue background refresh
- for explicit refresh: regenerate

### Stable Fallback Hit

Condition:

- exact miss
- `stable_key` has a latest row

Action:

- use the stored snapshot/context as a fallback
- use it as the seed for incremental refresh

### Cold Miss

Condition:

- no exact row and no stable row

Action:

- generate from scratch

## Invalidation Rules

### Hard Invalidate

Require a new exact entry when:

- repo-map generator version changes
- `config_hash` changes
- `head_sha` changes
- `worktree_path` changes

### Soft Invalidate

Refresh in background or on demand when:

- TTL expires
- `dirty_fingerprint` changes
- user explicitly requests refresh

## API Shape

Move orchestration into the main process.

Recommended IPC:

```ts
repoMap.getContext({
  workspacePath: string,
  mode?: "best-effort" | "fresh" | "refresh"
}) => Promise<{
  ok: boolean;
  contextText?: string;
  snapshot?: RepoMapSnapshot;
  source?: "memory" | "lmdb" | "filesystem" | "generated";
  freshness?: "fresh" | "stale" | "fallback";
  generatedAt?: string;
  stderr?: string;
}>
```

Usage:

- TopBar prewarm: `best-effort`
- first-turn injection: `best-effort`
- future diagnostics: `fresh` or `best-effort`
- manual refresh: `refresh`

Keep existing filesystem snapshot IPC for direct inspection/debugging.

## First-Turn Flow

1. Workspace becomes active.
2. TopBar asks main process for repo-map context in `best-effort` mode.
3. Main process checks L1 memory.
4. If miss, checks LMDB exact key.
5. If miss, checks LMDB latest by `stable_key`.
6. Returns the best available context text immediately.
7. If stale or fallback, queues background refresh.
8. First task turn reads warmed context from the same main-process-backed cache path.

## Explicit Refresh Flow

1. Renderer asks for `mode: "refresh"`.
2. Main process bypasses TTL shortcuts.
3. Generator rebuilds with full stat validation.
4. Write filesystem artifacts.
5. Write LMDB metadata, snapshot, and context.
6. Update memory LRU.

## Cleanup Policy

LMDB does not need SQL-style row deletion logic, but stale entries still need pruning.

Recommended initial policy:

- keep latest `3` exact entries per `stable_key`
- keep latest `200-500` total entries
- prune oldest by `lastAccessedAt`

Run prune:

- after successful write
- or once on app startup

## Role of LanceDB

Do not use LanceDB in phase 1.

Introduce it only when Stave needs:

- semantic retrieval over code/doc chunks
- embedding-backed similarity search
- hybrid text + vector search

At that point:

- LMDB stays the hot cache for repo-map/context blobs
- LanceDB becomes the semantic retrieval sidecar
- SQLite remains the durable app-state store

## Rollout Plan

### Phase 1

- keep SQLite exactly as-is for app state
- add LMDB environment for repo-map cache only
- add main-process cache manager
- move TopBar prewarm onto the cache manager
- move first-turn context injection onto the cache manager
- status: implemented

### Phase 2

- add stable-key fallback and background refresh
- expose cache source/freshness metadata for diagnostics

### Phase 3

- add LanceDB only if semantic retrieval is actually needed
- optional UI surfacing of repo-map freshness or semantic hits

## Recommendation Summary

For Stave, the best split is:

- `SQLite`: durable app state
- `LMDB`: fast repo-map and context cache
- `LanceDB`: future semantic layer

And inside the repo-map cache path:

- `L1` memory LRU
- `L2` LMDB
- `L3` filesystem artifacts

That gives the right separation for many-project, many-worktree, many-task workflows without forcing repo-map caching into the wrong database model.
