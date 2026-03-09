export type ProviderId = "claude-code" | "codex";

export interface StreamTurnArgs {
  providerId: ProviderId;
  prompt: string;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: {
    model?: string;
    chatStreamingEnabled?: boolean;
    debug?: boolean;
    providerTimeoutMs?: number;
    claudePermissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
    claudeAllowDangerouslySkipPermissions?: boolean;
    claudeSandboxEnabled?: boolean;
    claudeAllowUnsandboxedCommands?: boolean;
    claudeSystemPrompt?: string;
    claudeMaxTurns?: number;
    claudeMaxBudgetUsd?: number;
    claudeEffort?: "low" | "medium" | "high" | "max";
    claudeThinkingMode?: "adaptive" | "enabled" | "disabled";
    claudeAllowedTools?: string[];
    claudeDisallowedTools?: string[];
    codexSandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    codexNetworkAccessEnabled?: boolean;
    codexApprovalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
    codexPathOverride?: string;
    codexModelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    codexWebSearchMode?: "disabled" | "cached" | "live";
    codexPlanMode?: boolean;
  };
}

export type BridgeEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string }
  | {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
  }
  | { type: "prompt_suggestions"; suggestions: string[] }
  | { type: "tool"; toolUseId?: string; toolName: string; input: string; output?: string; state: "input-streaming" | "input-available" | "output-available" | "output-error" }
  | { type: "tool_result"; tool_use_id: string; output: string; isError?: boolean }
  | { type: "diff"; filePath: string; oldContent: string; newContent: string; status?: "pending" | "accepted" | "rejected" }
  | { type: "approval"; toolName: string; requestId: string; description: string }
  | {
    type: "user_input";
    toolName: string;
    requestId: string;
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect?: boolean;
    }>;
  }
  | { type: "plan_ready"; planText: string }
  | { type: "system"; content: string }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done"; stop_reason?: string };

export interface ProviderRuntime {
  streamTurn: (args: StreamTurnArgs) => Promise<BridgeEvent[]>;
  startTurnStream: (
    args: StreamTurnArgs,
    options?: { onEvent?: (event: BridgeEvent) => void; onDone?: () => void }
  ) => { ok: boolean; streamId: string };
  readTurnStream: (args: { streamId: string; cursor: number }) => {
    ok: boolean;
    events: BridgeEvent[];
    cursor: number;
    done: boolean;
    message?: string;
  };
  abortTurn: (args: { providerId: ProviderId }) => { ok: boolean; message: string };
  cleanupTask: (args: { taskId: string }) => { ok: boolean; message: string };
  respondApproval: (args: { providerId: ProviderId; requestId: string; approved: boolean }) => { ok: boolean; message: string };
  respondUserInput: (args: {
    providerId: ProviderId;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => { ok: boolean; message: string };
  checkAvailability: (args: { providerId: ProviderId }) => Promise<{
    ok: boolean;
    available: boolean;
    detail: string;
  }>;
}
