import type { BridgeEvent, StreamTurnArgs } from "./types";
import type { Thread, ThreadEvent, ThreadItem, TurnCompletedEvent, TurnOptions } from "@openai/codex-sdk";
import { resolveExecutablePath } from "./executable-path";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { toText } from "./utils";
import {
  buildProviderTurnPrompt,
  resolveProviderResumeConversationId,
} from "../../src/lib/providers/provider-request-translators";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexSandboxMode,
} from "../../src/lib/providers/codex-runtime-options";
import { homedir } from "node:os";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import {
  buildRuntimeProcessEnv,
  parseBooleanEnv,
  parseSemverVersion,
  probeExecutableVersion,
} from "./runtime-shared";

const threadByTask = new Map<string, Thread>();
const threadIdByTask = new Map<string, string>();

const SUPPORTED_CODEX_SDK_VERSION = "0.118.0";
const SUPPORTED_CODEX_CLI_VERSION = "0.118.0";
const CODEX_LOOKUP_PATHS = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;

function resolveSandboxMode(args: {
  runtimeValue?: "read-only" | "workspace-write" | "danger-full-access";
  envValue?: string;
  planMode?: boolean;
  fallback: "read-only" | "workspace-write" | "danger-full-access";
}) {
  return resolveEffectiveCodexSandboxMode({
    sandboxMode: args.runtimeValue ?? args.envValue,
    planMode: args.planMode,
    fallback: args.fallback,
  });
}

export function resolveApprovalPolicy(args: {
  runtimeValue?: "never" | "on-request" | "untrusted";
  envValue?: string;
  planMode?: boolean;
  fallback?: "never" | "on-request" | "untrusted";
}): "never" | "on-request" | "untrusted" | undefined {
  const candidate = args.runtimeValue ?? args.envValue;
  if (candidate !== "never" && candidate !== "on-request" && candidate !== "untrusted") {
    return args.fallback == null
      ? undefined
      : resolveEffectiveCodexApprovalPolicy({
        planMode: args.planMode,
        fallback: args.fallback,
      });
  }
  return resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: candidate,
    planMode: args.planMode,
    fallback: args.fallback,
  });
}

function toCodexUserFacingErrorMessage(args: { message: string }) {
  const lower = args.message.toLowerCase();
  if (lower.includes("auth") || lower.includes("api key") || lower.includes("login") || lower.includes("unauthorized")) {
    return "Codex authentication failed. Run `codex login` and retry.";
  }
  if (lower.includes("rate limit") || lower.includes("quota") || lower.includes("insufficient_quota")) {
    return "Codex rate limit/quota reached. Retry after reset or check account limits.";
  }
  if (lower.includes("billing") || lower.includes("payment")) {
    return "Codex billing/subscription issue detected. Check account payment status.";
  }
  if (
    lower.includes("failed to refresh available models")
    || lower.includes("stream disconnected")
    || lower.includes("error sending request for url")
  ) {
    return "Codex network/model endpoint is unreachable. Check internet/proxy/firewall and retry.";
  }
  if (lower.includes("no prompt provided via stdin")) {
    return "Codex CLI did not receive prompt input. Check Codex CLI version and retry.";
  }
  return args.message;
}

function buildCodexEnv(args: { executablePath?: string } = {}) {
  return buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    extraPaths: CODEX_LOOKUP_PATHS,
  }) as Record<string, string>;
}

function buildCodexDiagnostics(args: { executablePath: string; taskId?: string }) {
  const env = buildCodexEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? probeExecutableVersion({
      executablePath: args.executablePath,
      env,
    })
    : null;
  return {
    taskId: args.taskId ?? "default",
    executablePath: args.executablePath || "<unresolved>",
    supportedSdkVersion: SUPPORTED_CODEX_SDK_VERSION,
    supportedCliVersion: SUPPORTED_CODEX_CLI_VERSION,
    versionProbe: versionProbe
      ? {
        status: versionProbe.status,
        signal: versionProbe.signal,
        error: versionProbe.error,
        stdout: versionProbe.stdout,
        stderr: versionProbe.stderr,
      }
      : null,
  };
}

export function buildCodexConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const config: Record<string, string | boolean> = {};
  const experimentalPlanMode = args.runtimeOptions?.codexExperimentalPlanMode === true;
  const summaryMode = args.runtimeOptions?.codexReasoningSummary;
  const supportsSummaries = args.runtimeOptions?.codexSupportsReasoningSummaries;
  const hasExplicitRawReasoningToggle = Object.prototype.hasOwnProperty.call(
    args.runtimeOptions ?? {},
    "codexShowRawAgentReasoning",
  );

  if (hasExplicitRawReasoningToggle) {
    config.show_raw_agent_reasoning = Boolean(args.runtimeOptions?.codexShowRawAgentReasoning);
  }
  if (summaryMode && summaryMode !== "auto") {
    config.model_reasoning_summary = summaryMode;
  }
  if (supportsSummaries === "enabled") {
    config.model_supports_reasoning_summaries = true;
  } else if (supportsSummaries === "disabled") {
    config.model_supports_reasoning_summaries = false;
  }

  const codexFastMode = args.runtimeOptions?.codexFastMode;
  if (codexFastMode !== undefined) {
    config["features.fast_mode"] = codexFastMode;
  }
  if (experimentalPlanMode) {
    config.collaboration_mode_kind = "plan";
    if (args.runtimeOptions?.codexModelReasoningEffort) {
      config.plan_mode_reasoning_effort = args.runtimeOptions.codexModelReasoningEffort;
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function buildThreadKey(args: {
  taskId?: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const experimentalPlanMode = args.runtimeOptions?.codexExperimentalPlanMode ? "plan1" : "plan0";
  const networkAccessEnabled = args.runtimeOptions?.codexNetworkAccessEnabled
    ?? parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: true,
    });
  const sandboxMode = resolveSandboxMode({
    runtimeValue: args.runtimeOptions?.codexSandboxMode,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    planMode: experimentalPlanMode === "plan1",
    fallback: "workspace-write",
  });
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
    planMode: experimentalPlanMode === "plan1",
    fallback: "on-request",
  });
  const skipGitRepoCheck = args.runtimeOptions?.codexSkipGitRepoCheck ? "nogit1" : "nogit0";
  const model = args.runtimeOptions?.model?.trim() || "model-default";
  const modelReasoningEffort = args.runtimeOptions?.codexModelReasoningEffort ?? "effort-default";
  const webSearchMode = args.runtimeOptions?.codexWebSearchMode ?? "websearch-default";
  const reasoningSummary = args.runtimeOptions?.codexReasoningSummary ?? "summary-auto";
  const supportsReasoningSummaries = args.runtimeOptions?.codexSupportsReasoningSummaries ?? "supports-auto";
  const showRawAgentReasoning = args.runtimeOptions?.codexShowRawAgentReasoning ? "raw1" : "raw0";
  return `${args.taskId ?? "default"}:${args.cwd}:${sandboxMode}:${skipGitRepoCheck}:${networkAccessEnabled ? "net1" : "net0"}:${approvalPolicy ?? "approval-default"}:${model}:${modelReasoningEffort}:${webSearchMode}:${reasoningSummary}:${supportsReasoningSummaries}:${showRawAgentReasoning}:${experimentalPlanMode}`;
}

function resolveThreadId(args: { threadKey: string; fallbackThreadId?: string }) {
  return threadIdByTask.get(args.threadKey) ?? args.fallbackThreadId?.trim();
}

function rememberThreadId(args: { threadKey: string; threadId?: string }) {
  const nextThreadId = args.threadId?.trim();
  if (!nextThreadId) {
    return;
  }
  threadIdByTask.set(args.threadKey, nextThreadId);
}

function parseVersionFromStdout(args: { stdout: string }) {
  const parsed = parseSemverVersion({ value: args.stdout });
  if (!parsed) {
    return null;
  }
  return [
    parsed.major,
    parsed.minor,
    parsed.patch,
  ] as const;
}

function compareVersion(a: readonly number[], b: readonly number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const aPart = a[index] ?? 0;
    const bPart = b[index] ?? 0;
    if (aPart !== bPart) {
      return aPart - bPart;
    }
  }
  return 0;
}

function isExecutableFile(args: { path: string }) {
  try {
    accessSync(args.path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexExecutablePath(args: { explicitPath?: string } = {}) {
  if (args.explicitPath?.trim()) {
    return args.explicitPath.trim();
  }

  const baseResolved = resolveExecutablePath({
    absolutePathEnvVar: "STAVE_CODEX_CLI_PATH",
    commandEnvVar: "STAVE_CODEX_CMD",
    defaultCommand: "codex",
    extraPaths: [...CODEX_LOOKUP_PATHS],
  }) ?? "";

  const candidates = [
    process.env.STAVE_CODEX_CLI_PATH?.trim() || "",
    `${homedir()}/.bun/bin/codex`,
    `${homedir()}/.local/bin/codex`,
    baseResolved,
  ].filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

  let selectedPath = baseResolved;
  let selectedVersion: readonly number[] | null = null;

  for (const candidate of candidates) {
    if (!isExecutableFile({ path: candidate })) {
      continue;
    }
    const env = buildCodexEnv({ executablePath: candidate });
    const versionProbe = probeExecutableVersion({
      executablePath: candidate,
      env,
    });
    if (versionProbe.status !== 0) {
      continue;
    }
    const parsed = parseVersionFromStdout({ stdout: versionProbe.stdout });
    if (!parsed) {
      if (!selectedPath) {
        selectedPath = candidate;
      }
      continue;
    }
    if (!selectedVersion || compareVersion(parsed, selectedVersion) > 0) {
      selectedPath = candidate;
      selectedVersion = parsed;
    }
  }

  return selectedPath;
}

// Tracks accumulated text length per item to emit only deltas for streaming.
const codexItemTextLength = new Map<string, number>();
const codexItemLastEmitTime = new Map<string, number>();
const CODEX_OUTPUT_THROTTLE_MS = 200;

/**
 * Codex plan item shape (not yet in SDK types but present in CLI exec JSONL).
 * When the SDK adds a `PlanItem` type this interface can be retired.
 */
interface CodexPlanItem {
  id: string;
  type: "plan";
  plan_markdown?: string;
  text?: string;
}

/**
 * Extract plan text from a `<proposed_plan>` block if the agent wrapped its
 * output in Codex plan-mode tags.  Returns `null` when no block is found.
 */
export function extractProposedPlan(text: string): string | null {
  const openTag = "<proposed_plan>";
  const closeTag = "</proposed_plan>";
  const openIdx = text.indexOf(openTag);
  if (openIdx === -1) return null;
  const contentStart = openIdx + openTag.length;
  const closeIdx = text.indexOf(closeTag, contentStart);
  if (closeIdx === -1) return null;
  return text.slice(contentStart, closeIdx).trim();
}

function buildCodexTodoToolInput(args: {
  items: Array<{ text?: string; completed?: boolean }>;
}) {
  return JSON.stringify({
    todos: args.items.map((item) => ({
      content: item.text ?? "",
      status: item.completed ? "completed" : "pending",
    })),
  });
}

export function buildCodexTodoPlanText(args: {
  items: Array<{ text?: string; completed?: boolean }>;
}): string | null {
  const lines = args.items
    .map((item) => {
      const text = item.text?.trim() ?? "";
      if (!text) {
        return null;
      }
      return `- [${item.completed ? "x" : " "}] ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return `## Draft Plan\n${lines.join("\n")}`;
}

export function resolveCodexPlanReadyText(args: {
  pendingMessageText?: string | null;
  latestTodoPlanText?: string | null;
}): string | null {
  const pendingText = args.pendingMessageText?.trim() ?? "";
  if (pendingText) {
    return extractProposedPlan(pendingText) ?? pendingText;
  }

  const todoPlanText = args.latestTodoPlanText?.trim() ?? "";
  return todoPlanText || null;
}

export function mapCodexItemEvent(args: {
  lifecycle: "item.started" | "item.updated" | "item.completed";
  item: ThreadItem | CodexPlanItem;
}): BridgeEvent[] {
  const { item, lifecycle } = args;
  const itemId = (item as { id?: string }).id ?? "";

  switch (item.type) {
    // ── Structured plan item (Codex CLI exec JSONL, not yet in SDK types) ──
    case "plan": {
      const planItem = item as CodexPlanItem;
      const planText = (planItem.plan_markdown ?? planItem.text ?? "").trim();
      if (lifecycle === "item.completed") {
        codexItemTextLength.delete(itemId);
        return planText ? [{ type: "plan_ready", planText }] : [];
      }
      // For started/updated, stream the plan text as regular text so the
      // user can see progress while the plan is being generated.
      if (!planText) return [];
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = planText.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, planText.length);
      return [{ type: "text", text: delta, segmentId: itemId || undefined }];
    }

    case "agent_message": {
      if (lifecycle === "item.completed") {
        const prev = codexItemTextLength.get(itemId) ?? 0;
        codexItemTextLength.delete(itemId);
        const full = item.text ?? "";

        // Detect <proposed_plan> block from plan-mode collaboration output.
        // When the model wraps its response in plan tags the CLI may still
        // emit it as a plain agent_message (especially in exec mode where
        // the structured plan item isn't surfaced yet).
        const proposedPlan = extractProposedPlan(full);
        if (proposedPlan) {
          // Emit trailing text delta first so the streaming view is complete,
          // then emit plan_ready so the plan viewer picks it up.
          const delta = full.slice(prev);
          const events: BridgeEvent[] = [];
          if (delta) events.push({ type: "text", text: delta, segmentId: itemId || undefined });
          events.push({ type: "plan_ready", planText: proposedPlan });
          return events;
        }

        const delta = full.slice(prev);
        return delta ? [{ type: "text", text: delta, segmentId: itemId || undefined }] : [];
      }
      // item.started / item.updated — emit delta for streaming.
      const full = item.text ?? "";
      if (!full) {
        return [];
      }
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = full.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, full.length);
      return [{ type: "text", text: delta, segmentId: itemId || undefined }];
    }
    case "reasoning": {
      if (lifecycle === "item.completed") {
        const prev = codexItemTextLength.get(itemId) ?? 0;
        codexItemTextLength.delete(itemId);
        const full = item.text ?? "";
        const delta = full.slice(prev);
        return [{ type: "thinking", text: delta, isStreaming: false }];
      }
      // item.started / item.updated — emit delta for streaming
      const full = item.text ?? "";
      if (!full) return [];
      const prev = codexItemTextLength.get(itemId) ?? 0;
      const delta = full.slice(prev);
      if (!delta) return [];
      codexItemTextLength.set(itemId, full.length);
      return [{ type: "thinking", text: delta, isStreaming: true }];
    }
    case "command_execution": {
      const events: BridgeEvent[] = [];
      if (lifecycle === "item.started" && item.command) {
        events.push({
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: "bash",
          input: item.command,
          state: "input-available",
        });
      }
      if (
        lifecycle === "item.updated"
        && itemId
        && typeof item.aggregated_output === "string"
        && item.aggregated_output.length > 0
      ) {
        const now = Date.now();
        const lastEmitAt = codexItemLastEmitTime.get(itemId) ?? 0;
        if (now - lastEmitAt >= CODEX_OUTPUT_THROTTLE_MS) {
          codexItemLastEmitTime.set(itemId, now);
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output: item.aggregated_output,
            isPartial: true,
          });
        }
      }
      if (lifecycle === "item.completed" && (item.status === "completed" || item.status === "failed")) {
        codexItemLastEmitTime.delete(itemId);
        if (itemId) {
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output: item.aggregated_output ?? "",
            ...(item.status === "failed" ? { isError: true } : {}),
          });
        } else {
          events.push({
            type: "tool",
            toolName: "bash",
            input: item.command ?? "",
            output: item.aggregated_output ?? "",
            state: item.status === "failed" ? "output-error" : "output-available",
          });
        }
      }
      return events;
    }
    case "mcp_tool_call": {
      const toolLabel = `${item.server ?? "mcp"}:${item.tool ?? "tool"}`;
      const events: BridgeEvent[] = [];
      if (lifecycle === "item.started") {
        events.push({
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: toolLabel,
          input: toText(item.arguments ?? {}),
          state: "input-available",
        });
      }
      if (lifecycle === "item.completed" && (item.status === "completed" || item.status === "failed")) {
        const isFailed = item.status === "failed";
        const output = item.error?.message
          ? `[error] ${item.error.message}`
          : toText(item.result ?? "");
        if (itemId) {
          events.push({
            type: "tool_result",
            tool_use_id: itemId,
            output,
            ...(isFailed ? { isError: true } : {}),
          });
        } else {
          events.push({
            type: "tool",
            toolName: toolLabel,
            input: toText(item.arguments ?? {}),
            output,
            state: isFailed ? "output-error" : "output-available",
          });
        }
      }
      return events;
    }
    case "web_search": {
      if (lifecycle === "item.started") {
        return [{
          type: "tool",
          ...(itemId ? { toolUseId: itemId } : {}),
          toolName: "web_search",
          input: item.query ?? "",
          state: "input-available",
        }];
      }
      if (lifecycle === "item.completed") {
        if (itemId) {
          return [{ type: "tool_result", tool_use_id: itemId, output: "" }];
        }
        return [{
          type: "tool",
          toolName: "web_search",
          input: item.query ?? "",
          output: "",
          state: "output-available",
        }];
      }
      return [];
    }
    case "file_change": {
      if (lifecycle !== "item.completed") return [];
      if (item.status === "failed") {
        return [{
          type: "error",
          message: `File change failed: ${(item.changes ?? []).map((c) => c.path ?? "").filter(Boolean).join(", ")}`,
          recoverable: false,
        }];
      }
      return [];
    }
    case "todo_list": {
      const input = buildCodexTodoToolInput({ items: item.items ?? [] });
      return [{
        type: "tool",
        ...(itemId ? { toolUseId: itemId } : {}),
        toolName: "TodoWrite",
        input,
        ...(lifecycle === "item.completed"
          ? { state: "output-available" as const }
          : { state: "input-streaming" as const }),
      }];
    }
    case "error":
      return [{ type: "error", message: item.message ?? "Codex item error.", recoverable: false }];
    default:
      return [];
  }
}

function ensureThread(args: {
  codex: InstanceType<typeof import("@openai/codex-sdk").Codex>;
  taskId?: string;
  cwd: string;
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Thread {
  const experimentalPlanMode = args.runtimeOptions?.codexExperimentalPlanMode === true;
  const networkAccessEnabled = args.runtimeOptions?.codexNetworkAccessEnabled
    ?? parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: true,
    });
  const sandboxMode = resolveSandboxMode({
    runtimeValue: args.runtimeOptions?.codexSandboxMode,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    planMode: experimentalPlanMode,
    fallback: "workspace-write",
  });
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
    planMode: experimentalPlanMode,
    fallback: "on-request",
  });
  const threadKey = buildThreadKey({
    taskId: args.taskId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });
  const existing = threadByTask.get(threadKey);
  if (existing) {
    return existing;
  }
  const resumeThreadId = resolveThreadId({
    threadKey,
    fallbackThreadId: experimentalPlanMode
      ? undefined
      : resolveProviderResumeConversationId({
        conversation: args.conversation,
        fallbackResumeId: args.runtimeOptions?.codexResumeThreadId,
      }),
  });
  const threadOptions = {
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    workingDirectory: args.cwd,
    sandboxMode,
    ...(args.runtimeOptions?.codexSkipGitRepoCheck ? { skipGitRepoCheck: true } : {}),
    networkAccessEnabled,
    ...(args.runtimeOptions?.codexModelReasoningEffort ? { modelReasoningEffort: args.runtimeOptions.codexModelReasoningEffort } : {}),
    ...(args.runtimeOptions?.codexWebSearchMode ? { webSearchMode: args.runtimeOptions.codexWebSearchMode } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
  };
  const thread = resumeThreadId
    ? args.codex.resumeThread(resumeThreadId, threadOptions)
    : args.codex.startThread(threadOptions);
  rememberThreadId({ threadKey, threadId: resumeThreadId });
  threadByTask.set(threadKey, thread);
  return thread;
}

export function cleanupCodexTask(taskId: string) {
  const keyPrefix = `${taskId}:`;
  for (const threadKey of threadByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadByTask.delete(threadKey);
    }
  }
  for (const threadKey of threadIdByTask.keys()) {
    if (threadKey.startsWith(keyPrefix)) {
      threadIdByTask.delete(threadKey);
    }
  }
}

export async function streamCodexWithSdk(args: StreamTurnArgs & {
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
}): Promise<BridgeEvent[] | null> {
  let diagnostics: ReturnType<typeof buildCodexDiagnostics> | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@openai/codex-sdk");
    const CodexCtor = mod.Codex as (typeof import("@openai/codex-sdk").Codex) | undefined;
    if (!CodexCtor) {
      const unavailableEvents: BridgeEvent[] = [
        {
          type: "error",
          message: "Codex runtime failure: Codex class is unavailable from SDK import.",
          recoverable: false,
        },
        { type: "done" },
      ];
      unavailableEvents.forEach((event) => args.onEvent?.(event));
      return unavailableEvents;
    }

    const codexExecutablePath = resolveCodexExecutablePath({
      explicitPath: args.runtimeOptions?.codexPathOverride,
    });
    diagnostics = buildCodexDiagnostics({ executablePath: codexExecutablePath ?? "", taskId: args.taskId });
    if (!codexExecutablePath) {
      const unavailableEvents: BridgeEvent[] = [
        {
          type: "error",
          message: "Codex runtime failure: Codex CLI not found in runtime override, STAVE_CODEX_CLI_PATH, login-shell PATH, or home-bin candidates. Install `codex` or configure a Codex path override.",
          recoverable: true,
        },
        { type: "done" },
      ];
      unavailableEvents.forEach((event) => args.onEvent?.(event));
      return unavailableEvents;
    }

    const codexConfig = buildCodexConfigOverrides({ runtimeOptions: args.runtimeOptions });
    const codex = new CodexCtor({
      codexPathOverride: codexExecutablePath,
      env: buildCodexEnv({ executablePath: codexExecutablePath }),
      ...(codexConfig ? { config: codexConfig } : {}),
    });
    const threadKey = buildThreadKey({
      taskId: args.taskId,
      cwd: runtimeCwd,
      runtimeOptions: args.runtimeOptions,
    });
    const thread = ensureThread({
      codex,
      taskId: args.taskId,
      cwd: runtimeCwd,
      conversation: args.conversation,
      runtimeOptions: args.runtimeOptions,
    });
    const abortController = new AbortController();
    args.registerAbort?.(() => abortController.abort());
    const turnOptions: TurnOptions = { signal: abortController.signal };
    let providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
    });

    // Inject response-style guidance into the prompt for Codex (which has no
    // separate system-prompt channel). Prepended so the model sees style rules
    // before the actual user request.
    const responseStyle = args.runtimeOptions?.responseStylePrompt?.trim();
    if (responseStyle) {
      providerPrompt = `<system>\n${responseStyle}\n</system>\n\n${providerPrompt}`;
    }

    const streamed = await thread.runStreamed(providerPrompt, turnOptions);

    const codexDebug = args.runtimeOptions?.debug ?? process.env.STAVE_CODEX_DEBUG === "1";
    const codexExperimentalPlanMode = args.runtimeOptions?.codexExperimentalPlanMode === true;
    const events: BridgeEvent[] = [];
    let sawExperimentalPlanTodo = false;
    let latestTodoPlanText: string | null = null;
    let pendingPlanMessageText: string | null = null;
    const emitBridgeEvent = (event: BridgeEvent) => {
      events.push(event);
      args.onEvent?.(event);
    };
    const emitBridgeEvents = (nextEvents: BridgeEvent[]) => {
      nextEvents.forEach(emitBridgeEvent);
    };
    const flushPendingPlanMessage = (asPlanReady: boolean) => {
      const planText = resolveCodexPlanReadyText({
        pendingMessageText: pendingPlanMessageText,
        latestTodoPlanText,
      });
      const rawText = pendingPlanMessageText?.trim() ?? "";
      pendingPlanMessageText = null;

      if (asPlanReady) {
        if (planText) {
          emitBridgeEvent({ type: "plan_ready", planText });
        }
        return;
      }

      // Even on an early flush (intermediate event arrived before
      // turn.completed), if the buffered text contains <proposed_plan>
      // tags we must emit plan_ready so the plan viewer gets the correct
      // content and the chat body isn't garbled with raw XML tags.
      const extractedPlan = rawText ? extractProposedPlan(rawText) : null;
      if (extractedPlan) {
        emitBridgeEvent({ type: "plan_ready", planText: extractedPlan });
        return;
      }

      if (rawText) {
        emitBridgeEvent({ type: "text", text: rawText });
      }
    };
    // Clear any stale delta-tracking state from a previous aborted turn.
    codexItemTextLength.clear();
    codexItemLastEmitTime.clear();
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    for await (const event of streamed.events) {
      const threadEvent = event as ThreadEvent;
      if (codexDebug) {
        console.debug("[codex-sdk-runtime] event", threadEvent.type, threadEvent);
      }
      if (
        codexExperimentalPlanMode
        && pendingPlanMessageText
        && !(threadEvent.type === "item.completed" && threadEvent.item.type === "agent_message")
        && threadEvent.type !== "turn.completed"
      ) {
        flushPendingPlanMessage(false);
      }
      switch (threadEvent.type) {
        case "turn.started":
          codexItemTextLength.clear();
          codexItemLastEmitTime.clear();
          sawExperimentalPlanTodo = false;
          latestTodoPlanText = null;
          pendingPlanMessageText = null;
          break;
        case "item.started":
        case "item.updated":
        case "item.completed": {
          if (codexExperimentalPlanMode && threadEvent.item.type === "todo_list") {
            sawExperimentalPlanTodo = true;
            latestTodoPlanText = buildCodexTodoPlanText({
              items: threadEvent.item.items ?? [],
            });
          }
          if (
            codexExperimentalPlanMode
            && threadEvent.type === "item.completed"
            && threadEvent.item.type === "agent_message"
            && (sawExperimentalPlanTodo || Boolean(extractProposedPlan(threadEvent.item.text ?? "")))
          ) {
            if (pendingPlanMessageText) {
              flushPendingPlanMessage(false);
            }
            pendingPlanMessageText = threadEvent.item.text ?? "";
            if (codexDebug) {
              console.debug("[codex-sdk-runtime] buffering final codex plan candidate");
            }
            break;
          }
          const mapped = mapCodexItemEvent({
            lifecycle: threadEvent.type,
            item: threadEvent.item,
          });
          if (
            threadEvent.type === "item.completed"
            && threadEvent.item.type === "file_change"
            && threadEvent.item.status === "completed"
          ) {
            const changedPaths = (threadEvent.item.changes ?? []).map((change) => change.path ?? "").filter(Boolean);
            const { diffEvents, unresolvedPaths } = await diffTracker.buildDiffEvents({ changedPaths });
            const fallbackEvents = diffTracker.buildFallbackEvents({
              appliedPaths: diffEvents.length === 0 ? changedPaths : [],
              skippedPaths: unresolvedPaths,
            });
            mapped.push(...diffEvents, ...fallbackEvents);
          }
          if (codexDebug) {
            console.debug("[codex-sdk-runtime] item", threadEvent.type, threadEvent.item.type, "→", mapped.map((e) => e.type));
          }
          emitBridgeEvents(mapped);
          break;
        }
        case "turn.failed":
          if (pendingPlanMessageText) {
            flushPendingPlanMessage(false);
          }
          emitBridgeEvent({
            type: "error",
            message: toCodexUserFacingErrorMessage({ message: threadEvent.error?.message ?? "Codex turn failed." }),
            recoverable: true,
          });
          emitBridgeEvent({ type: "done" });
          break;
        case "error":
          if (pendingPlanMessageText) {
            flushPendingPlanMessage(false);
          }
          emitBridgeEvent({
            type: "error",
            message: toCodexUserFacingErrorMessage({ message: threadEvent.message }),
            recoverable: true,
          });
          break;
        case "turn.completed":
          if (codexExperimentalPlanMode && (pendingPlanMessageText || latestTodoPlanText)) {
            flushPendingPlanMessage(true);
          }
          {
            const completedEvent = threadEvent as TurnCompletedEvent;
            emitBridgeEvent({
              type: "usage",
              inputTokens: completedEvent.usage.input_tokens,
              outputTokens: completedEvent.usage.output_tokens,
              ...(completedEvent.usage.cached_input_tokens > 0
                ? { cacheReadTokens: completedEvent.usage.cached_input_tokens }
                : {}),
            });
          }
          emitBridgeEvent({ type: "done" });
          break;
        case "thread.started":
          rememberThreadId({
            threadKey,
            threadId: threadEvent.thread_id,
          });
          if (!codexExperimentalPlanMode) {
            emitBridgeEvent({
              type: "provider_conversation",
              providerId: "codex",
              nativeConversationId: threadEvent.thread_id,
            });
          }
          break;
        default:
          if (codexDebug) {
            console.debug("[codex-sdk-runtime] unhandled event type", threadEvent.type);
          }
          break;
      }
    }

    if (events.length === 0) {
      const emptyEvents: BridgeEvent[] = [
        { type: "text", text: "No events returned from Codex SDK." },
        { type: "done" },
      ];
      emptyEvents.forEach((event) => args.onEvent?.(event));
      return emptyEvents;
    }

    if (events[events.length - 1]?.type !== "done") {
      events.push({ type: "done" });
      args.onEvent?.(events[events.length - 1]!);
    }

    return events;
  } catch (error) {
    console.warn("[provider-runtime] Codex SDK unavailable", error, diagnostics);
    const reason = toCodexUserFacingErrorMessage({ message: toText(error) });
    const failureEvents: BridgeEvent[] = [
      {
        type: "error",
        message: `Codex runtime failure: ${reason} | diagnostics=${toText(diagnostics)}`,
        recoverable: true,
      },
      { type: "done" },
    ];
    failureEvents.forEach((event) => args.onEvent?.(event));
    return failureEvents;
  }
}
