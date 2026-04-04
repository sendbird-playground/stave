import type {
  CodeDiffPart,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  MessageRole,
  ToolUsePart,
  UserInputQuestion,
} from "@/types/chat";
import type { SkillPromptContext } from "@/lib/skills/types";

export type ProviderId = "claude-code" | "codex" | "stave";
export type ClaudeSettingSource = "user" | "project" | "local";

export interface ProviderCommandCatalogRequest {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}

export interface ClaudeContextUsageSnapshot {
  categories: Array<{
    name: string;
    tokens: number;
    color: string;
    isDeferred?: boolean;
  }>;
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens: number;
  percentage: number;
  model: string;
  memoryFiles: Array<{
    path: string;
    type: string;
    tokens: number;
  }>;
  mcpTools: Array<{
    name: string;
    serverName: string;
    tokens: number;
    isLoaded?: boolean;
  }>;
}

export interface ClaudeContextUsageResponse {
  ok: boolean;
  detail: string;
  usage?: ClaudeContextUsageSnapshot;
}

export interface ClaudeMcpServerStatusSnapshot {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  error?: string;
  scope?: string;
  toolCount?: number;
}

export interface ClaudePluginReloadSnapshot {
  commandCount: number;
  agentCount: number;
  plugins: Array<{
    name: string;
    path: string;
    source?: string;
  }>;
  mcpServers: ClaudeMcpServerStatusSnapshot[];
  errorCount: number;
}

export interface ClaudePluginReloadResponse {
  ok: boolean;
  detail: string;
  reload?: ClaudePluginReloadSnapshot;
}

export interface CanonicalRetrievedContextPart {
  type: "retrieved_context";
  sourceId: string;
  title?: string;
  content: string;
}

export type StaveAutoIntent = "plan" | "analyze" | "implement" | "quick_edit" | "general";
export type StaveWorkerRole = "plan" | "analyze" | "implement" | "verify" | "general";
export type StaveOrchestrationMode = "off" | "auto" | "aggressive";

export interface StaveAutoProfile {
  classifierModel: string;
  supervisorModel: string;
  planModel: string;
  analyzeModel: string;
  implementModel: string;
  quickEditModel: string;
  generalModel: string;
  verifyModel?: string;
  orchestrationMode: StaveOrchestrationMode;
  maxSubtasks: number;
  maxParallelSubtasks: number;
  allowCrossProviderWorkers: boolean;
  claudeFastModeSupported?: boolean;
  codexFastModeSupported?: boolean;
  fastMode?: boolean;
  // ---- Prompt overrides for orchestration / classification ----
  promptSupervisorBreakdown?: string;
  promptSupervisorSynthesis?: string;
  promptPreprocessorClassifier?: string;
}

export interface CanonicalSkillContextPart {
  type: "skill_context";
  skills: SkillPromptContext[];
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
  contextParts: Array<FileContextPart | CanonicalRetrievedContextPart | ImageContextPart | CanonicalSkillContextPart>;
  resume?: {
    nativeSessionId?: string;
  };
}

export type NormalizedProviderEvent =
  | { type: "thinking"; text: string; isStreaming?: boolean }
  | { type: "text"; text: string; segmentId?: string }
  | { type: "provider_session"; providerId: ProviderId; nativeSessionId: string }
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
  | { type: "tool_progress"; toolUseId: string; toolName: string; elapsedSeconds: number }
  | { type: "tool_result"; tool_use_id: string; output: string; isError?: boolean; isPartial?: boolean }
  | { type: "diff"; filePath: string; oldContent: string; newContent: string; status?: CodeDiffPart["status"] }
  | { type: "approval"; toolName: string; requestId: string; description: string }
  | { type: "user_input"; toolName: string; requestId: string; questions: UserInputQuestion[] }
  | { type: "plan_ready"; planText: string }
  | {
    type: "system";
    content: string;
    compactBoundary?: {
      trigger?: string;
      gitRef?: string;
    };
  }
  | { type: "subagent_progress"; toolUseId?: string; content: string }
  | { type: "model_resolved"; resolvedProviderId: ProviderId; resolvedModel: string }
  | { type: "stave:execution_processing"; strategy: "direct" | "orchestrate"; model?: string; supervisorModel?: string; reason: string; fastModeRequested?: boolean; fastModeApplied?: boolean }
  | { type: "stave:orchestration_processing"; supervisorModel: string; subtasks: Array<{ id: string; title: string; model: string; dependsOn: string[] }> }
  | { type: "stave:subtask_started"; subtaskId: string; index: number; total: number; title: string; model: string }
  | { type: "stave:subtask_done"; subtaskId: string; success: boolean }
  | { type: "stave:synthesis_started" }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done"; stop_reason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | string };

export interface ProviderTurnRequest {
  turnId?: string;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

export interface ProviderRuntimeOptions {
  model?: string;
  chatStreamingEnabled?: boolean;
  debug?: boolean;
  providerTimeoutMs?: number;
  claudePermissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";
  claudeAllowDangerouslySkipPermissions?: boolean;
  claudeSandboxEnabled?: boolean;
  claudeAllowUnsandboxedCommands?: boolean;
  claudeSystemPrompt?: string;
  claudeMaxTurns?: number;
  claudeMaxBudgetUsd?: number;
  claudeTaskBudgetTokens?: number;
  claudeSettingSources?: ClaudeSettingSource[];
  claudeEffort?: "low" | "medium" | "high" | "max";
  claudeThinkingMode?: "adaptive" | "enabled" | "disabled";
  claudeAgentProgressSummaries?: boolean;
  claudeFastMode?: boolean;
  claudeAllowedTools?: string[];
  claudeDisallowedTools?: string[];
  claudeResumeSessionId?: string;
  codexSandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  codexSkipGitRepoCheck?: boolean;
  codexNetworkAccessEnabled?: boolean;
  codexApprovalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  codexPathOverride?: string;
  codexModelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  codexWebSearchMode?: "disabled" | "cached" | "live";
  codexShowRawAgentReasoning?: boolean;
  codexReasoningSummary?: "auto" | "concise" | "detailed" | "none";
  codexSupportsReasoningSummaries?: "auto" | "enabled" | "disabled";
  codexFastMode?: boolean;
  codexExperimentalPlanMode?: boolean;
  codexResumeThreadId?: string;
  /** Stave Auto profile used by the meta-provider for direct routing and orchestration. */
  staveAuto?: StaveAutoProfile;
  // ---- Customisable AI prompt overrides ----
  /** Response formatting guidance injected into both Claude and Codex. */
  responseStylePrompt?: string;
  /** Custom prompt template for AI-generated PR descriptions. */
  promptPrDescription?: string;
  /** Custom system prompt for inline code completion. */
  promptInlineCompletion?: string;
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
