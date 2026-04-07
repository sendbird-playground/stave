import type { PromptInputRuntimeControl, PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { getPermissionModeOptions, type PermissionModeValue } from "@/components/ai-elements/permission-mode-selector";
import { resolveEffectiveCodexFileAccessMode } from "@/lib/providers/codex-runtime-options";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { ClaudePermissionMode } from "@/types/chat";
import {
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  CODEX_REASONING_SUMMARY_OPTIONS,
  CODEX_REASONING_SUPPORT_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
  formatClaudeSettingSources,
  findOptionLabel,
  formatProviderTimeoutLabel,
  formatShortRuntimePath,
  formatTokenBudget,
  formatTitleCaseRuntimeValue,
  STAVE_AUTO_MAX_SUBTASK_OPTIONS,
  STAVE_AUTO_ORCHESTRATION_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { AppSettings } from "@/store/app.store";

type UpdateSettings = (args: { patch: Partial<AppSettings> }) => void;

/**
 * Transition Claude permission mode while maintaining the "before-plan"
 * save/restore contract.  Used by the toggle button, drawer, and quick
 * controls — keep them in sync through this single helper.
 */
export function transitionClaudePermissionMode(args: {
  nextMode: AppSettings["claudePermissionMode"];
  currentMode: AppSettings["claudePermissionMode"];
  beforePlan: AppSettings["claudePermissionModeBeforePlan"];
  updateSettings: UpdateSettings;
}): void {
  const { nextMode, currentMode, beforePlan, updateSettings } = args;
  if (nextMode === currentMode) return;

  if (nextMode === "plan") {
    // Entering plan mode — save current mode
    updateSettings({
      patch: {
        claudePermissionModeBeforePlan: currentMode !== "plan" ? currentMode : beforePlan,
        claudePermissionMode: "plan",
      },
    });
  } else if (currentMode === "plan") {
    // Leaving plan mode — clear saved mode
    updateSettings({
      patch: {
        claudePermissionMode: nextMode,
        claudePermissionModeBeforePlan: null,
      },
    });
  } else {
    updateSettings({ patch: { claudePermissionMode: nextMode } });
  }
}

interface ChatInputRuntimeArgs {
  activeProvider: ProviderId;
  permissionMode: PermissionModeValue;
  providerTimeoutMs: number;
  claudePermissionMode: AppSettings["claudePermissionMode"];
  claudePermissionModeBeforePlan: AppSettings["claudePermissionModeBeforePlan"];
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeTaskBudgetTokens: number;
  claudeSettingSources: AppSettings["claudeSettingSources"];
  claudeEffort: AppSettings["claudeEffort"];
  claudeThinkingMode: AppSettings["claudeThinkingMode"];
  claudeAgentProgressSummaries: boolean;
  claudeFastMode: boolean;
  codexFileAccess: AppSettings["codexFileAccess"];
  codexNetworkAccess: boolean;
  codexApprovalPolicy: AppSettings["codexApprovalPolicy"];
  codexReasoningEffort: AppSettings["codexReasoningEffort"];
  codexWebSearch: AppSettings["codexWebSearch"];
  codexShowRawReasoning: boolean;
  codexReasoningSummary: AppSettings["codexReasoningSummary"];
  codexReasoningSummarySupport: AppSettings["codexReasoningSummarySupport"];
  codexFastMode: boolean;
  codexPlanMode: boolean;
  codexBinaryPath: string;
  staveAutoFastMode: boolean;
  staveAutoOrchestrationMode: AppSettings["staveAutoOrchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoMaxParallelSubtasks: number;
  onClaudePermissionModeChange?: (value: ClaudePermissionMode) => void;
  updateSettings: UpdateSettings;
}

type CommandCatalogRuntimeArgs = Pick<
  ChatInputRuntimeArgs,
  | "activeProvider"
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeSettingSources"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
> & {
  modelClaude: string;
};

export function buildChatInputRuntimeQuickControls(args: ChatInputRuntimeArgs): PromptInputRuntimeControl[] {
  if (args.activeProvider === "stave") {
    // Stave Auto has no quick controls in the toolbar drawer — all per-model settings
    // are configured in the Settings > Providers panel instead.
    return [];
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
        onSelect: (value: string) => {
          if (args.onClaudePermissionModeChange) {
            args.onClaudePermissionModeChange(value as ClaudePermissionMode);
            return;
          }
          transitionClaudePermissionMode({
            nextMode: value as typeof args.claudePermissionMode,
            currentMode: args.claudePermissionMode,
            beforePlan: args.claudePermissionModeBeforePlan,
            updateSettings: args.updateSettings,
          });
        },
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
    ];
  }

  return [
    {
      id: "permission-mode",
      label: "Approvals",
      value: args.permissionMode,
      options: permissionOptions,
      onSelect: (value: string) => args.updateSettings({
        patch: { codexApprovalPolicy: value as typeof args.codexApprovalPolicy },
      }),
    },
    {
      id: "web-search",
      label: "Web Search",
      value: args.codexWebSearch,
      options: CODEX_WEB_SEARCH_OPTIONS,
      onSelect: (value: string) => args.updateSettings({
        patch: { codexWebSearch: value as typeof args.codexWebSearch },
      }),
    },
  ];
}

const CLAUDE_EFFORT_CYCLE_ORDER = CLAUDE_EFFORT_OPTIONS.map((option) => option.value);
const CODEX_EFFORT_CYCLE_ORDER = [
  "low",
  "medium",
  "high",
  "xhigh",
  "minimal",
] as const satisfies readonly AppSettings["codexReasoningEffort"][];

function cycleOptionValue<T extends string>(args: {
  current: T;
  order: readonly T[];
}) {
  const index = args.order.indexOf(args.current);
  if (index < 0) {
    return args.order[0];
  }
  return args.order[(index + 1) % args.order.length] ?? args.order[0];
}

export function cycleClaudeEffortValue(current: AppSettings["claudeEffort"]) {
  return cycleOptionValue({
    current,
    order: CLAUDE_EFFORT_CYCLE_ORDER,
  });
}

export function cycleCodexEffortValue(current: AppSettings["codexReasoningEffort"]) {
  return cycleOptionValue({
    current,
    order: CODEX_EFFORT_CYCLE_ORDER,
  });
}

export function buildChatInputRuntimeStatusItems(args: ChatInputRuntimeArgs): PromptInputRuntimeStatusItem[] {
  if (args.activeProvider === "stave") {
    return [];
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
        id: "setting-sources",
        label: "Settings",
        value: formatClaudeSettingSources(args.claudeSettingSources),
      },
      {
        id: "task-budget",
        label: "Task Budget",
        value: formatTokenBudget(args.claudeTaskBudgetTokens),
        tone: args.claudeTaskBudgetTokens > 0 ? "warning" : "default",
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

  const effectiveCodexFileAccess = resolveEffectiveCodexFileAccessMode({
    fileAccessMode: args.codexFileAccess,
    planMode: args.codexPlanMode,
    fallback: "workspace-write",
  });

  return [
    {
      id: "timeout",
      label: "Timeout",
      value: formatProviderTimeoutLabel(args.providerTimeoutMs),
    },
    {
      id: "sandbox",
      label: "Files",
      value: formatTitleCaseRuntimeValue(effectiveCodexFileAccess),
      tone: effectiveCodexFileAccess === "danger-full-access" ? "warning" : "default",
    },
    {
      id: "network",
      label: "Network",
      value: args.codexNetworkAccess ? "On" : "Off",
    },
    {
      id: "raw-reasoning",
      label: "Raw Reasoning",
      value: args.codexShowRawReasoning ? "On" : "Off",
    },
    {
      id: "summary",
      label: "Summary",
      value: findOptionLabel(CODEX_REASONING_SUMMARY_OPTIONS, args.codexReasoningSummary),
    },
    {
      id: "summary-support",
      label: "Summary Support",
      value: findOptionLabel(CODEX_REASONING_SUPPORT_OPTIONS, args.codexReasoningSummarySupport),
    },
    {
      id: "plan-mode",
      label: "Planning",
      value: args.codexPlanMode ? "On" : "Off",
      tone: args.codexPlanMode ? "warning" : "default",
    },
    {
      id: "fast-mode",
      label: "Fast Mode",
      value: args.codexFastMode ? "On" : "Off",
      tone: args.codexFastMode ? "warning" : "default",
    },
    ...(args.codexBinaryPath.trim()
      ? [{
          id: "codex-binary",
          label: "Codex Binary",
          value: formatShortRuntimePath(args.codexBinaryPath),
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
    claudeSettingSources: args.claudeSettingSources,
    claudeEffort: args.claudeEffort,
    claudeThinkingMode: args.claudeThinkingMode,
    claudeAgentProgressSummaries: args.claudeAgentProgressSummaries,
  };
}
