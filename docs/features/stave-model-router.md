# Stave Model Router

The Stave Model Router is a built-in meta-provider that selects the best AI model for every prompt automatically, without requiring the user to switch providers manually.

## Selecting Stave

In the model selector, choose **Stave** from the provider list. The task is then stored with `provider: "stave"` and every subsequent turn in that task goes through the router.

The model selector shows **Stave Auto** as the single model option. The chat surface shows a `[Stave]` system message at the beginning of each assistant turn explaining which provider and model were selected and why.

## How the router works

The router is implemented as a pure function in `electron/providers/stave-router.ts`. It receives the current prompt, the number of attached files, and the conversation history length, then returns a `StaveRouteTarget`:

```ts
type StaveRouteTarget = {
  providerId: "claude-code" | "codex";
  model: string;
  reason: string; // shown to the user as a system event
};
```

No LLM call is made during routing — the decision is entirely heuristic and adds zero latency. The routing decision can differ for every turn in the same task, so a task may use Opus Plan for its first message and Sonnet for the next.

## Routing rules (priority order)

### 1 — Planning intent → Claude Opus Plan (`opusplan`)

Triggered by: words like *plan*, *설계*, *계획*, *전략*, *approach*, *what's the best way*, *how should I structure*, etc., when no deep analysis keywords are also present.

Use this when you want Stave to think through a design or implementation strategy before touching any files. `opusplan` never executes tool calls; it produces a plan and stops.

### 2 — OpenAI / GPT ecosystem → GPT-5.4 (`gpt-5.4`)

Triggered by: keywords like *openai*, *gpt-5*, *chatgpt*, *openai api*, *o3*, *o4-mini*, etc.

Routes to Codex so the turn runs inside the GPT-5 family, which is most familiar with its own APIs and SDKs.

### 3 — Complex analysis or planning → Claude Opus 4.6 (`claude-opus-4-6`)

Triggered by: deep analysis keywords (*analyze*, *분석*, *explain*, *root cause*, *architecture*, *how does … work*, etc.) combined with a complex context (prompt > 1 200 chars, 4+ attached files, or 8+ history messages).

Use this when you need Stave to reason deeply across a large codebase or explain a non-obvious system behaviour.

### 4 — Precise code generation → GPT-5.3-Codex (`gpt-5.3-codex`)

Triggered by: explicit code-generation phrasing (*generate code*, *write a function*, *implement an algorithm*, etc.) on a short prompt (< 350 chars).

Routes to the code-specialised GPT-5.3-Codex variant for precise, focused code output.

### 5 — Quick targeted edit → Claude Haiku 4.5 (`claude-haiku-4-5`)

Triggered by: quick-edit signals (*rename*, *just fix*, *typo*, *오타*, *quick change*, etc.) on a short prompt.

Routes to the fastest, lowest-cost Claude model for simple single-concern tasks.

### 6 — Default → Claude Sonnet 4.6 (`claude-sonnet-4-6`)

All other prompts. Claude Sonnet 4.6 provides the best balance of quality, speed, and cost for general development work.

## Per-turn routing

The router re-evaluates every turn independently. Within a single task, different messages can be routed to different models. Provider-native conversation IDs (Claude session ID, Codex thread ID) are preserved separately per provider, so switching between providers within a task does not lose context.

## Availability

The Stave provider is shown as available in the Settings dialog when the Claude CLI is reachable. Codex availability is checked only when the router decides to delegate to Codex.

## Extending the router

The routing logic lives entirely in `electron/providers/stave-router.ts` as pure functions. To adjust or add rules:

1. Add or modify the pattern arrays (`PLAN_PATTERNS`, `DEEP_ANALYSIS_PATTERNS`, etc.).
2. Adjust the scoring / threshold logic in `resolveStaveTarget`.
3. No other files need to change for routing-rule updates.

To add a new routing tier (e.g. a future model), add it to `CLAUDE_SDK_MODEL_OPTIONS` or `CODEX_SDK_MODEL_OPTIONS` in `model-catalog.ts`, then add a new scored branch in `resolveStaveTarget`.

## Limitations

- The Stave provider does not expose a native command catalog. Use `claude-code` or `codex` directly if you need provider-specific slash commands.
- The router does not make an LLM call to classify the prompt, so edge cases may be routed suboptimally. Switching to a specific provider remains possible at any time.
- Per-task routing history is not persisted; diagnostics panels show the resolved provider and model that was actually used for each turn.
