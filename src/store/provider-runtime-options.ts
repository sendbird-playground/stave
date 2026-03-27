import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { buildStaveAutoProfileFromSettings } from "@/lib/providers/stave-auto-profile";
import type { AppSettings } from "@/store/app.store";

const DEFAULT_CODEX_APPROVAL_POLICY = "on-request";

type RuntimeSettings = Pick<
  AppSettings,
  | "chatStreamingEnabled"
  | "providerDebugStream"
  | "providerTimeoutMs"
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
  | "claudeFastMode"
  | "claudeFastModeVisible"
  | "codexSandboxMode"
  | "codexSkipGitRepoCheck"
  | "codexNetworkAccessEnabled"
  | "codexApprovalPolicy"
  | "codexPathOverride"
  | "codexModelReasoningEffort"
  | "codexWebSearchMode"
  | "codexShowRawAgentReasoning"
  | "codexReasoningSummary"
  | "codexSupportsReasoningSummaries"
  | "codexFastMode"
  | "codexFastModeVisible"
  | "staveAutoClassifierModel"
  | "staveAutoSupervisorModel"
  | "staveAutoPlanModel"
  | "staveAutoAnalyzeModel"
  | "staveAutoImplementModel"
  | "staveAutoQuickEditModel"
  | "staveAutoGeneralModel"
  | "staveAutoVerifyModel"
  | "staveAutoOrchestrationMode"
  | "staveAutoMaxSubtasks"
  | "staveAutoMaxParallelSubtasks"
  | "staveAutoAllowCrossProviderWorkers"
  | "staveAutoFastMode"
>;

export function normalizeCodexApprovalPolicy(args: {
  value?: string;
}): NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]> {
  if (
    args.value === "never"
    || args.value === "on-request"
    || args.value === "on-failure"
    || args.value === "untrusted"
  ) {
    return args.value;
  }
  return DEFAULT_CODEX_APPROVAL_POLICY;
}

export function buildProviderRuntimeOptions(args: {
  provider: ProviderId;
  model: string;
  settings: RuntimeSettings;
  providerConversation?: TaskProviderConversationState | null;
}): ProviderRuntimeOptions {
  const { providerConversation, settings } = args;

  return {
    model: args.model,
    chatStreamingEnabled: settings.chatStreamingEnabled,
    debug: settings.providerDebugStream,
    providerTimeoutMs: settings.providerTimeoutMs,
    claudePermissionMode: settings.claudePermissionMode,
    claudeAllowDangerouslySkipPermissions: settings.claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled: settings.claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands: settings.claudeAllowUnsandboxedCommands,
    claudeEffort: settings.claudeEffort,
    claudeThinkingMode: settings.claudeThinkingMode,
    claudeAgentProgressSummaries: settings.claudeAgentProgressSummaries,
    claudeFastMode: settings.claudeFastMode,
    ...(args.provider === "stave"
      ? {
          ...(providerConversation?.["claude-code"]?.trim()
            ? { claudeResumeSessionId: providerConversation["claude-code"] }
            : {}),
          ...(providerConversation?.codex?.trim()
            ? { codexResumeThreadId: providerConversation.codex }
            : {}),
        }
      : args.provider === "claude-code" && providerConversation?.["claude-code"]?.trim()
        ? { claudeResumeSessionId: providerConversation["claude-code"] }
        : {}),
    codexSandboxMode: settings.codexSandboxMode,
    codexSkipGitRepoCheck: settings.codexSkipGitRepoCheck,
    codexNetworkAccessEnabled: settings.codexNetworkAccessEnabled,
    codexApprovalPolicy: normalizeCodexApprovalPolicy({
      value: settings.codexApprovalPolicy,
    }),
    codexPathOverride: settings.codexPathOverride || undefined,
    codexModelReasoningEffort: settings.codexModelReasoningEffort,
    codexWebSearchMode: settings.codexWebSearchMode,
    codexShowRawAgentReasoning: settings.codexShowRawAgentReasoning,
    codexReasoningSummary: settings.codexReasoningSummary,
    codexSupportsReasoningSummaries: settings.codexSupportsReasoningSummaries,
    codexFastMode: settings.codexFastMode,
    ...(args.provider === "codex" && providerConversation?.codex?.trim()
      ? { codexResumeThreadId: providerConversation.codex }
      : {}),
    staveAuto: buildStaveAutoProfileFromSettings({
      settings,
    }),
  };
}
