import type {
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  PromptDraft,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";

export interface ResolvedPromptDraftRuntimeState {
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  codexExperimentalPlanMode: boolean;
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
    codexExperimentalPlanMode:
      runtimeOverrides?.codexExperimentalPlanMode ?? args.fallback.codexExperimentalPlanMode,
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

export function arePromptDraftRuntimeOverridesEqual(
  left?: PromptDraftRuntimeOverrides,
  right?: PromptDraftRuntimeOverrides,
) {
  return left?.claudePermissionMode === right?.claudePermissionMode
    && left?.claudePermissionModeBeforePlan === right?.claudePermissionModeBeforePlan
    && left?.codexExperimentalPlanMode === right?.codexExperimentalPlanMode;
}
