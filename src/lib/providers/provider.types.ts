import type {
  CodeDiffPart,
  FileContextPart,
  MessagePart,
  MessageRole,
  ToolUsePart,
  UserInputQuestion,
} from "@/types/chat";

export type ProviderId = "claude-code" | "codex";

export interface ProviderCommandCatalogRequest {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}

export interface CanonicalRetrievedContextPart {
  type: "retrieved_context";
  sourceId: string;
  title?: string;
  content: string;
}

export interface CanonicalConversationMessage {
  messageId?: string;
  role: MessageRole;
  providerId?: ProviderId | "user";
  model?: string;
  content: string;
  parts: MessagePart[];
  isPlanResponse?: boolean;
  planText?: string;
}

export interface CanonicalConversationRequest {
  turnId?: string;
  taskId?: string;
  workspaceId?: string;
  target: {
    providerId: ProviderId;
    model?: string;
  };
  mode: "chat" | "review";
  history: CanonicalConversationMessage[];
  input: CanonicalConversationMessage & { role: "user" };
  contextParts: Array<FileContextPart | CanonicalRetrievedContextPart>;
  resume?: {
    nativeConversationId?: string;
  };
}

export type NormalizedProviderEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string }
  | { type: "provider_conversation"; providerId: ProviderId; nativeConversationId: string }
  | {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
  }
  | { type: "prompt_suggestions"; suggestions: string[] }
  | { type: "tool"; toolUseId?: string; toolName: string; input: string; output?: string; state: ToolUsePart["state"] }
  | { type: "tool_result"; tool_use_id: string; output: string; isError?: boolean; isPartial?: boolean }
  | { type: "diff"; filePath: string; oldContent: string; newContent: string; status?: CodeDiffPart["status"] }
  | { type: "approval"; toolName: string; requestId: string; description: string }
  | { type: "user_input"; toolName: string; requestId: string; questions: UserInputQuestion[] }
  | { type: "plan_ready"; planText: string }
  | { type: "system"; content: string }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done"; stop_reason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | string };

export interface ProviderTurnRequest {
  turnId?: string;
  prompt: string;
  conversation?: CanonicalConversationRequest;
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
    claudeResumeSessionId?: string;
    codexSandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    codexNetworkAccessEnabled?: boolean;
    codexApprovalPolicy?: "never" | "on-request" | "untrusted";
    codexPathOverride?: string;
    codexModelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    codexWebSearchMode?: "disabled" | "cached" | "live";
    codexShowRawAgentReasoning?: boolean;
    codexReasoningSummary?: "auto" | "concise" | "detailed" | "none";
    codexSupportsReasoningSummaries?: "auto" | "enabled" | "disabled";
    codexResumeThreadId?: string;
  };
}

export interface ProviderAdapter {
  id: ProviderId;
  runTurn: (args: ProviderTurnRequest) => AsyncGenerator<NormalizedProviderEvent, void, unknown>;
}

export interface ProviderEventSource<TRawEvent> {
  streamTurn: (args: ProviderTurnRequest) => AsyncGenerator<TRawEvent, void, unknown>;
}

export interface ProviderEventNormalizer<TRawEvent> {
  normalize: (args: { event: TRawEvent }) => NormalizedProviderEvent | NormalizedProviderEvent[];
}
