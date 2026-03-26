import type { BridgeEvent, StreamTurnArgs } from "./types";
import type { Thread, ThreadEvent, ThreadItem, TurnCompletedEvent, TurnOptions } from "@openai/codex-sdk";
import {
  buildExecutableLookupEnv,
  canExecutePath,
  resolveExecutablePath,
  toAsarUnpackedPath,
} from "./executable-path";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { toText } from "./utils";
import {
  buildProviderTurnPrompt,
  resolveProviderResumeConversationId,
} from "../../src/lib/providers/provider-request-translators";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const threadByTask = new Map<string, Thread>();
const threadIdByTask = new Map<string, string>();

const SUPPORTED_CODEX_SDK_VERSION = "0.116.0";
const SUPPORTED_CODEX_CLI_VERSION = "0.116.0";
const CODEX_LOOKUP_PATHS = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;
const moduleRequire = createRequire(import.meta.url);

function parseBooleanEnv(args: { value: string | undefined; fallback: boolean }) {
  const normalized = args.value?.trim().toLowerCase();
  if (!normalized) {
    return args.fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return args.fallback;
}

function resolveSandboxMode(args: {
  runtimeValue?: "read-only" | "workspace-write" | "danger-full-access";
  envValue?: string;
  fallback: "read-only" | "workspace-write" | "danger-full-access";
}) {
  const candidate = args.runtimeValue ?? args.envValue;
  if (candidate === "read-only" || candidate === "workspace-write" || candidate === "danger-full-access") {
    return candidate;
  }
  return args.fallback;
}

export function resolveApprovalPolicy(args: {
  runtimeValue?: "never" | "on-request" | "on-failure" | "untrusted";
  envValue?: string;
}): "never" | "on-request" | "on-failure" | "untrusted" | undefined {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate === "never"
    || candidate === "on-request"
    || candidate === "on-failure"
    || candidate === "untrusted"
  ) {
    return candidate;
  }
  return undefined;
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
  const nextEnv = { ...process.env };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  delete nextEnv.ELECTRON_NO_ATTACH_CONSOLE;
  delete nextEnv.ELECTRON_NO_ASAR;
  nextEnv.PATH = buildExecutableLookupEnv({
    baseEnv: nextEnv,
    extraPaths: [
      ...CODEX_LOOKUP_PATHS,
      args.executablePath ? path.dirname(args.executablePath) : "",
    ],
  }).PATH;
  return nextEnv as Record<string, string>;
}

function buildCodexDiagnostics(args: { executablePath: string; taskId?: string }) {
  const env = buildCodexEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? spawnSync(args.executablePath, ["--version"], {
      encoding: "utf8",
      env,
    })
    : null;
  return {
    taskId: args.taskId ?? "default",
    executablePath: args.executablePath || "<sdk-default>",
    supportedSdkVersion: SUPPORTED_CODEX_SDK_VERSION,
    supportedCliVersion: SUPPORTED_CODEX_CLI_VERSION,
    versionProbe: versionProbe
      ? {
        status: versionProbe.status,
        signal: versionProbe.signal,
        error: versionProbe.error ? String(versionProbe.error) : "",
        stdout: (versionProbe.stdout ?? "").trim(),
        stderr: (versionProbe.stderr ?? "").trim(),
      }
      : null,
  };
}

export function buildCodexConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const config: Record<string, string | boolean> = {};
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

  return Object.keys(config).length > 0 ? config : undefined;
}

function buildThreadKey(args: {
  taskId?: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const networkAccessEnabled = args.runtimeOptions?.codexNetworkAccessEnabled
    ?? parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: true,
    });
  const sandboxMode = resolveSandboxMode({
    runtimeValue: args.runtimeOptions?.codexSandboxMode,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    fallback: "workspace-write",
  });
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
  });
  const skipGitRepoCheck = args.runtimeOptions?.codexSkipGitRepoCheck ? "nogit1" : "nogit0";
  const model = args.runtimeOptions?.model?.trim() || "model-default";
  const modelReasoningEffort = args.runtimeOptions?.codexModelReasoningEffort ?? "effort-default";
  const webSearchMode = args.runtimeOptions?.codexWebSearchMode ?? "websearch-default";
  const reasoningSummary = args.runtimeOptions?.codexReasoningSummary ?? "summary-auto";
  const supportsReasoningSummaries = args.runtimeOptions?.codexSupportsReasoningSummaries ?? "supports-auto";
  const showRawAgentReasoning = args.runtimeOptions?.codexShowRawAgentReasoning ? "raw1" : "raw0";

  return `${args.taskId ?? "default"}:${args.cwd}:${sandboxMode}:${skipGitRepoCheck}:${networkAccessEnabled ? "net1" : "net0"}:${approvalPolicy ?? "approval-default"}:${model}:${modelReasoningEffort}:${webSearchMode}:${reasoningSummary}:${supportsReasoningSummaries}:${showRawAgentReasoning}`;
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
  const match = args.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [
    Number(match[1] ?? 0),
    Number(match[2] ?? 0),
    Number(match[3] ?? 0),
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

function resolveCodexTargetTriple() {
  const { platform, arch } = process;
  if (platform === "linux" || platform === "android") {
    if (arch === "x64") {
      return {
        targetTriple: "x86_64-unknown-linux-musl",
        platformPackage: "@openai/codex-linux-x64",
      } as const;
    }
    if (arch === "arm64") {
      return {
        targetTriple: "aarch64-unknown-linux-musl",
        platformPackage: "@openai/codex-linux-arm64",
      } as const;
    }
    return null;
  }
  if (platform === "darwin") {
    if (arch === "x64") {
      return {
        targetTriple: "x86_64-apple-darwin",
        platformPackage: "@openai/codex-darwin-x64",
      } as const;
    }
    if (arch === "arm64") {
      return {
        targetTriple: "aarch64-apple-darwin",
        platformPackage: "@openai/codex-darwin-arm64",
      } as const;
    }
    return null;
  }
  if (platform === "win32") {
    if (arch === "x64") {
      return {
        targetTriple: "x86_64-pc-windows-msvc",
        platformPackage: "@openai/codex-win32-x64",
      } as const;
    }
    if (arch === "arm64") {
      return {
        targetTriple: "aarch64-pc-windows-msvc",
        platformPackage: "@openai/codex-win32-arm64",
      } as const;
    }
  }
  return null;
}

function resolveBundledCodexExecutablePath() {
  const resolvedTarget = resolveCodexTargetTriple();
  if (!resolvedTarget) {
    return "";
  }

  try {
    const codexPackageJsonPath = moduleRequire.resolve("@openai/codex/package.json");
    const codexRequire = createRequire(codexPackageJsonPath);
    const platformPackageJsonPath = codexRequire.resolve(`${resolvedTarget.platformPackage}/package.json`);
    const vendorRoot = path.join(path.dirname(platformPackageJsonPath), "vendor");
    const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
    return toAsarUnpackedPath(path.join(
      vendorRoot,
      resolvedTarget.targetTriple,
      "codex",
      binaryName,
    ));
  } catch {
    return "";
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
    resolveBundledCodexExecutablePath(),
  ].filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

  let selectedPath = baseResolved;
  let selectedVersion: readonly number[] | null = null;

  for (const candidate of candidates) {
    if (!isExecutableFile({ path: candidate })) {
      continue;
    }
    const env = buildCodexEnv({ executablePath: candidate });
    const versionProbe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      env,
    });
    if (versionProbe.status !== 0) {
      continue;
    }
    const parsed = parseVersionFromStdout({ stdout: versionProbe.stdout ?? "" });
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

export function mapCodexItemEvent(args: {
  lifecycle: "item.started" | "item.updated" | "item.completed";
  item: ThreadItem;
}): BridgeEvent[] {
  const { item, lifecycle } = args;
  const itemId = (item as { id?: string }).id ?? "";

  switch (item.type) {
    case "agent_message": {
      if (lifecycle === "item.completed") {
        const prev = codexItemTextLength.get(itemId) ?? 0;
        codexItemTextLength.delete(itemId);
        const full = item.text ?? "";
        const delta = full.slice(prev);
        return delta ? [{ type: "text", text: delta }] : [];
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
      return [{ type: "text", text: delta }];
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
      if (lifecycle === "item.started") {
        const paths = (item.changes ?? []).map((change) => change.path ?? "").filter(Boolean);
        if (paths.length > 0) {
          return [{ type: "system", content: `Modifying: ${paths.join(", ")}` }];
        }
      }
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
  const networkAccessEnabled = args.runtimeOptions?.codexNetworkAccessEnabled
    ?? parseBooleanEnv({
      value: process.env.STAVE_CODEX_NETWORK_ACCESS,
      fallback: true,
    });
  const sandboxMode = resolveSandboxMode({
    runtimeValue: args.runtimeOptions?.codexSandboxMode,
    envValue: process.env.STAVE_CODEX_SANDBOX_MODE?.trim(),
    fallback: "workspace-write",
  });
  const approvalPolicy = resolveApprovalPolicy({
    runtimeValue: args.runtimeOptions?.codexApprovalPolicy,
    envValue: process.env.STAVE_CODEX_APPROVAL_POLICY?.trim(),
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
    fallbackThreadId: resolveProviderResumeConversationId({
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

    const codexConfig = buildCodexConfigOverrides({ runtimeOptions: args.runtimeOptions });
    const codex = new CodexCtor({
      ...(codexExecutablePath ? { codexPathOverride: codexExecutablePath } : {}),
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
    const providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
    });
    const streamed = await thread.runStreamed(providerPrompt, turnOptions);

    const codexDebug = args.runtimeOptions?.debug ?? process.env.STAVE_CODEX_DEBUG === "1";
    const events: BridgeEvent[] = [];
    // Clear any stale delta-tracking state from a previous aborted turn.
    codexItemTextLength.clear();
    codexItemLastEmitTime.clear();
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    for await (const event of streamed.events) {
      const threadEvent = event as ThreadEvent;
      if (codexDebug) {
        console.debug("[codex-sdk-runtime] event", threadEvent.type, threadEvent);
      }
      switch (threadEvent.type) {
        case "turn.started":
          codexItemTextLength.clear();
          codexItemLastEmitTime.clear();
          break;
        case "item.started":
        case "item.updated":
        case "item.completed": {
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
          events.push(...mapped);
          mapped.forEach((itemEvent) => args.onEvent?.(itemEvent));
          break;
        }
        case "turn.failed":
          events.push({
            type: "error",
            message: toCodexUserFacingErrorMessage({ message: threadEvent.error?.message ?? "Codex turn failed." }),
            recoverable: true,
          });
          args.onEvent?.(events[events.length - 1]!);
          events.push({ type: "done" });
          args.onEvent?.(events[events.length - 1]!);
          break;
        case "error":
          events.push({
            type: "error",
            message: toCodexUserFacingErrorMessage({ message: threadEvent.message }),
            recoverable: true,
          });
          args.onEvent?.(events[events.length - 1]!);
          break;
        case "turn.completed":
          {
            const completedEvent = threadEvent as TurnCompletedEvent;
            events.push({
              type: "usage",
              inputTokens: completedEvent.usage.input_tokens,
              outputTokens: completedEvent.usage.output_tokens,
              ...(completedEvent.usage.cached_input_tokens > 0
                ? { cacheReadTokens: completedEvent.usage.cached_input_tokens }
                : {}),
            });
            args.onEvent?.(events[events.length - 1]!);
          }
          events.push({ type: "done" });
          args.onEvent?.(events[events.length - 1]!);
          break;
        case "thread.started":
          rememberThreadId({
            threadKey,
            threadId: threadEvent.thread_id,
          });
          events.push({
            type: "provider_conversation",
            providerId: "codex",
            nativeConversationId: threadEvent.thread_id,
          });
          args.onEvent?.(events[events.length - 1]!);
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
