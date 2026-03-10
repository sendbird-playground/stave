# Stave

Stave is an Electron-based AI coding workspace built with Bun, React, Vite, and TypeScript.

## What exists today

- Desktop-first runtime with Electron main/preload separation
- Task-oriented chat UI with Claude and Codex provider switching
- Turn-scoped provider runtime routing for abort, approval, and user-input flows
- Workspace and branch-aware project navigation
- Monaco editor, docked terminal, and source-control actions
- SQLite-backed local persistence for workspaces, tasks, messages, turns, and request snapshots
- Canonical conversation requests translated into provider-specific runtime prompts
- Unified provider event pipeline for text, thinking, tools, approvals, user input, Claude plans, and diffs
- Latest-turn diagnostics with provider session ids, event timeline, and request snapshot inspection
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

## How one chat UI works across providers

Stave keeps a single task chat UI by separating app-owned conversation state from provider-owned wire formats.

High-level flow:

1. The renderer builds a `CanonicalConversationRequest` from the task's normalized history, current user input, selected file context, and any persisted provider-native session id.
2. The provider bridge sends that canonical request plus a small fallback prompt across preload / IPC into Electron.
3. Provider-specific translators rebuild the exact Claude or Codex prompt from the canonical request inside the runtime.
4. Claude and Codex both stream back normalized `BridgeEvent` records such as `text`, `thinking`, `tool`, `approval`, `user_input`, `diff`, and `done`.
5. The renderer replays those normalized events into one shared message model and one shared chat surface.

This keeps the task thread as Stave's source of truth while still letting each provider preserve its own native conversation id when available.

## Turn diagnostics and persistence

Every persisted turn stores:

- provider id
- turn event timeline
- provider-native conversation ids
- a `request_snapshot` payload containing the canonical request used to start that turn

The diagnostics panel can therefore show not only what a provider emitted, but also what Stave actually sent into that turn.

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

Claude plan responses are the only provider-specific plan surface currently rendered in the dedicated `PlanViewer`.

Claude-specific runtime controls come from the UI and runtime options:

- permission mode
- dangerous skip permissions
- sandbox enabled
- allow unsandboxed commands
- provider timeout
- debug stream logging

Claude path and approval handling:

- Stave runs Claude with the active workspace `cwd`.
- Stave appends workspace-root guidance to Claude's system prompt so relative paths like `./docs` resolve under the active workspace root.
- If the user intentionally targets a path outside the workspace root, Claude should request approval for that exact path instead of guessing a nearby absolute path.
- Stave validates Claude permission callback payloads before returning them to the SDK so malformed allow/deny responses fail closed instead of surfacing as `ZodError` tool-permission crashes.

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
- file changes -> diff events
- failures -> `error`

Codex-specific runtime controls come from the UI and runtime options:

- network access
- sandbox mode
- approval policy
- reasoning effort
- reasoning summary / raw reasoning toggles
- binary path override
- provider timeout
- debug stream logging

Codex threads are keyed by task/cwd plus the active sandbox, network, approval, model, reasoning, and web-search settings so Stave can preserve thread context without mixing incompatible runtime modes.

## Supported Codex Baseline

- Codex SDK: `@openai/codex-sdk@0.113.0`
- Codex CLI baseline: `0.113.0`
- Stave expects a local Codex CLI installation. A user-configured binary path takes precedence over PATH-based discovery.

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

Most per-turn runtime settings can also be changed from the Settings dialog, and those UI values override the environment defaults for active turns.

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
