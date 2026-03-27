import Anthropic from "@anthropic-ai/sdk";
import type { Query, SDKAssistantMessage, SDKAuthStatusMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildClaudeEnv, resolveClaudeExecutablePath } from "./claude-sdk-runtime";

interface InlineCompletionRequest {
  prefix: string;
  suffix: string;
  filePath: string;
  language: string;
  maxTokens?: number;
}

interface InlineCompletionResult {
  ok: boolean;
  text: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const COMPLETION_MODEL = "claude-haiku-4-5-20251001";
const SDK_MODEL = "claude-haiku-4-5";
const DEFAULT_MAX_TOKENS = 24;
const MAX_PREFIX_CHARS = 320;
const MAX_SUFFIX_CHARS = 48;
const MAX_PREFIX_LINES = 8;
const MAX_SUFFIX_LINES = 2;
const SDK_EARLY_SETTLE_MS = 40;

// ---------------------------------------------------------------------------
// Prompt builder (shared by both backends)
// ---------------------------------------------------------------------------

function trimContextLines(args: {
  value: string;
  maxChars: number;
  maxLines: number;
  take: "start" | "end";
}) {
  const normalized = args.value.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const selectedLines = args.take === "end"
    ? lines.slice(-args.maxLines)
    : lines.slice(0, args.maxLines);
  const joined = selectedLines.join("\n");

  if (joined.length <= args.maxChars) {
    return joined;
  }
  return args.take === "end"
    ? joined.slice(-args.maxChars)
    : joined.slice(0, args.maxChars);
}

function buildCompletionPrompt(args: InlineCompletionRequest) {
  const prefix = trimContextLines({
    value: args.prefix,
    maxChars: MAX_PREFIX_CHARS,
    maxLines: MAX_PREFIX_LINES,
    take: "end",
  });
  const suffix = trimContextLines({
    value: args.suffix,
    maxChars: MAX_SUFFIX_CHARS,
    maxLines: MAX_SUFFIX_LINES,
    take: "start",
  });

  const lang = args.language || "plaintext";
  const fileName = args.filePath.split("/").pop() ?? "file";

  return {
    system: [
      "Complete code at the cursor.",
      "Return only inserted code.",
      "No markdown. No explanation.",
      "Keep it short and local.",
      "Do not repeat surrounding text.",
      "If unsure, return an empty string.",
    ].join("\n"),
    user: [
      `File: ${fileName} (${lang})`,
      `<prefix>${prefix}</prefix>`,
      `<suffix>${suffix}</suffix>`,
      "Complete between <prefix> and <suffix>. Output only inserted code:",
    ].join("\n"),
  };
}

function normalizeInlineCompletionText(text: string) {
  const trimmed = text.trim();
  const fencedBlockMatch = trimmed.match(/^```[^\r\n`]*\r?\n([\s\S]*?)\r?\n```$/);
  if (fencedBlockMatch?.[1] !== undefined) {
    return fencedBlockMatch[1];
  }
  return text;
}

function getInlineCompletionControlError(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("not logged in")
    || normalized.includes("please run /login")
    || normalized.includes("claude auth login")
    || normalized.includes("authentication failed")
  ) {
    return "Claude authentication failed. Run `claude auth login` and retry.";
  }
  if (normalized.includes("billing") || normalized.includes("subscription")) {
    return "Claude billing/subscription issue detected. Check plan/payment status and retry.";
  }
  if (normalized.includes("rate limit") || normalized.includes("hit your limit")) {
    return "Claude rate limit reached. Retry in a moment.";
  }
  return null;
}

function mergeInlineCompletionText(previous: string, candidate: string) {
  if (!previous) {
    return candidate;
  }
  if (!candidate) {
    return previous;
  }
  if (candidate.startsWith(previous) || candidate.includes(previous)) {
    return candidate;
  }
  if (previous.startsWith(candidate) || previous.includes(candidate)) {
    return previous;
  }
  return previous + candidate;
}

// ---------------------------------------------------------------------------
// Backend 1: Claude SDK
// ---------------------------------------------------------------------------

let cachedClaudeExecutablePath: string | null | undefined;
let inlineCompletionRequestSequence = 0;

interface ActiveSdkRequest {
  stream: Query;
  aborted: boolean;
}

let activeSdkRequest: ActiveSdkRequest | null = null;

function resolveClaudeSdkExecutablePath(): string | null {
  if (cachedClaudeExecutablePath !== undefined) {
    return cachedClaudeExecutablePath;
  }
  try {
    const resolved = resolveClaudeExecutablePath();
    cachedClaudeExecutablePath = resolved || null;
  } catch {
    cachedClaudeExecutablePath = null;
  }
  return cachedClaudeExecutablePath;
}

function abortSdkRequest() {
  if (activeSdkRequest) {
    activeSdkRequest.aborted = true;
    activeSdkRequest.stream.close();
    activeSdkRequest = null;
  }
}

async function requestViaClaudeSdk(
  args: InlineCompletionRequest,
  traceId: string,
): Promise<InlineCompletionResult> {
  const prompt = buildCompletionPrompt(args);
  const startedAt = Date.now();
  console.debug(
    `[inline-completion][${traceId}][sdk] start prefix=${args.prefix.length} suffix=${args.suffix.length} prompt=${prompt.user.length}`,
  );
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;
  if (!queryFn) {
    return { ok: false, text: "", error: "Claude SDK query() unavailable" };
  }

  const claudeExecutablePath = resolveClaudeSdkExecutablePath() ?? "";
  const sdkEnv = buildClaudeEnv({ executablePath: claudeExecutablePath });
  sdkEnv.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION = "false";
  const stream = queryFn({
    prompt: prompt.user,
    options: {
      permissionMode: "dontAsk",
      maxTurns: 1,
      persistSession: false,
      includePartialMessages: true,
      promptSuggestions: false,
      settingSources: [],
      plugins: [],
      cwd: process.cwd(),
      model: SDK_MODEL,
      systemPrompt: prompt.system,
      thinking: {
        type: "disabled",
      },
      effort: "low",
      tools: [],
      allowedTools: [],
      extraArgs: {
        "disable-slash-commands": null,
      },
      settings: {
        fastMode: true,
      },
      env: sdkEnv,
      ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
    },
  }) as Query;

  const requestState: ActiveSdkRequest = {
    stream,
    aborted: false,
  };
  activeSdkRequest = requestState;
  let assistantText = "";
  let earlySettleTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let firstAssistantTextAt: number | null = null;
  let terminalError: string | null = null;
  const clearEarlySettleTimer = () => {
    if (earlySettleTimer) {
      clearTimeout(earlySettleTimer);
      earlySettleTimer = null;
    }
  };
  const finish = (result: InlineCompletionResult, options?: { closeStream?: boolean }) => {
    if (settled) {
      return result;
    }
    settled = true;
    clearEarlySettleTimer();
      if (activeSdkRequest === requestState) {
        activeSdkRequest = null;
      }
      if (options?.closeStream) {
        try {
        stream.close();
      } catch {
        // Ignore close errors while finishing the SDK stream early.
        }
      }
      console.debug(
        `[inline-completion][${traceId}][sdk] finish ok=${result.ok} error=${result.error ?? ""} first_text_ms=${firstAssistantTextAt === null ? -1 : firstAssistantTextAt - startedAt} total_ms=${Date.now() - startedAt} text_len=${result.text.length}`,
      );
      return result;
    };

  try {
    for await (const message of stream) {
      if (settled) {
        break;
      }
      if (message.type === "auth_status") {
        const authStatus = message as SDKAuthStatusMessage;
        const output = Array.isArray(authStatus.output) ? authStatus.output.join("\n") : "";
        terminalError = getInlineCompletionControlError(output)
          ?? authStatus.error
          ?? "Claude authentication failed. Run `claude auth login` and retry.";
        return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
      }
      if (message.type === "result") {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.is_error) {
          const resultError = "errors" in resultMsg && Array.isArray(resultMsg.errors)
            ? resultMsg.errors.find((value) => typeof value === "string" && value.trim())
            : null;
          terminalError = resultError ?? `Claude SDK finished with ${resultMsg.subtype}`;
          return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
        }
      }
      if (message.type === "stream_event") {
        const streamMsg = message as {
          type: "stream_event";
          event?: {
            type?: string;
            delta?: {
              type?: string;
              text?: string;
            };
          };
        };
        const streamEvent = streamMsg.event;
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
          assistantText = mergeInlineCompletionText(assistantText, streamEvent.delta.text);
          if (firstAssistantTextAt === null && assistantText.trim()) {
            firstAssistantTextAt = Date.now();
            console.debug(
              `[inline-completion][${traceId}][sdk] first-text ms=${firstAssistantTextAt - startedAt} len=${assistantText.length}`,
            );
          }
          clearEarlySettleTimer();
          earlySettleTimer = setTimeout(() => {
            const normalized = normalizeInlineCompletionText(assistantText);
            if (!normalized.trim()) {
              return;
            }
            finish({ ok: true, text: normalized }, { closeStream: true });
          }, SDK_EARLY_SETTLE_MS);
        }
        continue;
      }
      if (message.type !== "assistant") {
        continue;
      }
      const assistantMsg = message as SDKAssistantMessage;
      if (assistantMsg.error) {
        if (assistantMsg.error === "authentication_failed") {
          terminalError = "Claude authentication failed. Run `claude auth login` and retry.";
        } else if (assistantMsg.error === "billing_error") {
          terminalError = "Claude billing/subscription issue detected. Check plan/payment status and retry.";
        } else if (assistantMsg.error === "rate_limit") {
          terminalError = "Claude rate limit reached. Retry in a moment.";
        } else {
          terminalError = `Claude SDK assistant error: ${assistantMsg.error}`;
        }
        return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
      }
      const contentBlocks = assistantMsg.message?.content;
      if (!Array.isArray(contentBlocks)) {
        continue;
      }
      for (const block of contentBlocks) {
        const candidate = block as { type?: string; text?: string };
        if (candidate.type === "text" && candidate.text) {
          assistantText = mergeInlineCompletionText(assistantText, candidate.text);
          const controlError = getInlineCompletionControlError(assistantText);
          if (controlError) {
            terminalError = controlError;
            return finish({ ok: false, text: "", error: terminalError }, { closeStream: true });
          }
          if (firstAssistantTextAt === null && assistantText.trim()) {
            firstAssistantTextAt = Date.now();
            console.debug(
              `[inline-completion][${traceId}][sdk] first-text ms=${firstAssistantTextAt - startedAt} len=${assistantText.length}`,
            );
          }
        }
      }
      clearEarlySettleTimer();
      earlySettleTimer = setTimeout(() => {
        const normalized = normalizeInlineCompletionText(assistantText);
        if (!normalized.trim()) {
          return;
        }
        finish({ ok: true, text: normalized }, { closeStream: true });
      }, SDK_EARLY_SETTLE_MS);
    }

    const normalized = normalizeInlineCompletionText(assistantText);
    const controlError = getInlineCompletionControlError(normalized);
    if (controlError) {
      terminalError = controlError;
      return finish({ ok: false, text: "", error: terminalError });
    }
    return finish({ ok: true, text: normalized });
  } catch (error) {
    if (requestState.aborted) {
      return { ok: false, text: "", error: "aborted" };
    }
    if (terminalError) {
      return { ok: false, text: "", error: terminalError };
    }
    if (settled && normalizeInlineCompletionText(assistantText).trim()) {
      const normalized = normalizeInlineCompletionText(assistantText);
      const controlError = getInlineCompletionControlError(normalized);
      if (controlError) {
        return { ok: false, text: "", error: controlError };
      }
      return { ok: true, text: normalized };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[inline-completion][${traceId}][sdk] request failed after ${Date.now() - startedAt}ms:`,
      message,
    );
    return { ok: false, text: "", error: message };
  } finally {
    cachedClaudeExecutablePath = claudeExecutablePath || cachedClaudeExecutablePath;
    if (activeSdkRequest === requestState) {
      activeSdkRequest = null;
    }
    try {
      stream.close();
    } catch {
      // Ignore close errors while tearing down the stream.
    }
  }
}

// ---------------------------------------------------------------------------
// Backend 2: Remote Anthropic API (fallback when CLI unavailable)
// ---------------------------------------------------------------------------

let clientInstance: Anthropic | null = null;
let lastApiKeyCheck = 0;
let cachedApiKey = "";
const API_KEY_CHECK_INTERVAL_MS = 30_000;

function resolveApiKey(): string {
  const now = Date.now();
  if (cachedApiKey && now - lastApiKeyCheck < API_KEY_CHECK_INTERVAL_MS) {
    return cachedApiKey;
  }
  lastApiKeyCheck = now;
  cachedApiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  return cachedApiKey;
}

function getClient(): Anthropic | null {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    clientInstance = null;
    return null;
  }
  if (!clientInstance) {
    clientInstance = new Anthropic({ apiKey });
  }
  return clientInstance;
}

/** AbortController for the in-flight API request. */
let activeAbortController: AbortController | null = null;

function abortApiRequest() {
  activeAbortController?.abort();
  activeAbortController = null;
}

async function requestViaApi(
  args: InlineCompletionRequest,
  traceId = `req-${++inlineCompletionRequestSequence}`,
): Promise<InlineCompletionResult> {
  const startedAt = Date.now();
  const client = getClient();
  if (!client) {
    return { ok: false, text: "", error: "ANTHROPIC_API_KEY not set" };
  }

  const prompt = buildCompletionPrompt(args);
  const abortController = new AbortController();
  activeAbortController = abortController;

  try {
    const response = await client.messages.create(
      {
        model: COMPLETION_MODEL,
        max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal: abortController.signal },
    );

    if (abortController.signal.aborted) {
      return { ok: false, text: "", error: "aborted" };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const normalized = normalizeInlineCompletionText(text);
    console.debug(
      `[inline-completion][${traceId}][api] finish ok=true total_ms=${Date.now() - startedAt} text_len=${normalized.length}`,
    );
    return { ok: true, text: normalized };
  } catch (error) {
    if (abortController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { ok: false, text: "", error: "aborted" };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[inline-completion][${traceId}][api] request failed after ${Date.now() - startedAt}ms:`, message);
    return { ok: false, text: "", error: message };
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function abortActiveInlineCompletion() {
  abortSdkRequest();
  abortApiRequest();
}

export async function requestInlineCompletion(
  args: InlineCompletionRequest,
): Promise<InlineCompletionResult> {
  const traceId = `req-${++inlineCompletionRequestSequence}`;
  const sdkResult = await requestViaClaudeSdk(args, traceId);
  if (sdkResult.ok || sdkResult.error === "aborted" || !resolveApiKey()) {
    return sdkResult;
  }

  console.warn(`[inline-completion][${traceId}] SDK failed, falling back to API:`, sdkResult.error ?? "unknown error");
  return requestViaApi(args, traceId);
}

export function isInlineCompletionAvailable(): boolean {
  return Boolean(resolveClaudeSdkExecutablePath()) || Boolean(resolveApiKey());
}
