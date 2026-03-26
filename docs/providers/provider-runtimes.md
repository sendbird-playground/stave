# Provider Runtimes

## Stave Model Router

The Stave Model Router is a meta-provider that sits above the real Claude and Codex runtimes. When a task uses the `stave` provider, Stave Auto classifies each prompt by intent and either routes it directly to a single model or escalates it into orchestration.

High-level flow:

1. The renderer submits a turn with `providerId: "stave"`.
2. `electron/providers/runtime.ts` detects the `stave` provider and builds the active `staveAuto` profile from settings.
3. `electron/providers/stave-preprocessor.ts` asks a lightweight classifier to return either `strategy: "direct"` with an intent (`plan`, `analyze`, `implement`, `quick_edit`, `general`) or `strategy: "orchestrate"`.
4. For direct execution, Stave resolves the configured model for that intent from the profile, emits `stave:execution_processing`, rewrites the `StreamTurnArgs`, and re-enters the normal provider runtime.
5. For orchestration, `electron/providers/stave-orchestrator.ts` asks the supervisor to produce role-based subtasks (`plan`, `analyze`, `implement`, `verify`, `general`), resolves each role to a configured model, executes subtasks, then synthesises the result.

### Direct intent table

| Intent | Default model | Typical work |
|--------|---------------|--------------|
| `plan` | `opusplan` | design, strategy, planning-only requests |
| `analyze` | `claude-opus-4-6` | explanation, debugging, review, root cause |
| `implement` | `gpt-5.3-codex` | feature work, patching, refactors, test writing |
| `quick_edit` | `claude-haiku-4-5` | rename, typo, tiny targeted changes |
| `general` | `claude-sonnet-4-6` | balanced default path |
| `verify` | `gpt-5.4` | orchestration-only validation/review step |

### Complexity signals

- **Prompt length > 1 200 characters** → treated as complex
- **Attached files ≥ 4** → treated as complex
- **Conversation history ≥ 8 messages** → treated as complex
- **Prompt length < 350 characters** → treated as short / quick

### Availability check

The Stave router is considered available when at least one underlying provider is available. Direct execution uses profile-aware fallback pairs when the chosen provider is unavailable; orchestration can optionally fall back to same-provider workers when cross-provider workers are disabled.

### Native command catalog

The Stave provider does not expose a native command catalog. Switching to `claude-code` or `codex` directly gives access to the full provider-specific slash command sets.

### Source file

Core files:

- `electron/providers/stave-router.ts` — deterministic fallback intent router
- `electron/providers/stave-preprocessor.ts` — LLM classifier
- `electron/providers/stave-orchestrator.ts` — role-based orchestration runner
- `src/lib/providers/stave-auto-profile.ts` — settings-derived profile helpers

---

## Claude runtime

Claude turns are handled in `electron/providers/claude-sdk-runtime.ts`.

High-level flow:

1. The renderer submits a turn through `window.api.provider.streamTurn(...)`.
2. `electron/main.ts` forwards that request into `electron/providers/runtime.ts`.
3. `streamClaudeWithSdk(...)` imports `@anthropic-ai/claude-agent-sdk` and runs the turn from Electron.
4. Claude SDK messages are converted into Stave `BridgeEvent` records.
5. The renderer consumes those normalized events and renders chat text, thinking, tools, approval prompts, user-input prompts, plans, and completion state.

Claude event mapping:

- assistant text -> `text`
- thinking or thinking delta -> `thinking`
- tool use -> `tool`
- `ExitPlanMode` tool payload -> `plan_ready`
- `task_progress.summary` -> `system` when Claude agent progress summaries are enabled
- stream or runtime failures -> `error`

Claude-specific runtime controls come from the UI and runtime options:

- permission mode
- dangerous skip permissions
- sandbox enabled
- allow unsandboxed commands
- agent progress summaries
- provider timeout
- debug stream logging

In the chat composer, Stave mirrors the active provider runtime in a status line under the prompt box so the current turn settings stay visible. Permission/approval plus the most-used provider controls can also be adjusted inline there.

When Claude `agentProgressSummaries` is enabled, Stave forwards the SDK flag explicitly and renders incoming `task_progress.summary` updates as inline system events in the active assistant message.

Claude path and approval handling:

- Stave runs Claude with the active workspace `cwd`
- workspace-root guidance is appended so relative paths stay rooted correctly
- approval and user-input responses are validated before they are returned to the SDK

## Codex runtime

Codex turns are handled in `electron/providers/codex-sdk-runtime.ts`.

High-level flow:

1. The renderer submits a turn through the same provider bridge.
2. `streamCodexWithSdk(...)` imports `@openai/codex-sdk`.
3. Stave creates a `Codex` instance in Electron and starts or reuses a thread for the current task and runtime configuration.
4. `thread.runStreamed(...)` yields Codex `ThreadEvent` items.
5. Stave maps those items into the same `BridgeEvent` format used by Claude.
6. File changes are post-processed through `turn-diff-tracker.ts` so the UI can render diffs.

Codex event mapping:

- agent messages -> `text`
- reasoning -> `thinking`
- command execution -> `tool`
- MCP tool calls -> `tool`
- web search -> `tool`
- todo list -> `tool`
- file changes -> diff events
- failures -> `error`

Codex-specific runtime controls come from the UI and runtime options:

- network access
- skip Git repository check
- sandbox mode
- approval policy
- reasoning effort
- reasoning summary and raw reasoning toggles
- binary path override
- provider timeout
- debug stream logging

Stave now forwards an explicit `show_raw_agent_reasoning: false` override when the Codex UI toggle is off, so local CLI defaults or config files do not leave raw reasoning enabled unexpectedly.

Codex threads are keyed by task/cwd plus the active sandbox, network, approval, model, reasoning, and web-search settings so Stave can preserve thread context without mixing incompatible runtime modes.

When a task switches from one Codex model to another, Stave does not attempt to resume the older native thread. Instead it replays the task history into a fresh Codex thread so model-bound session errors do not break the next turn.

## Supported Codex baseline

- Codex SDK: `@openai/codex-sdk@0.116.0`
- Codex CLI baseline: `0.116.0`

Stave prefers an explicit/user-installed Codex CLI when available, but can also fall back to the bundled SDK binary. A user-configured binary path still takes precedence over auto-discovery.

## Executable path resolution

Stave does not hardcode one binary path. It probes a small set of candidates, merges the Electron process PATH with the user's login-shell PATH plus common homebrew/home-bin locations, and accepts only executable files.

### Codex CLI lookup order

1. `runtimeOptions.codexPathOverride`
2. `STAVE_CODEX_CLI_PATH`
3. explicit probes of `~/.bun/bin/codex` and `~/.local/bin/codex`
4. `STAVE_CODEX_CMD` resolved through the merged PATH
5. default `codex` resolved through the merged PATH
6. bundled `@openai/codex-<platform>` SDK binary, rewritten to `app.asar.unpacked` in packaged builds

If multiple executable candidates exist, Stave runs `candidate --version`, parses semver, and prefers the newest valid version.

### Claude CLI lookup candidates

1. `STAVE_CLAUDE_CLI_PATH`
2. `CLAUDE_CODE_PATH`
3. `~/.claude/local/claude`
4. `~/.bun/bin/claude`
5. `~/.local/bin/claude`
6. `STAVE_CLAUDE_CMD` resolved through the merged PATH
7. default `claude` resolved through the merged PATH

Each candidate must be executable and respond successfully to `--version`. If multiple valid candidates exist, Stave sorts them by parsed version and chooses the newest one.

## Useful environment variables

- `STAVE_PROVIDER_TIMEOUT_MS`
- `STAVE_CLAUDE_CLI_PATH`
- `STAVE_CLAUDE_CMD`
- `CLAUDE_CODE_PATH`
- `STAVE_CLAUDE_DEBUG`
- `STAVE_CODEX_CLI_PATH`
- `STAVE_CODEX_CMD`
- `STAVE_CODEX_SANDBOX_MODE`
- `STAVE_CODEX_NETWORK_ACCESS`
- `STAVE_CODEX_APPROVAL_POLICY`
- `STAVE_CODEX_DEBUG`

Most per-turn runtime settings can also be changed from the Settings dialog, and those UI values override the environment defaults for active turns.
