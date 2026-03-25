/**
 * Stave Model Router
 *
 * Analyses the user prompt and selects the best underlying provider + model
 * combination to handle each request. This is a pure-function routing layer
 * that sits above the real provider runtimes (claude-code, codex).
 *
 * Routing table (priority order):
 *   1. Planning intent only          → claude-code / opusplan
 *   2. OpenAI / GPT ecosystem signal → codex      / gpt-5.4
 *   3. Complex analysis / planning   → claude-code / claude-opus-4-6
 *   4. Precise code generation       → codex      / gpt-5.3-codex
 *   5. Quick targeted edit           → claude-code / claude-haiku-4-5
 *   6. Default (general task)        → claude-code / claude-sonnet-4-6
 */

import type { StreamTurnArgs } from "./types";

// ── Public types ─────────────────────────────────────────────────────────────

export type StaveRouteTarget = {
  /** The underlying provider to delegate to. */
  providerId: "claude-code" | "codex";
  /** The specific model to use within that provider. */
  model: string;
  /** Human-readable explanation shown to the user as a system event. */
  reason: string;
};

/**
 * Per-rule model overrides.  When a field is provided it takes precedence over
 * the built-in default.  The provider is inferred from the model name via
 * `resolveProviderForModel` so users can point any rule at any model.
 */
export type StaveRouteModels = {
  planning?: string;
  ecosystem?: string;
  complex?: string;
  codeGen?: string;
  quickEdit?: string;
  default?: string;
};

// ── Provider inference ────────────────────────────────────────────────────────

/**
 * Infer the real provider from a model name.
 * Falls back to "claude-code" for unknown / custom model strings.
 */
const CODEX_MODEL_IDS = new Set(["gpt-5.4", "gpt-5.3-codex"]);

function resolveProviderForModel(model: string): "claude-code" | "codex" {
  return CODEX_MODEL_IDS.has(model) ? "codex" : "claude-code";
}

// ── Routing signal patterns ──────────────────────────────────────────────────

/**
 * Planning-only intent: the user wants a plan / strategy before implementation.
 * Routes to opusplan so no files are touched during the planning phase.
 *
 * NOTE: \b word boundaries do not match Hangul characters, so Korean keywords
 * are handled in a separate pattern that relies on natural token spacing.
 */
const PLAN_PATTERNS: RegExp[] = [
  // English keywords (ASCII word boundaries work fine)
  /\b(plan|approach|before\s+implement|what'?s?\s+the\s+best\s+way|how\s+should\s+i\s+(approach|tackle|structure))\b/i,
  // Korean keywords (no \b — Hangul sits outside the ASCII word-char range)
  /(설계|계획|전략|어떻게\s*할까|방향|구조\s*설계)/,
];

/**
 * Deep analysis or architectural explanation intent.
 * Long / complex versions of this signal route to Opus.
 */
const DEEP_ANALYSIS_PATTERNS: RegExp[] = [
  // English keywords
  /\b(analyze|explain|why|understand|root\s*cause|architecture|overview|summary|big\s+picture|how\s+does.*work)\b/i,
  // Korean keywords
  /(분석|설명|왜|이해|요약|전체)/,
];

/** Simple, targeted edit — rename, typo fix, small change. */
const QUICK_EDIT_PATTERNS: RegExp[] = [
  // English keywords
  /\b(rename|just\s+(fix|change|add|remove|update)|typo|quick\s+(fix|change|edit)|small\s+(fix|change))\b/i,
  // Korean keywords
  /(이름\s*변경|간단(히|하게)|오타)/,
];

/** OpenAI / GPT ecosystem keywords → prefer Codex. */
const CODEX_ECOSYSTEM_PATTERNS: RegExp[] = [
  /\b(openai\b|gpt-[45]|chatgpt|openai\s+api|gpt\s+api|o[34]-mini|o3\b|o4\b)\b/i,
];

/**
 * Explicit "generate / write / implement this exact piece of code" intent.
 * Uses `an?` to match both "a function" and "an algorithm".
 */
const CODEX_PURE_CODE_GEN_PATTERNS: RegExp[] = [
  /\b(generate\s+code|write\s+(an?\s+)?(function|class|module|script|program|snippet)|implement\s+(an?\s+)?(function|class|interface|algorithm|data\s+structure))\b/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.filter((re) => re.test(text)).length;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the best provider + model for a given prompt.
 *
 * Custom `routeModels` entries override the built-in defaults on a per-rule
 * basis.  The actual provider is always inferred from the resolved model name
 * so any Claude or Codex model can be assigned to any rule.
 *
 * Pure function — no I/O, no side effects.
 */
export function resolveStaveTarget(args: {
  prompt: string;
  attachedFileCount?: number;
  historyLength?: number;
  routeModels?: StaveRouteModels;
}): StaveRouteTarget {
  const { prompt, attachedFileCount = 0, historyLength = 0, routeModels } = args;
  const len = prompt.length;

  const planScore     = countMatches(PLAN_PATTERNS, prompt);
  const analysisScore = countMatches(DEEP_ANALYSIS_PATTERNS, prompt);
  const quickScore    = countMatches(QUICK_EDIT_PATTERNS, prompt);
  const ecoScore      = countMatches(CODEX_ECOSYSTEM_PATTERNS, prompt);
  const codeGenScore  = countMatches(CODEX_PURE_CODE_GEN_PATTERNS, prompt);

  // Complexity: long prompt, many attached files, or deep conversation
  const isComplex = len > 1200 || attachedFileCount >= 4 || historyLength >= 8;
  // Short / targeted: quick single-concern prompts
  const isShort   = len < 350;

  // Resolved models (user overrides take precedence over built-in defaults)
  const m = {
    planning: routeModels?.planning ?? "opusplan",
    ecosystem: routeModels?.ecosystem ?? "gpt-5.4",
    complex:   routeModels?.complex   ?? "claude-opus-4-6",
    codeGen:   routeModels?.codeGen   ?? "gpt-5.3-codex",
    quickEdit: routeModels?.quickEdit ?? "claude-haiku-4-5",
    default:   routeModels?.default   ?? "claude-sonnet-4-6",
  };

  // 1. Planning intent only (no deep analysis mixed in) → opusplan (or override)
  // len > 3 guards against a blank / single-char prompt accidentally matching.
  // Korean prompts are naturally shorter than English equivalents, so no higher
  // threshold is applied here.
  if (planScore >= 1 && analysisScore === 0 && len > 3) {
    return {
      providerId: resolveProviderForModel(m.planning),
      model: m.planning,
      reason: `Planning intent → ${m.planning}`,
    };
  }

  // 2. OpenAI / GPT ecosystem → gpt-5.4 (or override)
  if (ecoScore >= 1) {
    return {
      providerId: resolveProviderForModel(m.ecosystem),
      model: m.ecosystem,
      reason: `OpenAI ecosystem keywords → ${m.ecosystem}`,
    };
  }

  // 3. Deep analysis or complex planning → claude-opus-4-6 (or override)
  if ((analysisScore >= 1 || planScore >= 1) && isComplex) {
    return {
      providerId: resolveProviderForModel(m.complex),
      model: m.complex,
      reason: `Complex analysis / planning → ${m.complex}`,
    };
  }

  // 4. Precise code generation (short, targeted) → gpt-5.3-codex (or override)
  if (codeGenScore >= 1 && isShort) {
    return {
      providerId: resolveProviderForModel(m.codeGen),
      model: m.codeGen,
      reason: `Precise code generation → ${m.codeGen}`,
    };
  }

  // 5. Quick targeted edit (short prompt + simple keywords) → claude-haiku-4-5 (or override)
  if (quickScore >= 1 && isShort) {
    return {
      providerId: resolveProviderForModel(m.quickEdit),
      model: m.quickEdit,
      reason: `Quick edit → ${m.quickEdit}`,
    };
  }

  // 6. Default: balanced general-purpose → claude-sonnet-4-6 (or override)
  return {
    providerId: resolveProviderForModel(m.default),
    model: m.default,
    reason: `General task → ${m.default}`,
  };
}

/**
 * Rewrite a stave StreamTurnArgs with the resolved real provider + model.
 * The conversation target is also updated so the underlying SDK receives
 * the correct provider / model in the canonical request.
 */
export function buildStaveResolvedArgs(
  args: StreamTurnArgs,
  target: StaveRouteTarget,
): StreamTurnArgs {
  const resolvedConversation = args.conversation
    ? {
        ...args.conversation,
        target: {
          providerId: target.providerId,
          model: target.model,
        },
      }
    : undefined;

  return {
    ...args,
    providerId: target.providerId,
    runtimeOptions: {
      ...args.runtimeOptions,
      model: target.model,
    },
    ...(resolvedConversation !== undefined ? { conversation: resolvedConversation } : {}),
  };
}
