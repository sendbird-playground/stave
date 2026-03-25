# Runtime Architecture

Stave supports two runtime paths.

## Electron desktop runtime

This is the primary app architecture:

- `src/` renders the React UI
- `electron/preload.ts` exposes the safe `window.api` bridge
- `electron/main.ts` handles IPC
- `electron/providers/*` owns Claude, Codex, and Stave routing SDK execution plus event mapping
- `electron/main/lsp/*` owns optional stdio language-server sessions for Monaco
- `electron/persistence/*` owns SQLite persistence

The renderer does not call provider SDKs directly. It sends provider turn requests across the preload bridge, and Electron executes the SDK work in the main process.

The same terminal bridge is also used for local workspace automation such as running an optional post-create bootstrap command when a new git worktree workspace is created.

## Browser dev runtime

When Stave runs as plain Vite in a browser, there is no Electron preload bridge, IPC, or main process. In that mode, `server/dev-server.ts` provides a local HTTP bridge for provider turns, terminal commands, and source-control actions.

That path is:

- `src/`
- `src/lib/dev-bridge.ts`
- `server/dev-server.ts`

## Packaging notes

`bun run dev:desktop` uses a development profile. Built desktop runs use the production profile. On the first run after the dev/prod split, Stave migrates the old shared `stave.sqlite` database into the development profile and lets the packaged app create a fresh production database.
