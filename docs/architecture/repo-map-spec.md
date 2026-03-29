# Repo Map Spec

This document defines the next search layer above `projectFiles`.

## Goal

Provide a compact, generated map that helps Claude, Codex, and Stave answer:

- what are the main entrypoints?
- which files are high fan-out or high centrality?
- where does a request cross renderer, preload, IPC, and runtime boundaries?
- which docs or tests should be read before broad scanning?

## Output Files

- primary machine-readable artifact:
  - preferred cache path: `<git-dir>/stave-cache/repo-map.json`
  - fallback when no git metadata is available: `.stave/cache/repo-map.json`
- human-readable artifact:
  - preferred cache path: `<git-dir>/stave-cache/repo-map.md`
  - fallback when no git metadata is available: `.stave/cache/repo-map.md`

These files should be generated, not hand-edited.

## User Configuration

Place `.stave/repo-map.config.json` at the workspace root to customise the map.
All sections are optional — omitting them enables convention-based fallback.

```json
{
  "version": 1,
  "docs": [
    { "path": "docs/architecture/index.md", "role": "architecture map" }
  ],
  "hotspots": [
    { "path": "src/store/root.ts", "reason": "central state", "score": 120 },
    { "path": "src/api/", "reason": "api surface", "score": 60, "pathPrefix": true }
  ],
  "entrypoints": [
    {
      "id": "auth-flow",
      "title": "Auth Flow",
      "summary": "Trace authentication from entry to token.",
      "filePaths": ["src/auth/index.ts", "src/auth/middleware.ts"]
    }
  ]
}
```

When a section is omitted:
- `docs` → discovers README.md, AGENTS.md, CLAUDE.md, docs/**/*.md, .claude/**/*.md
- `hotspots` → ranks by import-graph score only (no project-specific bonuses)
- `entrypoints` → reads `package.json` main/exports; falls back to common patterns
  (src/index.ts, app/page.tsx, server.ts, electron/main/index.ts, etc.)

Stave's own project config lives in `.stave/repo-map.config.json` in the Stave repo.

## Current Implementation

Phase 2 is shipped with:

- user config at `.stave/repo-map.config.json` (optional, project-specific)
- convention-based fallback when no config is present
- parallel file I/O (32-concurrency) for both stat and read phases
- incremental analysis cache (`repo-map-analysis.json`) — only re-reads changed files
- file analysis cap (5,000 most recently modified + all config hotspot files)
- `pathPrefix: true` hotspot config for directory-level bonuses
- single-source `REPO_MAP_MAX_AGE_MS` freshness window
- main-process repo-map context cache with `L1 memory LRU -> L2 LMDB -> L3 filesystem artifacts`
- TopBar pre-warming of the active workspace repo-map context through the main-process cache
- first-turn retrieved-context injection from the warmed main-process cache via synchronous best-effort lookup
- Codex session-start hook awareness of the latest repo-map cache

This phase does not yet add repo-map results to quick-open or Session Replay UI.

## Data Model

### Metadata

- `generatedAt`
- `repoRoot`
- `branch`
- `commit`
- `toolVersion`

### Structural Index

- `roots`
  - top-level directories with short role labels
- `files`
  - path
  - language
  - role
  - importCount
  - importedByCount
  - symbolCount
  - testCoverageHints
- `symbols`
  - filePath
  - kind
  - name
  - exported
  - line
- `edges`
  - `imports`
  - `ipc_contract`
  - `event_emitter`
  - `event_consumer`
  - `doc_reference`

### Guidance Views

- `entrypoints`
  - task label
  - first files
  - follow-up files
- `hotspots`
  - files with high fan-out or cross-boundary importance
- `contracts`
  - named contract groups and the files they require
- `docs`
  - architecture docs with role labels
- `commands`
  - build, test, and diagnostics commands

## Collection Strategy

1. Start with the filesystem index and top-level docs
2. Parse TypeScript and JavaScript imports
3. Extract exported symbols and selected non-exported anchors from hotspot files
4. Add repo-specific heuristics for:
   - Electron main and preload boundaries
   - `window.api` consumers
   - provider event emitters and replay consumers
   - Zustand store hotspots
5. Emit a compact map and a short markdown summary

## Ranking Heuristics

Prefer files that are:

- named in `AGENTS.md` or architecture docs
- imported by many files
- crossed by renderer -> preload -> IPC -> provider flows
- used by multiple features or tests
- large coordination surfaces such as `app.store.ts`

## Refresh Triggers

- branch switch
- workspace switch
- `package.json`, `tsconfig.json`, or `components.json` changes
- changes under `docs/architecture/`
- changes to provider or IPC contract files

## Non-Goals

- full AST persistence for every file
- perfect call graph accuracy
- language-server parity on day one
- replacing targeted `rg` or local file reads

## Current Scope

Today the generated map includes:

- hotspot files
- import graph signals for TS/JS
- entrypoint bundles
- docs index

Planned next additions:

- top-level roots
- contract groups
- symbol summaries
