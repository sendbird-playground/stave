/**
 * Stave Pre-processor
 *
 * Analyses the user's prompt with a lightweight LLM (claude-haiku-4-5 by
 * default) and returns a structured ExecutionProcessing that tells the Stave runtime
 * whether to handle the request with a single model ("direct") or to spin up
 * the multi-model Orchestrator ("orchestrate").
 *
 * Model selection priority:
 *   1. stavePreprocessorModel setting (or "claude-haiku-4-5" default)
 *   2. "gpt-5.3-codex" — if the primary model's provider is unavailable
 *   3. resolveStaveTarget() regex fallback — if both providers are unavailable
 */

import type { BridgeEvent, StreamTurnArgs } from "./types";
import { resolveStaveTarget, type StaveRouteModels } from "./stave-router";
import { getCachedAvailability } from "./stave-availability";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExecutionProcessing =
  | {
      strategy: "direct";
      /** The model that should handle the full request. */
      model: string;
      /** Short human-readable reason shown in the UI. */
      reason: string;
      executionHints?: {
        /**
         * When true the runtime sets codexFastMode / claudeFastMode so the
         * model trades some accuracy for lower latency.  Useful for complex
         * prompts that include urgency signals ("빠르게", "quick", "ASAP").
         */
        fastMode?: boolean;
      };
    }
  | {
      strategy: "orchestrate";
      /** The Supervisor model that will coordinate the worker agents. */
      supervisorModel: string;
      /** Short human-readable reason shown in the UI. */
      reason: string;
    };

// ── Provider inference (mirrors stave-router.ts) ──────────────────────────────

const CODEX_MODEL_IDS = new Set(["gpt-5.4", "gpt-5.3-codex"]);

function resolveProviderForModel(model: string): "claude-code" | "codex" {
  return CODEX_MODEL_IDS.has(model) ? "codex" : "claude-code";
}

// ── Pre-processor prompt ──────────────────────────────────────────────────────

const PREPROCESSOR_SYSTEM_PROMPT = `You are a routing intelligence for the Stave AI coding assistant.
Your only job is to read the user's prompt and decide the optimal execution strategy.

Available models and when to use them:
- "claude-haiku-4-5"  : Quick edits, simple one-liners, rename/typo fixes
- "claude-sonnet-4-6" : General coding tasks, explanations, balanced work
- "gpt-5.3-codex"     : Pure code generation focus (write a function / class / module)
- "claude-opus-4-6"   : Complex analysis, architecture decisions that need deep reasoning
- "gpt-5.4"           : Complex tasks where speed matters most, OpenAI ecosystem questions
- "opusplan"          : Planning / design only — user wants a plan, NOT file edits

Use strategy "orchestrate" ONLY when the request genuinely requires multiple
specialised models working in sequence (e.g. "analyse the auth module, then
rewrite it to fix the vulnerabilities, then add tests").  Most requests should
be "direct".

Respond with ONLY valid JSON — no markdown fences, no explanation:

For direct (single model):
{"strategy":"direct","model":"<model-id>","reason":"<≤10 word reason>","executionHints":{"fastMode":false}}

For orchestration (multiple models):
{"strategy":"orchestrate","supervisorModel":"claude-opus-4-6","reason":"<≤10 word reason>"}

Set fastMode to true when the prompt contains urgency signals like "빠르게", "빨리", "quick", "fast", "ASAP", "urgent", "즉시".`;

function buildPreprocessorUserPrompt(args: {
  userPrompt: string;
  historyLength: number;
  attachedFileCount: number;
}): string {
  const contextHints: string[] = [];
  if (args.historyLength > 0) {
    contextHints.push(`conversation history: ${args.historyLength} messages`);
  }
  if (args.attachedFileCount > 0) {
    contextHints.push(`attached files: ${args.attachedFileCount}`);
  }

  const contextLine = contextHints.length > 0
    ? `\n[Context: ${contextHints.join(", ")}]`
    : "";

  return `Analyse this prompt and return the routing JSON:${contextLine}\n\n${args.userPrompt}`;
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseExecutionProcessing(raw: string): ExecutionProcessing | null {
  // Strip potential markdown fences the model may add despite instructions
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    if (parsed.strategy === "direct" && typeof parsed.model === "string") {
      const plan: ExecutionProcessing = {
        strategy: "direct",
        model: parsed.model,
        reason: typeof parsed.reason === "string" ? parsed.reason : "Pre-processor decision",
      };
      if (
        parsed.executionHints
        && typeof parsed.executionHints === "object"
        && !Array.isArray(parsed.executionHints)
      ) {
        const hints = parsed.executionHints as Record<string, unknown>;
        plan.executionHints = {
          fastMode: hints.fastMode === true,
        };
      }
      return plan;
    }

    if (parsed.strategy === "orchestrate" && typeof parsed.supervisorModel === "string") {
      return {
        strategy: "orchestrate",
        supervisorModel: parsed.supervisorModel,
        reason: typeof parsed.reason === "string" ? parsed.reason : "Pre-processor decision",
      };
    }
  } catch {
    // fall through to null
  }
  return null;
}

// ── Model selection ───────────────────────────────────────────────────────────

/**
 * Pick the best available pre-processor model.
 * Returns null when neither provider is available (caller should use regex fallback).
 */
export function selectPreprocessorModel(args: {
  preferredModel: string;
}): string | null {
  const preferred = args.preferredModel;
  const preferredProvider = resolveProviderForModel(preferred);

  // If the preferred model's provider is available (or unknown — optimistic), use it.
  const preferredAvail = getCachedAvailability(preferredProvider);
  if (preferredAvail !== false) {
    return preferred;
  }

  // Fallback: try the other provider's cheap model.
  const fallbackModel = preferredProvider === "claude-code" ? "gpt-5.3-codex" : "claude-haiku-4-5";
  const fallbackProvider = resolveProviderForModel(fallbackModel);
  const fallbackAvail = getCachedAvailability(fallbackProvider);
  if (fallbackAvail !== false) {
    return fallbackModel;
  }

  // Both providers are known to be unavailable.
  return null;
}

// ── Regex fallback ────────────────────────────────────────────────────────────

function fallbackToRegexProcessing(args: {
  prompt: string;
  historyLength: number;
  attachedFileCount: number;
  routeModels?: StaveRouteModels;
}): ExecutionProcessing {
  const target = resolveStaveTarget({
    prompt: args.prompt,
    historyLength: args.historyLength,
    attachedFileCount: args.attachedFileCount,
    routeModels: args.routeModels,
  });
  return {
    strategy: "direct",
    model: target.model,
    reason: target.reason,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse the user prompt and return an ExecutionProcessing.
 *
 * @param runTurnBatch  Thin wrapper around runProviderTurn that collects all
 *                      BridgeEvents and returns them as an array.  Injected
 *                      by runtime.ts to avoid a circular dependency.
 */
export async function runPreprocessor(args: {
  userPrompt: string;
  historyLength: number;
  attachedFileCount: number;
  preprocessorModel: string;
  supervisorModel: string;
  orchestrationEnabled: boolean;
  routeModels?: StaveRouteModels;
  baseArgs: Pick<StreamTurnArgs, "cwd" | "taskId" | "workspaceId">;
  runTurnBatch: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
}): Promise<ExecutionProcessing> {
  const chosenModel = selectPreprocessorModel({ preferredModel: args.preprocessorModel });

  // No LLM available — fall back to regex routing immediately.
  if (!chosenModel) {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      routeModels: args.routeModels,
    });
  }

  const preprocessorProviderId = resolveProviderForModel(chosenModel);

  let events: BridgeEvent[];
  try {
    events = await args.runTurnBatch({
      providerId: preprocessorProviderId,
      prompt: buildPreprocessorUserPrompt({
        userPrompt: args.userPrompt,
        historyLength: args.historyLength,
        attachedFileCount: args.attachedFileCount,
      }),
      cwd: args.baseArgs.cwd,
      taskId: args.baseArgs.taskId,
      workspaceId: args.baseArgs.workspaceId,
      runtimeOptions: {
        model: chosenModel,
        claudeSystemPrompt: PREPROCESSOR_SYSTEM_PROMPT,
        claudeMaxTurns: 1,
        claudePermissionMode: "bypassPermissions",
        // Disable all file/tool access — Pre-processor only needs to read the prompt
        claudeAllowedTools: [],
        codexFastMode: true, // Always fast for the Pre-processor itself
        providerTimeoutMs: 10_000, // 10 s hard cap
      },
    });
  } catch {
    // Network error, timeout, etc. — degrade gracefully to regex.
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      routeModels: args.routeModels,
    });
  }

  // Collect all streamed text from the Pre-processor response.
  const rawText = events
    .filter((e): e is Extract<BridgeEvent, { type: "text" }> => e.type === "text")
    .map(e => e.text)
    .join("");

  const plan = parseExecutionProcessing(rawText);

  if (!plan) {
    // Malformed / empty response — fall back to regex.
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      routeModels: args.routeModels,
    });
  }

  // If orchestration is disabled in settings, downgrade to direct even if
  // the Pre-processor recommended orchestration.
  if (!args.orchestrationEnabled && plan.strategy === "orchestrate") {
    return fallbackToRegexProcessing({
      prompt: args.userPrompt,
      historyLength: args.historyLength,
      attachedFileCount: args.attachedFileCount,
      routeModels: args.routeModels,
    });
  }

  return plan;
}
