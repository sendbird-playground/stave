import type { BridgeEvent, StreamTurnArgs } from "./types";
import { buildProviderTurnPrompt, resolveProviderResumeConversationId } from "../../src/lib/providers/provider-request-translators";
import {
  MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
  sanitizeTextField,
} from "../../src/lib/file-context-sanitization";
import { parsePullRequestSuggestionResponse } from "../../src/lib/source-control-pr";
import type {
  ClaudeContextUsageResponse,
  ClaudeMcpServerStatusSnapshot,
  ClaudePluginReloadResponse,
} from "../../src/lib/providers/provider.types";
import type {
  CanUseTool,
  McpServerStatus,
  Query,
  SDKMessage,
  SDKAssistantMessage,
  SDKControlGetContextUsageResponse,
  SDKControlReloadPluginsResponse,
  SDKSystemMessage,
  SDKResultMessage,
  SettingSource,
  SlashCommand,
} from "@anthropic-ai/claude-agent-sdk";
import { toText } from "./utils";
import { createTurnDiffTracker } from "./turn-diff-tracker";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { canExecutePath, resolveExecutablePath } from "./executable-path";
import {
  buildRuntimeProcessEnv,
  compareSemverVersions,
  parseBooleanEnv,
  parseSemverVersion,
  probeExecutableVersion,
  summarizePathHead,
} from "./runtime-shared";

/** SDK-level permission modes accepted by the claude-agent-sdk query() API. */
type ClaudePermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

const ClaudePermissionResultSchema = z.union([
  z.object({
    behavior: z.literal("allow"),
    updatedInput: z.record(z.string(), z.unknown()),
    updatedPermissions: z.array(z.unknown()).optional(),
  }),
  z.object({
    behavior: z.literal("deny"),
    message: z.string(),
    interrupt: z.boolean().optional(),
  }),
]);

type ClaudePermissionResult = z.infer<typeof ClaudePermissionResultSchema>;
const CLAUDE_LOOKUP_PATHS = [
  `${homedir()}/.claude/local`,
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;

function resolveClaudePermissionMode(args: {
  runtimeValue?: ClaudePermissionMode;
  envValue?: string;
  fallback: ClaudePermissionMode;
}): ClaudePermissionMode {
  const candidate = args.runtimeValue ?? args.envValue;
  if (
    candidate === "default"
    || candidate === "acceptEdits"
    || candidate === "bypassPermissions"
    || candidate === "plan"
    || candidate === "dontAsk"
  ) {
    return candidate;
  }
  return args.fallback;
}

function probeClaudeExecutable(args: { path: string }) {
  const env = buildRuntimeProcessEnv({
    executablePath: args.path,
    extraPaths: CLAUDE_LOOKUP_PATHS,
  });
  const result = probeExecutableVersion({
    executablePath: args.path,
    env,
  });
  if (result.status !== 0) {
    return null;
  }
  const version = parseSemverVersion({ value: result.text });
  return {
    path: args.path,
    version,
    raw: result.text,
  };
}

export function resolveClaudeExecutablePath() {
  const baseResolved = resolveExecutablePath({
    absolutePathEnvVar: "STAVE_CLAUDE_CLI_PATH",
    absolutePathEnvVars: ["CLAUDE_CODE_PATH"],
    commandEnvVar: "STAVE_CLAUDE_CMD",
    defaultCommand: "claude",
    extraPaths: [...CLAUDE_LOOKUP_PATHS],
  }) ?? "";

  const candidates = [
    process.env.STAVE_CLAUDE_CLI_PATH,
    process.env.CLAUDE_CODE_PATH,
    `${homedir()}/.claude/local/claude`,
    `${homedir()}/.bun/bin/claude`,
    `${homedir()}/.local/bin/claude`,
    baseResolved,
  ]
    .map((value) => value?.trim())
    .filter((value, index, entries): value is string => Boolean(value) && entries.indexOf(value) === index);

  const available = candidates
    .filter((candidate) => canExecutePath({ path: candidate }))
    .map((candidate) => probeClaudeExecutable({ path: candidate }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (available.length === 0) {
    return "";
  }

  available.sort((left, right) => {
    if (left.version && right.version) {
      return compareSemverVersions(right.version, left.version);
    }
    if (left.version) {
      return -1;
    }
    if (right.version) {
      return 1;
    }
    return 0;
  });

  return available[0]?.path ?? "";
}

export function buildClaudeEnv(args: { executablePath: string }) {
  return buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    extraPaths: CLAUDE_LOOKUP_PATHS,
    unsetEnvKeys: ["CLAUDECODE"],
  });
}

function buildClaudeDiagnostics(args: {
  executablePath: string;
  taskId?: string;
  cwd: string;
}) {
  const env = buildClaudeEnv({ executablePath: args.executablePath });
  const versionProbe = args.executablePath
    ? probeExecutableVersion({
      executablePath: args.executablePath,
      env,
    })
    : null;

  return {
    taskId: args.taskId ?? "default",
    cwd: args.cwd,
    executablePath: args.executablePath || "<sdk-default>",
    executableExists: args.executablePath ? canExecutePath({ path: args.executablePath }) : null,
    envPathHead: summarizePathHead({ value: env.PATH }),
    electronEnv: {
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE ?? "",
      ELECTRON_NO_ATTACH_CONSOLE: process.env.ELECTRON_NO_ATTACH_CONSOLE ?? "",
      ELECTRON_NO_ASAR: process.env.ELECTRON_NO_ASAR ?? "",
    },
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

function normalizeClaudeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function validateClaudePermissionResult(args: {
  candidate: ClaudePermissionResult;
  fallbackMessage: string;
  context: string;
}): ClaudePermissionResult {
  const parsed = ClaudePermissionResultSchema.safeParse(args.candidate);
  if (parsed.success) {
    return parsed.data;
  }
  console.warn("[claude-sdk-runtime] invalid permission callback result; falling back to deny", {
    context: args.context,
    error: parsed.error.flatten(),
  });
  return {
    behavior: "deny",
    message: args.fallbackMessage,
  };
}

function buildClaudeDenyPermissionResult(args: {
  message: string;
  context: string;
  interrupt?: boolean;
}): ClaudePermissionResult {
  return validateClaudePermissionResult({
    candidate: {
      behavior: "deny",
      message: args.message,
      ...(typeof args.interrupt === "boolean" ? { interrupt: args.interrupt } : {}),
    },
    fallbackMessage: args.message,
    context: args.context,
  });
}

export function buildClaudeSystemPrompt(args: {
  cwd: string;
  baseSystemPrompt?: string;
  responseStylePrompt?: string;
}) {
  const workspacePrompt = [
    "Stave workspace context:",
    `Current workspace root: ${args.cwd}`,
    "Resolve every relative filesystem path against the workspace root above.",
    "Do not rewrite a user-provided relative path like ./docs into a sibling directory outside that workspace root.",
    "If the user explicitly asks to access a path outside the workspace root, keep the exact requested path and request approval instead of guessing a nearby absolute path.",
  ].join("\n");

  const parts: string[] = [];
  const baseSystemPrompt = args.baseSystemPrompt?.trim();
  if (baseSystemPrompt) {
    parts.push(baseSystemPrompt);
  }
  const responseStyle = args.responseStylePrompt?.trim();
  if (responseStyle) {
    parts.push(responseStyle);
  }
  parts.push(workspacePrompt);
  return parts.join("\n\n");
}

function extractClaudeTerminalIssue(args: { stdoutTail: string }) {
  const source = args.stdoutTail;
  if (source.includes("\"error\":\"rate_limit\"") || source.includes("\"rate_limit_event\"")) {
    const quoted = source.match(/"You've hit your limit[^"]*"/);
    if (quoted?.[0]) {
      return quoted[0].slice(1, -1);
    }
    return null;
  }
  if (source.includes("\"error\":\"authentication_failed\"")) {
    return "Claude authentication failed. Run `claude auth login` and retry.";
  }
  if (source.includes("\"error\":\"billing_error\"")) {
    return "Claude billing/subscription issue detected. Check plan/payment status and retry.";
  }
  return null;
}

function summarizeClaudePermissionRequest(args: {
  toolName: string;
  input: Record<string, unknown>;
  decisionReason?: string;
  blockedPath?: string;
}) {
  const details: string[] = [];
  if (args.decisionReason?.trim()) {
    details.push(args.decisionReason.trim());
  }
  if (args.blockedPath?.trim()) {
    details.push(`Blocked path: ${args.blockedPath.trim()}`);
  }
  const renderedInput = toText(args.input ?? {}).trim();
  if (renderedInput) {
    details.push(`Input: ${renderedInput}`);
  }
  return details.length > 0
    ? sanitizeTextField({
        value: details.join("\n"),
        label: "approval description",
        maxChars: MAX_PROVIDER_APPROVAL_DESCRIPTION_CHARS,
      })
    : `Claude requested permission to run ${args.toolName}.`;
}

function parseClaudeQuestionList(args: { input: Record<string, unknown> }) {
  const rawQuestions = args.input.questions;
  if (!Array.isArray(rawQuestions)) {
    return [];
  }
  return rawQuestions.flatMap((rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return [];
    }
    const candidate = rawQuestion as Record<string, unknown>;
    const question = typeof candidate.question === "string" ? candidate.question : "";
    const header = typeof candidate.header === "string" ? candidate.header : "";
    const options = Array.isArray(candidate.options)
      ? candidate.options.flatMap((rawOption) => {
        if (!rawOption || typeof rawOption !== "object") {
          return [];
        }
        const option = rawOption as Record<string, unknown>;
        if (typeof option.label !== "string" || typeof option.description !== "string") {
          return [];
        }
        return [{
          label: option.label,
          description: option.description,
        }];
      })
      : [];
    if (!question || !header || options.length === 0) {
      return [];
    }
    return [{
      question,
      header,
      options,
      ...(typeof candidate.multiSelect === "boolean" ? { multiSelect: candidate.multiSelect } : {}),
    }];
  });
}

function waitForClaudeToolDecision<T>(args: {
  signal: AbortSignal;
  register: (resolve: (value: T) => void) => () => void;
}) {
  return new Promise<T>((resolve, reject) => {
    if (args.signal.aborted) {
      reject(new Error("Claude tool permission request aborted."));
      return;
    }
    const cleanup = args.register((value) => {
      args.signal.removeEventListener("abort", handleAbort);
      resolve(value);
    });
    const handleAbort = () => {
      cleanup();
      reject(new Error("Claude tool permission request aborted."));
    };
    args.signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function buildClaudeApprovalPermissionResult(args: {
  approved: boolean;
  normalizedInput: Record<string, unknown>;
  denialMessage: string;
}): ClaudePermissionResult {
  if (!args.approved) {
    return buildClaudeDenyPermissionResult({
      message: args.denialMessage,
      context: "approval:deny",
    });
  }

  // The installed SDK runtime validates successful permission results more
  // strictly than its published TypeScript surface. Returning the current
  // input avoids a malformed allow response when no input changes are needed.
  return validateClaudePermissionResult({
    candidate: {
      behavior: "allow",
      updatedInput: args.normalizedInput,
    },
    fallbackMessage: args.denialMessage,
    context: "approval:allow",
  });
}

export function buildClaudeUserInputPermissionResult(args: {
  normalizedInput: Record<string, unknown>;
  answers?: Record<string, string>;
  denied?: boolean;
}): ClaudePermissionResult {
  if (args.denied) {
    return buildClaudeDenyPermissionResult({
      message: "User declined to answer questions.",
      context: "user-input:deny",
    });
  }

  return validateClaudePermissionResult({
    candidate: {
      behavior: "allow",
      updatedInput: {
        ...args.normalizedInput,
        answers: args.answers ?? {},
      },
    },
    fallbackMessage: "User declined to answer questions.",
    context: "user-input:allow",
  });
}

function toClaudeThinkingConfig(thinkingMode?: "adaptive" | "enabled" | "disabled") {
  if (thinkingMode === "adaptive") {
    return { type: "adaptive" as const };
  }
  if (thinkingMode === "enabled") {
    return { type: "enabled" as const };
  }
  if (thinkingMode === "disabled") {
    return { type: "disabled" as const };
  }
  return undefined;
}

export function resolveClaudeAgentProgressSummaries(value?: boolean) {
  return typeof value === "boolean" ? value : undefined;
}

function resolveClaudeSettingSources(value?: NonNullable<StreamTurnArgs["runtimeOptions"]>["claudeSettingSources"]) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: SettingSource[] = [];
  value.forEach((source) => {
    if ((source === "user" || source === "project" || source === "local") && !normalized.includes(source)) {
      normalized.push(source);
    }
  });
  return normalized;
}

function resolveClaudeTaskBudget(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return { total: Math.floor(value) };
}

function buildClaudeQueryOptions(args: {
  cwd: string;
  claudeExecutablePath: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  resume?: string;
  systemPrompt?: string;
  includePartialMessages?: boolean;
  promptSuggestions?: boolean;
  canUseTool?: CanUseTool;
}) {
  const permissionMode = resolveClaudePermissionMode({
    runtimeValue: args.runtimeOptions?.claudePermissionMode,
    envValue: process.env.STAVE_CLAUDE_PERMISSION_MODE?.trim(),
    fallback: "acceptEdits",
  });
  const allowDangerouslySkipPermissions = args.runtimeOptions?.claudeAllowDangerouslySkipPermissions
    ?? parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS,
      fallback: permissionMode === "bypassPermissions",
    });
  const claudeSandboxEnabled = args.runtimeOptions?.claudeSandboxEnabled
    ?? parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_SANDBOX_ENABLED,
      fallback: false,
    });
  const claudeAllowUnsandboxedCommands = args.runtimeOptions?.claudeAllowUnsandboxedCommands
    ?? parseBooleanEnv({
      value: process.env.STAVE_CLAUDE_ALLOW_UNSANDBOXED_COMMANDS,
      fallback: true,
    });
  const thinking = toClaudeThinkingConfig(args.runtimeOptions?.claudeThinkingMode);
  const agentProgressSummaries = resolveClaudeAgentProgressSummaries(args.runtimeOptions?.claudeAgentProgressSummaries);
  const settingSources = resolveClaudeSettingSources(args.runtimeOptions?.claudeSettingSources);
  const taskBudget = resolveClaudeTaskBudget(args.runtimeOptions?.claudeTaskBudgetTokens);

  return {
    permissionMode,
    ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions } : {}),
    ...(args.resume ? { resume: args.resume } : {}),
    ...(args.includePartialMessages ? { includePartialMessages: true } : {}),
    promptSuggestions: args.promptSuggestions ?? false,
    cwd: args.cwd,
    ...(args.runtimeOptions?.model ? { model: args.runtimeOptions.model } : {}),
    ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    ...(typeof args.runtimeOptions?.claudeMaxTurns === "number" ? { maxTurns: args.runtimeOptions.claudeMaxTurns } : {}),
    ...(typeof args.runtimeOptions?.claudeMaxBudgetUsd === "number" ? { maxBudgetUsd: args.runtimeOptions.claudeMaxBudgetUsd } : {}),
    ...(taskBudget ? { taskBudget } : {}),
    ...(args.runtimeOptions?.claudeEffort ? { effort: args.runtimeOptions.claudeEffort } : {}),
    ...(thinking ? { thinking } : {}),
    ...(agentProgressSummaries !== undefined ? { agentProgressSummaries } : {}),
    ...(args.runtimeOptions?.claudeAllowedTools ? { allowedTools: args.runtimeOptions.claudeAllowedTools } : {}),
    ...(args.runtimeOptions?.claudeDisallowedTools ? { disallowedTools: args.runtimeOptions.claudeDisallowedTools } : {}),
    ...(settingSources !== undefined ? { settingSources } : {}),
    ...(args.runtimeOptions?.claudeFastMode ? { settings: { fastMode: true } } : {}),
    ...(args.canUseTool ? { canUseTool: args.canUseTool } : {}),
    sandbox: {
      enabled: claudeSandboxEnabled,
      allowUnsandboxedCommands: claudeAllowUnsandboxedCommands,
    },
    env: buildClaudeEnv({ executablePath: args.claudeExecutablePath }),
    ...(args.claudeExecutablePath.length > 0 ? { pathToClaudeCodeExecutable: args.claudeExecutablePath } : {}),
  };
}

function toClaudeMcpServerStatusSnapshot(status: McpServerStatus): ClaudeMcpServerStatusSnapshot {
  return {
    name: status.name,
    status: status.status,
    ...(status.error ? { error: status.error } : {}),
    ...(status.scope ? { scope: status.scope } : {}),
    ...(Array.isArray(status.tools) ? { toolCount: status.tools.length } : {}),
  };
}

function toClaudeContextUsageSnapshot(usage: SDKControlGetContextUsageResponse) {
  return {
    categories: usage.categories.map((category) => ({
      name: category.name,
      tokens: category.tokens,
      color: category.color,
      ...(category.isDeferred !== undefined ? { isDeferred: category.isDeferred } : {}),
    })),
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    rawMaxTokens: usage.rawMaxTokens,
    percentage: usage.percentage,
    model: usage.model,
    memoryFiles: usage.memoryFiles.map((file) => ({
      path: file.path,
      type: file.type,
      tokens: file.tokens,
    })),
    mcpTools: usage.mcpTools.map((tool) => ({
      name: tool.name,
      serverName: tool.serverName,
      tokens: tool.tokens,
      ...(tool.isLoaded !== undefined ? { isLoaded: tool.isLoaded } : {}),
    })),
  };
}

function toClaudePluginReloadSnapshot(reload: SDKControlReloadPluginsResponse) {
  return {
    commandCount: reload.commands.length,
    agentCount: reload.agents.length,
    plugins: reload.plugins.map((plugin) => ({
      name: plugin.name,
      path: plugin.path,
      ...(plugin.source ? { source: plugin.source } : {}),
    })),
    mcpServers: reload.mcpServers.map(toClaudeMcpServerStatusSnapshot),
    errorCount: reload.error_count,
  };
}

function buildClaudeTaskProgressEvents(message: SDKSystemMessage & {
  subtype?: string;
  summary?: string;
}) {
  if (message.subtype !== "task_progress") {
    return [];
  }
  const summary = message.summary?.trim();
  if (!summary) {
    return [];
  }
  return [{
    type: "system" as const,
    content: `Subagent progress: ${summary}`,
  }];
}

// ── Subagent progress tracking ────────────────────────────────────────────────
// Correlates task_progress SDK messages with their originating Agent tool_use_id
// using hook metadata (agent_id) when available, falling back to the most recent
// active Agent tool call.

function extractStringField(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const val = obj[key];
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;
}

function isAgentToolName(name: string): boolean {
  return name.trim().toLowerCase() === "agent";
}

export class SubagentProgressTracker {
  /** agent_id (from SDK hooks) → toolUseId (from tool events). */
  private readonly agentIdToToolUseId = new Map<string, string>();
  /** Ordered list of Agent tool_use_ids that have not yet received a result. */
  private readonly pendingAgentToolUseIds: string[] = [];

  /**
   * Call for every BridgeEvent that is about to be emitted so the tracker can
   * record Agent tool starts and completions.
   */
  trackEvent(event: BridgeEvent): void {
    if (event.type === "tool" && isAgentToolName(event.toolName) && event.toolUseId) {
      this.pendingAgentToolUseIds.push(event.toolUseId);
    }
    if (event.type === "tool_result") {
      const idx = this.pendingAgentToolUseIds.indexOf(event.tool_use_id);
      if (idx !== -1) {
        this.pendingAgentToolUseIds.splice(idx, 1);
      }
    }
  }

  /**
   * Extract agent_id / tool_use_id from hook-related SDK messages and persist
   * the mapping so future task_progress events can be resolved.
   */
  processRawMessage(message: Record<string, unknown>): void {
    const type = message.type;
    if (type !== "hook_started" && type !== "hook_response" && type !== "hook_progress") {
      return;
    }
    const input = (typeof message.input === "object" && message.input !== null)
      ? message.input as Record<string, unknown>
      : null;

    const agentId = extractStringField(message, "agent_id")
      ?? extractStringField(input, "agent_id");
    const toolUseId = extractStringField(message, "tool_use_id")
      ?? extractStringField(input, "tool_use_id");

    if (agentId && toolUseId) {
      this.agentIdToToolUseId.set(agentId, toolUseId);
    }
  }

  /**
   * Given a raw task_progress SDK message, determine which Agent tool_use_id
   * the progress belongs to.
   *
   * Resolution order:
   *  1. Direct `tool_use_id` field on the progress message
   *  2. `agent_id` field mapped through hook metadata
   *  3. Most recently started active Agent (positional heuristic)
   */
  resolveToolUseId(progressMessage: Record<string, unknown>): string | undefined {
    const directToolUseId = extractStringField(progressMessage, "tool_use_id");
    if (directToolUseId && this.pendingAgentToolUseIds.includes(directToolUseId)) {
      return directToolUseId;
    }

    const agentId = extractStringField(progressMessage, "agent_id");
    if (agentId) {
      const mapped = this.agentIdToToolUseId.get(agentId);
      if (mapped) {
        return mapped;
      }
    }

    // Fallback: last pending Agent tool_use_id
    return this.pendingAgentToolUseIds.at(-1);
  }
}

function buildClaudeUsageEvent(resultMsg: SDKResultMessage): BridgeEvent {
  return {
    type: "usage",
    inputTokens: resultMsg.usage.input_tokens,
    outputTokens: resultMsg.usage.output_tokens,
    ...(resultMsg.usage.cache_read_input_tokens != null
      ? { cacheReadTokens: resultMsg.usage.cache_read_input_tokens }
      : {}),
    ...(resultMsg.usage.cache_creation_input_tokens != null
      ? { cacheCreationTokens: resultMsg.usage.cache_creation_input_tokens }
      : {}),
    ...(typeof resultMsg.total_cost_usd === "number"
      ? { totalCostUsd: resultMsg.total_cost_usd }
      : {}),
  };
}

function toProviderSlashCommand(command: SlashCommand) {
  return {
    name: command.name,
    command: `/${command.name}`,
    description: command.description,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
  };
}

function resolveGitHeadRef(args: { cwd?: string }) {
  if (!args.cwd) {
    return undefined;
  }
  try {
    const output = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: args.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const gitRef = output.trim().split("\n")[0]?.trim();
    return gitRef || undefined;
  } catch {
    return undefined;
  }
}

export function mapClaudeMessageToEvents(args: {
  message: SDKMessage;
  claudeDebugStream: boolean;
  cwd?: string;
}): BridgeEvent[] {
  const { message, claudeDebugStream } = args;

  if (message.type === "system") {
    const sysMsg = message as SDKSystemMessage & { subtype?: string; content?: string; summary?: string };
    if (sysMsg.subtype === "local_command_output" && typeof sysMsg.content === "string" && sysMsg.content.trim()) {
      return [{ type: "text", text: sysMsg.content }];
    }
    if (sysMsg.subtype === "init" && typeof sysMsg.session_id === "string" && sysMsg.session_id.trim()) {
      return [{
        type: "provider_conversation",
        providerId: "claude-code",
        nativeConversationId: sysMsg.session_id,
      }];
    }
    if (sysMsg.subtype === "compact_boundary") {
      const meta = (sysMsg as { compact_metadata?: { trigger?: string } }).compact_metadata;
      const trigger = meta?.trigger ?? "auto";
      const gitRef = resolveGitHeadRef({ cwd: args.cwd });
      return [{
        type: "system",
        content: `Context compacted (${trigger}).`,
        compactBoundary: {
          trigger,
          ...(gitRef ? { gitRef } : {}),
        },
      }];
    }
    if (sysMsg.subtype === "status") {
      const status = (sysMsg as { status?: string | null }).status;
      if (status === "compacting") {
        return [{ type: "system", content: "Compacting conversation context\u2026" }];
      }
      return [];
    }
    const taskProgressEvents = buildClaudeTaskProgressEvents(sysMsg);
    if (taskProgressEvents.length > 0) {
      return taskProgressEvents;
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] system init", sysMsg.subtype, sysMsg.session_id);
    }
    return [];
  }

  if (message.type === "assistant") {
    const assistantMsg = message as SDKAssistantMessage;

    if (assistantMsg.error) {
      if (assistantMsg.error === "authentication_failed") {
        return [{ type: "text", text: "Claude authentication failed. Run `claude auth login` and retry." }];
      }
      if (assistantMsg.error === "billing_error") {
        return [{ type: "text", text: "Claude billing/subscription issue detected. Check plan/payment status and retry." }];
      }
    }

    // content is on the nested BetaMessage, not at the top level
    const contentBlocks = assistantMsg.message?.content;
    if (!Array.isArray(contentBlocks)) {
      return [];
    }

    const events: BridgeEvent[] = [];
    for (const block of contentBlocks) {
      const b = block as {
        type?: string;
        text?: string;
        thinking?: string;
        name?: string;
        input?: unknown;
      };
      if (b.type === "text" && b.text) {
        events.push({ type: "text", text: b.text });
        continue;
      }
      if (b.type === "thinking" && b.thinking) {
        events.push({ type: "thinking", text: b.thinking });
        continue;
      }
      if (b.type === "redacted_thinking") {
        // skip — redacted thinking is not surfaced to the user
        continue;
      }
      if (b.type === "tool_use") {
        if (b.name === "ExitPlanMode") {
          const planText = typeof (b.input as Record<string, unknown>)?.plan === "string"
            ? (b.input as Record<string, unknown>).plan as string
            : "";
          events.push({ type: "plan_ready", planText });
          continue;
        }
        const toolUseId = typeof (b as { id?: string }).id === "string"
          ? (b as { id: string }).id
          : undefined;
        events.push({
          type: "tool",
          ...(toolUseId ? { toolUseId } : {}),
          toolName: b.name ?? "tool_use",
          input: toText(b.input ?? {}),
          state: "input-available",
        });
        continue;
      }
    }
    return events;
  }

  if (message.type === "stream_event") {
    // SDKPartialAssistantMessage — streaming content deltas
    const streamMsg = message as { type: "stream_event"; event: unknown };
    const event = streamMsg.event;
    if (!event || typeof event !== "object") {
      return [];
    }
    const streamEvent = event as {
      type?: string;
      delta?: { type?: string; thinking?: string; text?: string };
      error?: { message?: string };
    };
    if (streamEvent.type === "content_block_delta") {
      if (streamEvent.delta?.type === "thinking_delta" && streamEvent.delta.thinking) {
        return [{ type: "thinking", text: streamEvent.delta.thinking, isStreaming: true }];
      }
      if (streamEvent.delta?.type === "text_delta" && streamEvent.delta.text) {
        return [{ type: "text", text: streamEvent.delta.text }];
      }
      return [];
    }
    if (streamEvent.type === "error") {
      return [{
        type: "error",
        message: `Claude stream error: ${toText(streamEvent.error ?? streamEvent)}`,
        recoverable: false,
      }];
    }
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] stream_event", streamEvent);
    }
    return [];
  }

  if (message.type === "user" || (message as { type: string }).type === "user_message_replay") {
    // Surface tool_result content blocks so the UI can populate subagent output.
    const userMsg = message as { type: string; message?: { content?: unknown } };
    const userContent = userMsg.message?.content;
    if (Array.isArray(userContent)) {
      const toolResultEvents: BridgeEvent[] = [];
      for (const block of userContent) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const b = block as { type?: string; tool_use_id?: string; content?: unknown };
        if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") {
          continue;
        }
        let output = "";
        if (typeof b.content === "string") {
          output = b.content;
        } else if (Array.isArray(b.content)) {
          output = b.content
            .flatMap((c: unknown) => {
              if (!c || typeof c !== "object") {
                return [];
              }
              const cb = c as { type?: string; text?: string };
              return cb.type === "text" && typeof cb.text === "string" ? [cb.text] : [];
            })
            .join("\n");
        }
        toolResultEvents.push({ type: "tool_result", tool_use_id: b.tool_use_id, output });
      }
      return toolResultEvents;
    }
    return [];
  }

  if (message.type === "prompt_suggestion") {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] prompt_suggestion", message);
    }
    const suggestion = (message as { suggestion?: string }).suggestion?.trim();
    if (!suggestion) {
      return [];
    }
    return [{ type: "prompt_suggestions", suggestions: [suggestion] }];
  }

  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    const events: BridgeEvent[] = [buildClaudeUsageEvent(resultMsg)];
    if (resultMsg.is_error) {
      const errorText = (resultMsg as { result?: string }).result;
      if (typeof errorText === "string" && errorText.length > 0) {
        events.unshift({ type: "text", text: errorText });
      }
    }
    return events;
  }

  if (message.type === "rate_limit_event") {
    const rlMsg = message as {
      type: "rate_limit_event";
      rate_limit_info?: {
        status?: string;
        resetsAt?: number;
        utilization?: number;
      };
    };
    const info = rlMsg.rate_limit_info;
    if (info?.status === "rejected") {
      const resetTime = info.resetsAt
        ? new Date(info.resetsAt * 1000).toLocaleTimeString()
        : "unknown";
      return [{
        type: "error",
        message: `Rate limit reached. Resets at ${resetTime}.`,
        recoverable: true,
      }];
    }
    if (info?.status === "allowed_warning") {
      const pct = info.utilization != null
        ? ` (${Math.round(info.utilization * 100)}% used)`
        : "";
      return [{
        type: "system",
        content: `Approaching rate limit${pct}. Consider pacing requests.`,
      }];
    }
    return [];
  }

  if (message.type === "tool_progress") {
    const progressMsg = message as {
      type: "tool_progress";
      tool_use_id?: string;
      tool_name?: string;
      elapsed_time_seconds?: number;
    };
    const toolUseId = progressMsg.tool_use_id;
    if (typeof toolUseId === "string" && toolUseId) {
      return [{
        type: "tool_progress",
        toolUseId,
        toolName: progressMsg.tool_name ?? "tool",
        elapsedSeconds: progressMsg.elapsed_time_seconds ?? 0,
      }];
    }
    return [];
  }

  if (message.type === "tool_use_summary") {
    const sumMsg = message as { type: "tool_use_summary"; summary?: string };
    const summary = sumMsg.summary?.trim();
    if (summary) {
      return [{ type: "system", content: summary }];
    }
    return [];
  }

  if (
    message.type === "auth_status"
    || message.type === "task_notification"
    || message.type === "task_started"
    || message.type === "task_progress"
    || message.type === "files_persisted"
    || message.type === "hook_started"
    || message.type === "hook_progress"
    || message.type === "hook_response"
  ) {
    if (claudeDebugStream) {
      console.debug("[claude-sdk-runtime] meta", message.type, message);
    }
    return [];
  }

  if (message.type === "error") {
    return [{ type: "error", message: `Claude error: ${toText(message)}`, recoverable: false }];
  }

  return [];
}

const sessionIdByTask = new Map<string, string>();
const activeRunByTask = new Map<string, Promise<void>>();

export async function getClaudeCommandCatalog(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  let stream: Query | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();

    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
      }),
    }) as Query;

    const commands = await stream.supportedCommands();
    return {
      ok: true,
      supported: true,
      commands: commands.map(toProviderSlashCommand),
      detail: commands.length > 0
        ? `Loaded ${commands.length} Claude native command${commands.length === 1 ? "" : "s"} for ${runtimeCwd}.`
        : `Claude reported no native slash commands for ${runtimeCwd}.`,
    };
  } catch (error) {
    return {
      ok: false,
      supported: false,
      commands: [],
      detail: `Claude command catalog unavailable: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export async function getClaudeContextUsage(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudeContextUsageResponse> {
  let stream: Query | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return {
        ok: false,
        detail: "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
      }),
    }) as Query;

    const usage = await stream.getContextUsage();
    return {
      ok: true,
      detail: `Loaded Claude context usage for ${runtimeCwd}.`,
      usage: toClaudeContextUsageSnapshot(usage),
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude context usage unavailable: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export async function reloadClaudePlugins(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<ClaudePluginReloadResponse> {
  let stream: Query | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return {
        ok: false,
        detail: "Claude runtime failure: query() is unavailable from SDK import.",
      };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();
    stream = queryFn({
      prompt: "",
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        systemPrompt: args.runtimeOptions?.claudeSystemPrompt,
        promptSuggestions: false,
      }),
    }) as Query;

    const reload = await stream.reloadPlugins();
    return {
      ok: true,
      detail: `Reloaded Claude plugins for ${runtimeCwd}.`,
      reload: toClaudePluginReloadSnapshot(reload),
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Claude plugin reload failed: ${toText(error)}`,
    };
  } finally {
    stream?.close();
  }
}

export function cleanupClaudeTask(taskId: string) {
  sessionIdByTask.delete(taskId);
  activeRunByTask.delete(taskId);
}

function resolveSessionId(args: { taskId?: string; fallbackSessionId?: string }) {
  const taskKey = args.taskId ?? "default";
  return sessionIdByTask.get(taskKey) ?? args.fallbackSessionId?.trim();
}

function rememberSessionId(args: { taskId?: string; sessionId?: string }) {
  const nextSessionId = args.sessionId?.trim();
  if (!nextSessionId) {
    return;
  }
  const taskKey = args.taskId ?? "default";
  sessionIdByTask.set(taskKey, nextSessionId);
}

export async function streamClaudeWithSdk(args: StreamTurnArgs & {
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: (responder: (args: { requestId: string; approved: boolean }) => boolean) => void;
  registerUserInputResponder?: (responder: (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => boolean) => void;
}): Promise<BridgeEvent[] | null> {
  const taskKey = args.taskId ?? "default";
  const previousRun = activeRunByTask.get(taskKey) ?? Promise.resolve();
  let releaseCurrentRun: (() => void) | null = null;
  const currentRun = new Promise<void>((resolve) => {
    releaseCurrentRun = resolve;
  });
  const chainedRun = previousRun.then(() => currentRun);
  activeRunByTask.set(taskKey, chainedRun);
  await previousRun;

  let selectedClaudePath = "";
  let diagnostics: ReturnType<typeof buildClaudeDiagnostics> | null = null;
  try {
    const runtimeCwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;

    if (!queryFn) {
      return [
        { type: "error", message: "Claude runtime failure: query() is unavailable from SDK import.", recoverable: false },
        { type: "done" },
      ];
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();
    selectedClaudePath = claudeExecutablePath;
    diagnostics = buildClaudeDiagnostics({
      executablePath: claudeExecutablePath,
      taskId: args.taskId,
      cwd: runtimeCwd,
    });
    const events: BridgeEvent[] = [];
    const diffTracker = await createTurnDiffTracker({ cwd: runtimeCwd });
    const pendingApprovalResolvers = new Map<string, (approved: boolean) => void>();
    const pendingUserInputResolvers = new Map<string, (response: {
      answers?: Record<string, string>;
      denied?: boolean;
    }) => void>();

    args.registerApprovalResponder?.(({ requestId, approved }) => {
      const resolver = pendingApprovalResolvers.get(requestId);
      if (!resolver) {
        return false;
      }
      pendingApprovalResolvers.delete(requestId);
      resolver(approved);
      return true;
    });
    args.registerUserInputResponder?.(({ requestId, answers, denied }) => {
      const resolver = pendingUserInputResolvers.get(requestId);
      if (!resolver) {
        return false;
      }
      pendingUserInputResolvers.delete(requestId);
      resolver({ answers, denied });
      return true;
    });

    const existingSessionId = resolveSessionId({
      taskId: args.taskId,
      fallbackSessionId: resolveProviderResumeConversationId({
        conversation: args.conversation,
        fallbackResumeId: args.runtimeOptions?.claudeResumeSessionId,
      }),
    });
    const claudeSystemPrompt = buildClaudeSystemPrompt({
      cwd: runtimeCwd,
      baseSystemPrompt: args.runtimeOptions?.claudeSystemPrompt,
      responseStylePrompt: args.runtimeOptions?.responseStylePrompt,
    });
    const providerPrompt = buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
    });
    const stream = queryFn({
      prompt: providerPrompt,
      options: buildClaudeQueryOptions({
        cwd: runtimeCwd,
        claudeExecutablePath,
        runtimeOptions: args.runtimeOptions,
        resume: existingSessionId,
        systemPrompt: claudeSystemPrompt,
        includePartialMessages: true,
        promptSuggestions: true,
        canUseTool: async (toolName, input, options) => {
          const normalizedInput = normalizeClaudeToolInput(input);
          const requestId = options.toolUseID;

          if (toolName === "AskUserQuestion") {
            const questions = parseClaudeQuestionList({ input: normalizedInput });
            if (questions.length === 0) {
              return buildClaudeDenyPermissionResult({
                message: "AskUserQuestion was requested without any valid questions.",
                context: "user-input:invalid-questions",
              });
            }

            const userInputEvent: BridgeEvent = {
              type: "user_input",
              toolName,
              requestId,
              questions,
            };
            events.push(userInputEvent);
            args.onEvent?.(userInputEvent);

            const response = await waitForClaudeToolDecision({
              signal: options.signal,
              register: (resolve) => {
                pendingUserInputResolvers.set(requestId, resolve);
                return () => {
                  pendingUserInputResolvers.delete(requestId);
                };
              },
            });
            return buildClaudeUserInputPermissionResult({
              normalizedInput,
              answers: response.answers,
              denied: response.denied,
            });
          }

          // In plan mode the CLI already enforces read-only tool boundaries,
          // so we can auto-approve without prompting the user.
          if (args.runtimeOptions?.claudePermissionMode === "plan") {
            return buildClaudeApprovalPermissionResult({
              approved: true,
              normalizedInput,
              denialMessage: `User denied permission for ${toolName}.`,
            });
          }

          const approvalEvent: BridgeEvent = {
            type: "approval",
            toolName,
            requestId,
            description: summarizeClaudePermissionRequest({
              toolName,
              input: normalizedInput,
              decisionReason: options.decisionReason,
              blockedPath: options.blockedPath,
            }),
          };
          events.push(approvalEvent);
          args.onEvent?.(approvalEvent);

          const approved = await waitForClaudeToolDecision({
            signal: options.signal,
            register: (resolve) => {
              pendingApprovalResolvers.set(requestId, resolve);
              return () => {
                pendingApprovalResolvers.delete(requestId);
              };
            },
          });
          return buildClaudeApprovalPermissionResult({
            approved,
            normalizedInput,
            denialMessage: `User denied permission for ${toolName}.`,
          });
        },
      }),
    }) as Query;

    // Register abort handler using the official Query.close() method
    args.registerAbort?.(() => {
      stream.close();
    });

    let hasStreamedText = false;
    let hasStreamedThinking = false;
    let finalStopReason: string | undefined;
    const claudeDebugStream = args.runtimeOptions?.debug ?? process.env.STAVE_CLAUDE_DEBUG === "1";
    const subagentTracker = new SubagentProgressTracker();

    for await (const message of stream) {
      if (message.type === "system" && (message as SDKSystemMessage).subtype === "init") {
        rememberSessionId({ taskId: args.taskId, sessionId: (message as SDKSystemMessage).session_id });
      }
      if (message.type === "system" && (message as SDKSystemMessage).subtype === "files_persisted") {
        const persistedMessage = message as SDKSystemMessage & {
          subtype: "files_persisted";
          files?: Array<{ filename?: string }>;
          failed?: Array<{ filename?: string; error?: string }>;
        };
        const changedPaths = (persistedMessage.files ?? [])
          .map((item) => item.filename ?? "")
          .filter(Boolean);
        const { diffEvents, unresolvedPaths } = await diffTracker.buildDiffEvents({ changedPaths });
        const fallbackEvents = diffTracker.buildFallbackEvents({
          appliedPaths: diffEvents.length === 0 ? changedPaths : [],
          skippedPaths: unresolvedPaths,
          failedPaths: (persistedMessage.failed ?? [])
            .map((item) => ({ path: item.filename ?? "", error: item.error })),
        });
        const persistedEvents = [...diffEvents, ...fallbackEvents];
        events.push(...persistedEvents);
        persistedEvents.forEach((event) => args.onEvent?.(event));
        continue;
      }

      // Feed hook messages to the subagent tracker for agent_id ↔ toolUseId mapping.
      subagentTracker.processRawMessage(message as Record<string, unknown>);

      // Intercept task_progress messages to emit subagent_progress events with
      // toolUseId correlation instead of generic system events.
      const sysMsg = message as SDKSystemMessage & { subtype?: string; summary?: string };
      if (sysMsg.type === "system" && sysMsg.subtype === "task_progress") {
        const summary = sysMsg.summary?.trim();
        if (summary) {
          const toolUseId = subagentTracker.resolveToolUseId(message as Record<string, unknown>);
          const progressEvent: BridgeEvent = { type: "subagent_progress", toolUseId, content: summary };
          events.push(progressEvent);
          args.onEvent?.(progressEvent);
        }
        continue;
      }

      if (message.type === "stream_event") {
        const streamMsg = message as { type: "stream_event"; event: unknown };
        const streamEvent = streamMsg.event as { type?: string; delta?: { type?: string } };
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "text_delta") {
          hasStreamedText = true;
        }
        if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "thinking_delta") {
          hasStreamedThinking = true;
        }
      }
      if (message.type === "result") {
        finalStopReason = (message as SDKResultMessage).stop_reason ?? undefined;
      }
      let normalizedEvents = mapClaudeMessageToEvents({ message, claudeDebugStream, cwd: runtimeCwd });
      // Deduplicate: if text/thinking already came through stream_event deltas, skip the
      // full assistant message duplicates (they contain the same content assembled).
      if (message.type === "assistant" && (hasStreamedText || hasStreamedThinking)) {
        normalizedEvents = normalizedEvents.filter((event) => event.type !== "text" && event.type !== "thinking");
      }
      // Let the subagent tracker observe tool starts / completions.
      for (const event of normalizedEvents) {
        subagentTracker.trackEvent(event);
      }
      events.push(...normalizedEvents);
      for (const event of normalizedEvents) {
        args.onEvent?.(event);
      }
    }

    if (events[events.length - 1]?.type !== "done") {
      const done: BridgeEvent = finalStopReason ? { type: "done", stop_reason: finalStopReason } : { type: "done" };
      events.push(done);
      args.onEvent?.(done);
    }

    return events;
  } catch (error) {
    console.warn("[provider-runtime] Claude SDK unavailable", error, diagnostics);
    const failureEvents: BridgeEvent[] = [
      {
        type: "error",
        message: `Claude runtime failure: ${toText(error)} | diagnostics=${toText(diagnostics ?? {
          executablePath: selectedClaudePath || "<sdk-default>",
        })}`,
        recoverable: true,
      },
      { type: "done" },
    ];
    failureEvents.forEach((event) => args.onEvent?.(event));
    return failureEvents;
  } finally {
    releaseCurrentRun?.();
    if (activeRunByTask.get(taskKey) === chainedRun) {
      activeRunByTask.delete(taskKey);
    }
  }
}

// ── Auto task name suggestion ─────────────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a short title for a
// newly-created task.  Intentionally isolated from the main task session so the
// title query never appears in the user's conversation history.

export async function suggestClaudeTaskName(args: {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<{ ok: boolean; title?: string }> {
  try {
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();

    // Build a conversation summary from the last few exchanges (if any).
    const historyLines = (args.history ?? [])
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const titlePrompt = [
      "Based on the conversation below, generate a short task title (3-6 words, Title Case) that best describes what this coding task is about overall.",
      "Return ONLY the title — no quotes, no punctuation, no explanation.",
      "",
      ...(historyLines ? [`Conversation so far:\n${historyLines}`, ""] : []),
      `Latest message: ${args.prompt.slice(0, 400)}`,
    ].join("\n");

    const stream = queryFn({
      prompt: titlePrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const title = textParts.join("").trim().split("\n")[0]?.trim();
    return title ? { ok: true, title } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── Auto commit message suggestion ────────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a conventional commit
// message based on the git diff of changed files.  Intentionally isolated from
// the main task session so the query never appears in the user's conversation.

export async function suggestClaudeCommitMessage(args: {
  diff: string;
  fileList: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();

    const commitPrompt = [
      "You are a git commit message generator. Generate a single concise commit message following the Conventional Commits specification.",
      "Format: <type>(<optional scope>): <short description>",
      "Allowed types: feat, fix, refactor, style, docs, test, build, ci, chore, perf",
      "Rules:",
      "- Subject line must be 72 characters or fewer",
      "- Use imperative mood (e.g., 'add feature' not 'added feature')",
      "- No period at the end",
      "- Return ONLY the commit message — no quotes, no explanation, no extra lines",
      "",
      "Changed files (git status --porcelain):",
      args.fileList || "(no file list available)",
      ...(args.diff.length > 0 ? [
        "",
        "Git diff (may be truncated):",
        args.diff.slice(0, 6000),
      ] : []),
    ].join("\n");

    const stream = queryFn({
      prompt: commitPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const commitMessage = textParts.join("").trim().split("\n")[0]?.trim();
    return commitMessage ? { ok: true, message: commitMessage } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── Auto PR description suggestion ──────────────────────────────────────────
// Runs a lightweight, single-turn Claude query to produce a pull request title
// and description based on the branch diff and commit log.  Intentionally
// isolated from the main task session so the query never appears in the user's
// conversation.

export async function suggestClaudePRDescription(args: {
  cwd?: string;
  diff: string;
  workingTreeDiff: string;
  commitLog: string;
  fileList: string;
  baseBranch: string;
  headBranch: string;
  guideContent?: string;
  promptTemplate?: string;
}): Promise<{ ok: boolean; title?: string; body?: string }> {
  try {
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    const queryFn = (mod as { query?: typeof import("@anthropic-ai/claude-agent-sdk").query }).query;
    if (!queryFn) {
      return { ok: false };
    }

    const claudeExecutablePath = resolveClaudeExecutablePath();

    // Use user-provided prompt template or fall back to the built-in default.
    const { DEFAULT_PROMPT_PR_DESCRIPTION } = await import(
      "../../src/lib/providers/prompt-defaults"
    );
    const baseTemplate = args.promptTemplate?.trim() || DEFAULT_PROMPT_PR_DESCRIPTION;

    const prPrompt = [
      baseTemplate,
      "",
      `Base branch: ${args.baseBranch}`,
      `Head branch: ${args.headBranch}`,
      "",
      "Commit log:",
      args.commitLog || "(no commits)",
      "",
      "Changed files:",
      args.fileList || "(no file list available)",
      ...(args.diff.length > 0 ? [
        "",
        "Branch diff against the base branch (may be truncated):",
        args.diff.slice(0, 6000),
      ] : []),
      ...(args.workingTreeDiff.length > 0 ? [
        "",
        "Uncommitted working tree diff (may be truncated):",
        args.workingTreeDiff.slice(0, 4000),
      ] : []),
      ...(args.guideContent ? [
        "",
        "Project guidelines (follow these conventions):",
        args.guideContent.slice(0, 2000),
      ] : []),
    ].join("\n");

    const stream = queryFn({
      prompt: prPrompt,
      options: {
        permissionMode: "default",
        maxTurns: 1,
        cwd: args.cwd || process.cwd(),
        model: "claude-haiku-4-5",
        ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
        env: buildClaudeEnv({ executablePath: claudeExecutablePath }),
      },
    }) as Query;

    const textParts: string[] = [];
    for await (const message of stream) {
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        const contentBlocks = assistantMsg.message?.content;
        if (!Array.isArray(contentBlocks)) continue;
        for (const block of contentBlocks) {
          const b = block as { type?: string; text?: string };
          if (b.type === "text" && b.text) {
            textParts.push(b.text);
          }
        }
      }
    }

    const fullText = textParts.join("").trim();
    const { title, body } = parsePullRequestSuggestionResponse(fullText);

    return title || body ? { ok: true, title, body } : { ok: false };
  } catch {
    return { ok: false };
  }
}
