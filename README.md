# Stave

Stave is an Electron-based AI coding workspace built with Bun, React, Vite, and TypeScript.

## What exists today

- Desktop-first runtime with Electron main/preload separation
- Task-oriented chat UI with Claude and Codex provider switching
- Workspace and branch-aware project navigation
- Monaco editor, docked terminal, and source-control actions
- SQLite-backed local persistence for workspaces, tasks, and messages
- Unified provider event pipeline for text, thinking, tools, approvals, user input, plans, and diffs
- Unit and Playwright E2E coverage

## Stack

- Bun
- TypeScript
- React 19 + Vite
- Electron + electron-vite
- Tailwind CSS v4
- Monaco Editor
- SQLite via `better-sqlite3`
- Playwright

## Prerequisites

- Bun
- Node.js
- A working `claude` CLI login if you want to use Claude in Stave
- A working `codex` CLI login if you want to use Codex in Stave

Typical auth commands:

```bash
claude auth login
codex login
```

## Install

```bash
bun install
```

## Development

```bash
# Web renderer only
bun run dev

# Browser renderer + local dev bridge server
bun run dev:all

# Electron desktop app
bun run dev:desktop

# Electron desktop app with polling file watching
bun run dev:desktop:poll
```

## Scripts

- `bun run typecheck`
- `bun run test`
- `bun run test:e2e`
- `bun run test:ci`
- `bun run build`
- `bun run build:desktop`
- `bun run package:desktop`

## Runtime shape

Stave supports two runtime paths.

### Electron desktop runtime

This is the primary app architecture:

- `src/` renders the React UI
- `electron/preload.ts` exposes the safe `window.api` bridge
- `electron/main.ts` handles IPC
- `electron/providers/*` owns Claude/Codex SDK execution and event mapping
- `electron/persistence/*` owns SQLite persistence

The renderer does not call provider SDKs directly. It sends provider turn requests over the preload bridge, and Electron runs the SDK work in the main process.

### Browser dev runtime

When you run plain Vite in a browser there is no Electron preload bridge, IPC, or main process. For that mode, `server/dev-server.ts` provides a local HTTP bridge for provider turns, terminal commands, and source-control actions.

That path is:

- `src/`
- `src/lib/dev-bridge.ts`
- `server/dev-server.ts`

## How Claude SDK works in Stave

Claude turns are handled in `electron/providers/claude-sdk-runtime.ts`.

High-level flow:

1. The renderer submits a turn through `window.api.provider.streamTurn(...)`.
2. `electron/main.ts` forwards that request into `electron/providers/runtime.ts`.
3. `streamClaudeWithSdk(...)` imports `@anthropic-ai/claude-agent-sdk` and runs the turn from Electron.
4. Claude SDK messages are converted into Stave `BridgeEvent` records.
5. The renderer consumes those normalized events and renders chat text, thinking, tools, approval prompts, user-input prompts, plans, and completion state.

Claude event mapping currently does this:

- assistant text -> `text`
- thinking / thinking delta -> `thinking`
- tool use -> `tool`
- `ExitPlanMode` tool payload -> `plan_ready`
- stream/runtime failures -> `error`

Claude-specific runtime controls come from the UI and runtime options:

- permission mode
- dangerous skip permissions
- sandbox enabled
- allow unsandboxed commands
- provider timeout
- debug stream logging

## How Codex SDK works in Stave

Codex turns are handled in `electron/providers/codex-sdk-runtime.ts`.

High-level flow:

1. The renderer submits a turn through the same provider bridge.
2. `streamCodexWithSdk(...)` imports `@openai/codex-sdk`.
3. Stave creates a `Codex` instance in Electron and starts or reuses a thread for the current task/runtime configuration.
4. `thread.runStreamed(...)` yields Codex `ThreadEvent` items.
5. Stave maps those items into the same `BridgeEvent` format used by Claude.
6. File changes are post-processed through `turn-diff-tracker.ts` so the UI can render diffs.

Codex event mapping currently includes:

- agent messages -> `text`
- reasoning -> `thinking`
- command execution -> `tool`
- MCP tool calls -> `tool`
- web search -> `tool`
- todo list -> `thinking`
- collaboration-mode `<proposed_plan>` payload -> `plan_ready`
- file changes -> diff events
- failures -> `error`

Codex-specific runtime controls come from the UI and runtime options:

- network access
- sandbox mode
- approval policy
- collaboration/plan mode
- reasoning effort
- binary path override
- provider timeout
- debug stream logging

Codex threads are keyed by task/cwd plus the active sandbox, network, approval, and plan-mode settings so Stave can preserve thread context without mixing incompatible runtime modes.

## How Stave finds the executable CLI path

Stave does not hardcode one binary path. It probes a small set of candidates and only accepts executable files.

### Codex CLI path resolution

Codex path resolution is shared through `electron/providers/executable-path.ts` and finalized in `electron/providers/codex-sdk-runtime.ts`.

Lookup order:

1. `runtimeOptions.codexPathOverride`
2. `STAVE_CODEX_CLI_PATH`
3. `STAVE_CODEX_CMD` resolved through `which`
4. default `codex` resolved through `which`
5. explicit probes of `~/.bun/bin/codex` and `~/.local/bin/codex`

If multiple executable candidates exist, Stave runs `candidate --version`, parses semver, and prefers the newest valid version.

### Claude CLI path resolution

Claude uses its own resolver in `electron/providers/claude-sdk-runtime.ts`.

Lookup candidates:

1. `STAVE_CLAUDE_CLI_PATH`
2. `CLAUDE_CODE_PATH`
3. `~/.bun/bin/claude`
4. `~/.local/bin/claude`

Each candidate must be executable and must respond successfully to `--version`. If multiple valid candidates exist, Stave sorts them by parsed version and chooses the newest one.

Claude also rewrites the child-process environment before execution so Electron-specific env variables do not leak into the spawned CLI, and it prepends the resolved binary directory plus common local bin paths to `PATH`.

## Useful environment variables

- `STAVE_PROVIDER_TIMEOUT_MS`
- `STAVE_CLAUDE_CLI_PATH`
- `CLAUDE_CODE_PATH`
- `STAVE_CLAUDE_DEBUG`
- `STAVE_CODEX_CLI_PATH`
- `STAVE_CODEX_CMD`
- `STAVE_CODEX_SANDBOX_MODE`
- `STAVE_CODEX_NETWORK_ACCESS`
- `STAVE_CODEX_APPROVAL_POLICY`
- `STAVE_CODEX_DEBUG`

Most per-turn runtime settings can also be changed from the Stave Settings dialog, and those UI values override the environment defaults for active turns.

## Project structure

- `src/` renderer app, Zustand store, chat UI, editor UI, and client bridges
- `electron/` Electron main process, preload bridge, provider runtimes, persistence
- `server/` browser-only dev bridge server
- `tests/` unit and E2E coverage
- `public/` static assets and provider logos

## Shadcn setup

- Current stored style: `radix-vega`
- Last recorded preset reference: `aIkf1Td`

```bash
bunx --bun shadcn@latest init --preset aIkf1Td
```
