# Stave Model Router

The Stave Model Router is a built-in meta-provider that selects the best AI model for every prompt automatically, without requiring the user to switch providers manually.

## Selecting Stave

In the model selector, choose **Stave** from the provider list. The task is then stored with `provider: "stave"` and every subsequent turn in that task goes through the router.

The model selector shows **Stave Auto** as the single model option. The chat surface shows a `[Stave]` system message at the beginning of each assistant turn explaining which provider and model were selected and why.

## How the router works

Routing happens in two stages:

### Stage 1 — Pre-processor (LLM)

Every turn is first analysed by a lightweight LLM (`claude-haiku-4-5` by default). The Pre-processor receives the user's prompt, conversation history length, and attached file count, then returns a structured `ExecutionPlan` as JSON — either `"direct"` (single model) or `"orchestrate"` (multi-model).

**Pre-processor model selection priority:**

1. `stavePreprocessorModel` setting (default: `claude-haiku-4-5`)
2. `gpt-5.3-codex` — if the primary model's provider is unavailable
3. Regex fallback — if both providers are unavailable (see Stage 1b below)

The Pre-processor always runs with `codexFastMode: true`, a 10-second hard timeout, no file/tool access, and a single turn (`claudeMaxTurns: 1`).

### Stage 1b — Regex fallback

If the Pre-processor LLM is unreachable (network error, timeout, quota exhausted), the router falls back to the original heuristic logic in `stave-router.ts`. This guarantees zero-downtime degradation: users on environments without any LLM access still get sensible routing.

### Stage 2a — Direct (single model)

The Pre-processor selected one model to handle the full request. The routing runtime:

1. Checks provider availability for the chosen model.
2. If unavailable, substitutes an automatic fallback (see table below).
3. Forwards the turn to the selected model with `fastMode` applied when the Pre-processor requested it.

**Direct model palette:**

| Situation | Model | fastMode |
|---|---|---|
| Quick edits (rename, typo, one-liner) | `claude-haiku-4-5` | — |
| General coding / explanations | `claude-sonnet-4-6` | — |
| Pure code generation focus | `gpt-5.3-codex` | — |
| Complex analysis, architecture (accuracy first) | `claude-opus-4-6` | false |
| **Complex task + urgency signal** | **`gpt-5.4`** | **true** |
| OpenAI ecosystem questions | `gpt-5.4` | — |
| Planning / design only (no file edits) | `opusplan` | — |

Urgency signals that trigger `fastMode: true`: *빠르게, 빨리, quick, fast, ASAP, urgent, 즉시*.

**Automatic availability fallbacks:**

| Chosen model | Fallback when unavailable |
|---|---|
| `claude-opus-4-6` | `gpt-5.4` |
| `claude-sonnet-4-6` | `gpt-5.4` |
| `claude-haiku-4-5` | `gpt-5.3-codex` |
| `gpt-5.4` | `claude-opus-4-6` |
| `gpt-5.3-codex` | `claude-haiku-4-5` |

### Stage 2b — Orchestrate (multi-model)

When the Pre-processor judges that the request genuinely requires multiple specialised agents (e.g. "analyse the auth module, then rewrite it, then add tests"), it returns `strategy: "orchestrate"`. The Orchestrator takes over:

1. **Supervisor decompose** — The Supervisor model (default `claude-opus-4-6`) breaks the request into 2–4 subtasks as a JSON plan with `dependsOn` edges.
2. **Parallel execution** — Subtasks are grouped by topological level; subtasks at the same level run in parallel via `Promise.all`. Prior results are injected into subsequent prompts via `{subtask-id}` placeholders.
3. **Supervisor synthesise** — The Supervisor merges all worker outputs into a single coherent response streamed back to the user.

Orchestration is only active when **Stave Auto** is selected and `staveOrchestrationEnabled` is `true` (the default). If orchestration is disabled in settings, the Pre-processor's `"orchestrate"` decision is silently downgraded to the regex fallback direct path.

## Provider availability cache

Both stages consult a 30-second TTL in-process cache (`stave-availability.ts`) to avoid redundant availability checks. The cache is non-persistent: each new Stave session re-checks on the first request. The cache can be invalidated programmatically after quota-exhaustion errors.

## Per-turn routing

The router re-evaluates every turn independently. Within a single task, different messages can be routed to different models. Provider-native conversation IDs (Claude session ID, Codex thread ID) are preserved separately per provider, so switching between providers within a task does not lose context.

## Settings

Three settings control the orchestration behaviour (accessible via **Settings → Stave Orchestration**):

| Setting | Default | Description |
|---|---|---|
| `stavePreprocessorModel` | `claude-haiku-4-5` | Model used to analyse prompts and produce `ExecutionPlan` |
| `staveSupervisorModel` | `claude-opus-4-6` | Model used to decompose and synthesise in orchestration mode |
| `staveOrchestrationEnabled` | `true` | When false, all turns use the direct path |

The existing per-rule model overrides (`StaveRoutingModelsCard`) remain available for users who want to pin specific regex-matched routes to particular models.

## BridgeEvents emitted by Stave

Stave emits its own meta-events (prefixed `stave:`) alongside the provider's native events:

| Event | When |
|---|---|
| `stave:execution_plan` | Pre-processor returns a plan (before the actual turn starts) |
| `stave:orchestration_plan` | Supervisor returns the subtask breakdown |
| `stave:subtask_started` | A worker agent begins its subtask |
| `stave:subtask_done` | A worker agent finishes |
| `stave:synthesis_started` | Supervisor begins merging worker outputs |

## Extending the router

**Routing rules (regex fallback):** edit `stave-router.ts` — add patterns to `PLAN_PATTERNS`, `DEEP_ANALYSIS_PATTERNS`, etc. No other files need to change.

**Pre-processor prompt:** edit the `PREPROCESSOR_SYSTEM_PROMPT` constant in `stave-preprocessor.ts` to adjust the model descriptions or decision criteria.

**Supervisor prompts:** edit `SUPERVISOR_PLAN_PROMPT` / `SUPERVISOR_SYNTHESIS_PROMPT` in `stave-orchestrator.ts`.

**New model tier:** add it to `CLAUDE_SDK_MODEL_OPTIONS` or `CODEX_SDK_MODEL_OPTIONS` in `model-catalog.ts`, then reference it in the Pre-processor system prompt and update the availability fallback table in `runtime.ts`.

## Limitations

- The Stave provider does not expose a native command catalog. Use `claude-code` or `codex` directly if you need provider-specific slash commands.
- Orchestration adds latency proportional to the number of subtasks × model round-trips. For time-sensitive work, prefer direct mode or disable orchestration in settings.
- Per-task routing history is not persisted; diagnostics panels show the resolved provider and model that was actually used for each turn.
- The Pre-processor timeout is 10 seconds. On slow networks, frequent Pre-processor timeouts will cause all turns to fall back to regex routing.
