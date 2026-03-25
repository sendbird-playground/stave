import type { ProviderId, StaveAutoIntent, StaveAutoProfile, StaveWorkerRole } from "@/lib/providers/provider.types";

type StaveAutoSettingsLike = {
  staveAutoClassifierModel: string;
  staveAutoSupervisorModel: string;
  staveAutoPlanModel: string;
  staveAutoAnalyzeModel: string;
  staveAutoImplementModel: string;
  staveAutoQuickEditModel: string;
  staveAutoGeneralModel: string;
  staveAutoVerifyModel: string;
  staveAutoOrchestrationMode: StaveAutoProfile["orchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoMaxParallelSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
};

export const DEFAULT_STAVE_AUTO_PROFILE: StaveAutoProfile = {
  classifierModel: "claude-haiku-4-5",
  supervisorModel: "claude-opus-4-6",
  planModel: "opusplan",
  analyzeModel: "claude-opus-4-6",
  implementModel: "gpt-5.3-codex",
  quickEditModel: "claude-haiku-4-5",
  generalModel: "claude-sonnet-4-6",
  verifyModel: "claude-sonnet-4-6",
  orchestrationMode: "auto",
  maxSubtasks: 3,
  maxParallelSubtasks: 2,
  allowCrossProviderWorkers: true,
};

export function buildStaveAutoProfileFromSettings(args: {
  settings: StaveAutoSettingsLike;
}): StaveAutoProfile {
  const { settings } = args;
  return {
    classifierModel: settings.staveAutoClassifierModel,
    supervisorModel: settings.staveAutoSupervisorModel,
    planModel: settings.staveAutoPlanModel,
    analyzeModel: settings.staveAutoAnalyzeModel,
    implementModel: settings.staveAutoImplementModel,
    quickEditModel: settings.staveAutoQuickEditModel,
    generalModel: settings.staveAutoGeneralModel,
    verifyModel: settings.staveAutoVerifyModel,
    orchestrationMode: settings.staveAutoOrchestrationMode,
    maxSubtasks: settings.staveAutoMaxSubtasks,
    maxParallelSubtasks: settings.staveAutoMaxParallelSubtasks,
    allowCrossProviderWorkers: settings.staveAutoAllowCrossProviderWorkers,
  };
}

export function resolveStaveProviderForModel(args: { model: string }): Exclude<ProviderId, "stave"> {
  const normalizedModel = args.model.trim().toLowerCase();
  if (normalizedModel.includes("codex") || normalizedModel.startsWith("gpt-")) {
    return "codex";
  }
  return "claude-code";
}

export function resolveStaveIntentModel(args: {
  profile: StaveAutoProfile;
  intent: StaveAutoIntent;
}): string {
  const { profile, intent } = args;
  switch (intent) {
    case "plan":
      return profile.planModel;
    case "analyze":
      return profile.analyzeModel;
    case "implement":
      return profile.implementModel;
    case "quick_edit":
      return profile.quickEditModel;
    case "general":
      return profile.generalModel;
  }
}

export function resolveStaveWorkerModel(args: {
  profile: StaveAutoProfile;
  role: StaveWorkerRole;
}): string {
  const { profile, role } = args;
  switch (role) {
    case "plan":
      return profile.planModel;
    case "analyze":
      return profile.analyzeModel;
    case "implement":
      return profile.implementModel;
    case "verify":
      return profile.verifyModel?.trim() || profile.analyzeModel;
    case "general":
      return profile.generalModel;
  }
}
