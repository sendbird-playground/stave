import type {
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  PromptDraft,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ResolvedPromptDraftRuntimeState {
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  codexPlanMode: boolean;
}

export function resolvePromptDraftRuntimeState(args: {
  promptDraft?: PromptDraft | null;
  fallback: ResolvedPromptDraftRuntimeState;
}): ResolvedPromptDraftRuntimeState {
  const runtimeOverrides = args.promptDraft?.runtimeOverrides;
  return {
    claudePermissionMode: runtimeOverrides?.claudePermissionMode ?? args.fallback.claudePermissionMode,
    claudePermissionModeBeforePlan:
      runtimeOverrides?.claudePermissionModeBeforePlan ?? args.fallback.claudePermissionModeBeforePlan,
    codexPlanMode: runtimeOverrides?.codexPlanMode ?? args.fallback.codexPlanMode,
  };
}

export function transitionClaudePromptDraftPermissionMode(args: {
  nextMode: ClaudePermissionMode;
  currentMode: ClaudePermissionMode;
  beforePlan: ClaudePermissionModeBeforePlan;
}): PromptDraftRuntimeOverrides {
  const { nextMode, currentMode, beforePlan } = args;

  if (nextMode === currentMode) {
    return {
      claudePermissionMode: currentMode,
      claudePermissionModeBeforePlan: beforePlan,
    };
  }

  if (nextMode === "plan") {
    return {
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan: currentMode !== "plan" ? currentMode : beforePlan,
    };
  }

  if (currentMode === "plan") {
    return {
      claudePermissionMode: nextMode,
      claudePermissionModeBeforePlan: null,
    };
  }

  return {
    claudePermissionMode: nextMode,
    claudePermissionModeBeforePlan: beforePlan,
  };
}

export function resolvePromptDraftPlanModeChange(args: {
  providerId: ProviderId;
  enabled: boolean;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  codexPlanMode: boolean;
}) {
  if (args.providerId === "codex") {
    return {
      runtimeOverrides: {
        ...args.runtimeOverrides,
        codexPlanMode: args.enabled,
      } satisfies PromptDraftRuntimeOverrides,
      shouldClearCodexSession: args.codexPlanMode && !args.enabled,
    };
  }

  if (args.providerId === "claude-code" || args.providerId === "stave") {
    const nextMode: ClaudePermissionMode = args.enabled
      ? "plan"
      : (args.claudePermissionModeBeforePlan ?? "auto");
    return {
      runtimeOverrides: transitionClaudePromptDraftPermissionMode({
        nextMode,
        currentMode: args.claudePermissionMode,
        beforePlan: args.claudePermissionModeBeforePlan,
      }),
      shouldClearCodexSession: false,
    };
  }

  return {
    runtimeOverrides: args.runtimeOverrides,
    shouldClearCodexSession: false,
  };
}

export function arePromptDraftRuntimeOverridesEqual(
  left?: PromptDraftRuntimeOverrides,
  right?: PromptDraftRuntimeOverrides,
) {
  return left?.claudePermissionMode === right?.claudePermissionMode
    && left?.claudePermissionModeBeforePlan === right?.claudePermissionModeBeforePlan
    && left?.codexPlanMode === right?.codexPlanMode;
}
