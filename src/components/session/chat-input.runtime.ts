import type { PromptInputRuntimeControl, PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { getPermissionModeOptions, type PermissionModeValue } from "@/components/ai-elements/permission-mode-selector";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  CODEX_REASONING_SUMMARY_OPTIONS,
  CODEX_REASONING_SUPPORT_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
  findOptionLabel,
  formatProviderTimeoutLabel,
  formatShortRuntimePath,
  formatTitleCaseRuntimeValue,
  STAVE_AUTO_MAX_SUBTASK_OPTIONS,
  STAVE_AUTO_ORCHESTRATION_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { AppSettings } from "@/store/app.store";

type UpdateSettings = (args: { patch: Partial<AppSettings> }) => void;

interface ChatInputRuntimeArgs {
  activeProvider: ProviderId;
  permissionMode: PermissionModeValue;
  providerTimeoutMs: number;
  claudePermissionMode: AppSettings["claudePermissionMode"];
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeEffort: AppSettings["claudeEffort"];
  claudeThinkingMode: AppSettings["claudeThinkingMode"];
  claudeAgentProgressSummaries: boolean;
  claudeFastMode: boolean;
  codexSandboxMode: AppSettings["codexSandboxMode"];
  codexSkipGitRepoCheck: boolean;
  codexNetworkAccessEnabled: boolean;
  codexApprovalPolicy: AppSettings["codexApprovalPolicy"];
  codexModelReasoningEffort: AppSettings["codexModelReasoningEffort"];
  codexWebSearchMode: AppSettings["codexWebSearchMode"];
  codexShowRawAgentReasoning: boolean;
  codexReasoningSummary: AppSettings["codexReasoningSummary"];
  codexSupportsReasoningSummaries: AppSettings["codexSupportsReasoningSummaries"];
  codexFastMode: boolean;
  codexPathOverride: string;
  staveAutoFastMode: boolean;
  staveAutoOrchestrationMode: AppSettings["staveAutoOrchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoMaxParallelSubtasks: number;
  updateSettings: UpdateSettings;
}

type CommandCatalogRuntimeArgs = Pick<
  ChatInputRuntimeArgs,
  | "activeProvider"
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
> & {
  modelClaude: string;
};

export function buildChatInputRuntimeQuickControls(args: ChatInputRuntimeArgs): PromptInputRuntimeControl[] {
  if (args.activeProvider === "stave") {
    return [
      {
        id: "orchestration-mode",
        label: "Orchestration",
        value: args.staveAutoOrchestrationMode,
        options: STAVE_AUTO_ORCHESTRATION_OPTIONS,
        onSelect: (value: string) => args.updateSettings({
          patch: { staveAutoOrchestrationMode: value as AppSettings["staveAutoOrchestrationMode"] },
        }),
      },
      {
        id: "fast-mode",
        label: "Fast Mode",
        value: args.staveAutoFastMode ? "on" : "off",
        options: [
          { label: "Off", value: "off" },
          { label: "On", value: "on" },
        ],
        onSelect: (value: string) => args.updateSettings({ patch: { staveAutoFastMode: value === "on" } }),
      },
      {
        id: "max-subtasks",
        label: "Max Subtasks",
        value: String(args.staveAutoMaxSubtasks),
        options: STAVE_AUTO_MAX_SUBTASK_OPTIONS,
        onSelect: (value: string) => args.updateSettings({ patch: { staveAutoMaxSubtasks: Number(value) } }),
      },
    ];
  }

  const permissionOptions = getPermissionModeOptions(args.activeProvider).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  if (args.activeProvider === "claude-code") {
    return [
      {
        id: "permission-mode",
        label: "Permission",
        value: args.permissionMode,
        options: permissionOptions,
        onSelect: (value: string) => args.updateSettings({
          patch: { claudePermissionMode: value as typeof args.claudePermissionMode },
        }),
      },
      {
        id: "thinking-mode",
        label: "Thinking",
        value: args.claudeThinkingMode,
        options: CLAUDE_THINKING_OPTIONS,
        onSelect: (value: string) => args.updateSettings({
          patch: { claudeThinkingMode: value as typeof args.claudeThinkingMode },
        }),
      },
      {
        id: "effort",
        label: "Effort",
        value: args.claudeEffort,
        options: CLAUDE_EFFORT_OPTIONS,
        onSelect: (value: string) => args.updateSettings({
          patch: { claudeEffort: value as typeof args.claudeEffort },
        }),
      },
    ];
  }

  return [
    {
      id: "permission-mode",
      label: "Approval",
      value: args.permissionMode,
      options: permissionOptions,
      onSelect: (value: string) => args.updateSettings({
        patch: { codexApprovalPolicy: value as typeof args.codexApprovalPolicy },
      }),
    },
    {
      id: "effort",
      label: "Effort",
      value: args.codexModelReasoningEffort,
      options: CODEX_EFFORT_OPTIONS,
      onSelect: (value: string) => args.updateSettings({
        patch: { codexModelReasoningEffort: value as typeof args.codexModelReasoningEffort },
      }),
    },
    {
      id: "web-search",
      label: "Web Search",
      value: args.codexWebSearchMode,
      options: CODEX_WEB_SEARCH_OPTIONS,
      onSelect: (value: string) => args.updateSettings({
        patch: { codexWebSearchMode: value as typeof args.codexWebSearchMode },
      }),
    },
  ];
}

export function buildChatInputRuntimeStatusItems(args: ChatInputRuntimeArgs): PromptInputRuntimeStatusItem[] {
  if (args.activeProvider === "stave") {
    return [
      {
        id: "timeout",
        label: "Timeout",
        value: formatProviderTimeoutLabel(args.providerTimeoutMs),
      },
      {
        id: "cross-provider",
        label: "Cross-Provider",
        value: args.staveAutoAllowCrossProviderWorkers ? "On" : "Off",
      },
      {
        id: "max-parallel",
        label: "Max Parallel",
        value: String(args.staveAutoMaxParallelSubtasks),
      },
    ];
  }

  if (args.activeProvider === "claude-code") {
    return [
      {
        id: "timeout",
        label: "Timeout",
        value: formatProviderTimeoutLabel(args.providerTimeoutMs),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        value: args.claudeSandboxEnabled ? "Enabled" : "Disabled",
      },
      {
        id: "unsandboxed",
        label: "Unsandboxed",
        value: args.claudeAllowUnsandboxedCommands ? "On" : "Off",
      },
      {
        id: "dangerous-skip",
        label: "Dangerous Skip",
        value: args.claudeAllowDangerouslySkipPermissions ? "On" : "Off",
      },
      {
        id: "progress-summaries",
        label: "Progress Summaries",
        value: args.claudeAgentProgressSummaries ? "On" : "Off",
      },
      {
        id: "fast-mode",
        label: "Fast Mode",
        value: args.claudeFastMode ? "On" : "Off",
        tone: args.claudeFastMode ? "warning" : "default",
      },
    ];
  }

  return [
    {
      id: "timeout",
      label: "Timeout",
      value: formatProviderTimeoutLabel(args.providerTimeoutMs),
    },
    {
      id: "sandbox",
      label: "Sandbox",
      value: formatTitleCaseRuntimeValue(args.codexSandboxMode),
      tone: args.codexSandboxMode === "danger-full-access" ? "warning" : "default",
    },
    {
      id: "network",
      label: "Network",
      value: args.codexNetworkAccessEnabled ? "On" : "Off",
    },
    {
      id: "git-check",
      label: "Git Check",
      value: args.codexSkipGitRepoCheck ? "Skipped" : "Required",
    },
    {
      id: "raw-reasoning",
      label: "Raw Reasoning",
      value: args.codexShowRawAgentReasoning ? "On" : "Off",
    },
    {
      id: "summary",
      label: "Summary",
      value: findOptionLabel(CODEX_REASONING_SUMMARY_OPTIONS, args.codexReasoningSummary),
    },
    {
      id: "summary-support",
      label: "Summary Support",
      value: findOptionLabel(CODEX_REASONING_SUPPORT_OPTIONS, args.codexSupportsReasoningSummaries),
    },
    {
      id: "fast-mode",
      label: "Fast Mode",
      value: args.codexFastMode ? "On" : "Off",
      tone: args.codexFastMode ? "warning" : "default",
    },
    ...(args.codexPathOverride.trim()
      ? [{
          id: "codex-binary",
          label: "Binary",
          value: formatShortRuntimePath(args.codexPathOverride),
        } satisfies PromptInputRuntimeStatusItem]
      : []),
  ];
}

export function buildCommandCatalogRuntimeOptions(args: CommandCatalogRuntimeArgs): ProviderRuntimeOptions | undefined {
  if (args.activeProvider !== "claude-code") {
    return undefined;
  }

  return {
    model: args.modelClaude,
    claudePermissionMode: args.claudePermissionMode,
    claudeAllowDangerouslySkipPermissions: args.claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled: args.claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands: args.claudeAllowUnsandboxedCommands,
    claudeEffort: args.claudeEffort,
    claudeThinkingMode: args.claudeThinkingMode,
    claudeAgentProgressSummaries: args.claudeAgentProgressSummaries,
  };
}
