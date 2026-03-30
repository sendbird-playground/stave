import type { ProviderId, StaveAutoIntent, StaveAutoProfile, StaveWorkerRole } from "@/lib/providers/provider.types";

export type StaveAutoModelPresetId = "recommended" | "recommended-1m" | "claude-only" | "codex-only";

type StaveAutoModelProfile = {
  classifierModel: string;
  supervisorModel: string;
  planModel: string;
  analyzeModel: string;
  implementModel: string;
  quickEditModel: string;
  generalModel: string;
  verifyModel: string;
};

export interface StaveAutoModelSettingsPatch {
  staveAutoClassifierModel: string;
  staveAutoSupervisorModel: string;
  staveAutoPlanModel: string;
  staveAutoAnalyzeModel: string;
  staveAutoImplementModel: string;
  staveAutoQuickEditModel: string;
  staveAutoGeneralModel: string;
  staveAutoVerifyModel: string;
}

type StaveAutoSettingsLike = StaveAutoModelSettingsPatch & {
  staveAutoOrchestrationMode: StaveAutoProfile["orchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoMaxParallelSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoFastMode: boolean;
  claudeFastModeVisible: boolean;
  codexFastModeVisible: boolean;
};

export const DEFAULT_STAVE_AUTO_MODEL_PRESET_ID: StaveAutoModelPresetId = "recommended";

export const STAVE_AUTO_MODEL_PRESETS = [
  {
    id: "recommended",
    label: "Recommended",
    description: "Balanced Claude + Codex mix. Verify uses GPT-5.4.",
  },
  {
    id: "recommended-1m",
    label: "Recommended (1M)",
    description: "1M context for supervisor, analyze & general roles. Higher cost for longer sessions.",
  },
  {
    id: "claude-only",
    label: "Claude Only",
    description: "Keep every Stave Auto role on Claude models only.",
  },
  {
    id: "codex-only",
    label: "Codex Only",
    description: "Use GPT-5.4 Mini for lightweight Codex roles and keep heavy work on GPT-5.4 / GPT-5.3-Codex.",
  },
] as const satisfies ReadonlyArray<{
  id: StaveAutoModelPresetId;
  label: string;
  description: string;
}>;

const STAVE_AUTO_MODEL_PRESET_PROFILES: Record<StaveAutoModelPresetId, StaveAutoModelProfile> = {
  recommended: {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-opus-4-6",
    planModel: "opusplan",
    analyzeModel: "claude-opus-4-6",
    implementModel: "gpt-5.3-codex",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6",
    verifyModel: "gpt-5.4",
  },
  "recommended-1m": {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-opus-4-6[1m]",
    planModel: "opusplan",
    analyzeModel: "claude-opus-4-6[1m]",
    implementModel: "gpt-5.3-codex",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6[1m]",
    verifyModel: "gpt-5.4",
  },
  "claude-only": {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-opus-4-6",
    planModel: "opusplan",
    analyzeModel: "claude-opus-4-6",
    implementModel: "claude-sonnet-4-6",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6",
    verifyModel: "claude-sonnet-4-6",
  },
  "codex-only": {
    classifierModel: "gpt-5.4-mini",
    supervisorModel: "gpt-5.4",
    planModel: "gpt-5.4",
    analyzeModel: "gpt-5.4",
    implementModel: "gpt-5.3-codex",
    quickEditModel: "gpt-5.4-mini",
    generalModel: "gpt-5.4-mini",
    verifyModel: "gpt-5.4",
  },
};

function toSettingsPatch(args: { profile: StaveAutoModelProfile }): StaveAutoModelSettingsPatch {
  const { profile } = args;
  return {
    staveAutoClassifierModel: profile.classifierModel,
    staveAutoSupervisorModel: profile.supervisorModel,
    staveAutoPlanModel: profile.planModel,
    staveAutoAnalyzeModel: profile.analyzeModel,
    staveAutoImplementModel: profile.implementModel,
    staveAutoQuickEditModel: profile.quickEditModel,
    staveAutoGeneralModel: profile.generalModel,
    staveAutoVerifyModel: profile.verifyModel,
  };
}

export function buildStaveAutoModelSettingsPatch(args: {
  presetId: StaveAutoModelPresetId;
}): StaveAutoModelSettingsPatch {
  return toSettingsPatch({
    profile: STAVE_AUTO_MODEL_PRESET_PROFILES[args.presetId],
  });
}

export function detectStaveAutoModelPreset(args: {
  settings: StaveAutoModelSettingsPatch;
}): StaveAutoModelPresetId | null {
  for (const preset of STAVE_AUTO_MODEL_PRESETS) {
    const presetSettings = buildStaveAutoModelSettingsPatch({ presetId: preset.id });
    if (
      presetSettings.staveAutoClassifierModel === args.settings.staveAutoClassifierModel
      && presetSettings.staveAutoSupervisorModel === args.settings.staveAutoSupervisorModel
      && presetSettings.staveAutoPlanModel === args.settings.staveAutoPlanModel
      && presetSettings.staveAutoAnalyzeModel === args.settings.staveAutoAnalyzeModel
      && presetSettings.staveAutoImplementModel === args.settings.staveAutoImplementModel
      && presetSettings.staveAutoQuickEditModel === args.settings.staveAutoQuickEditModel
      && presetSettings.staveAutoGeneralModel === args.settings.staveAutoGeneralModel
      && presetSettings.staveAutoVerifyModel === args.settings.staveAutoVerifyModel
    ) {
      return preset.id;
    }
  }
  return null;
}

export const DEFAULT_STAVE_AUTO_PROFILE: StaveAutoProfile = {
  ...STAVE_AUTO_MODEL_PRESET_PROFILES[DEFAULT_STAVE_AUTO_MODEL_PRESET_ID],
  orchestrationMode: "auto",
  maxSubtasks: 3,
  maxParallelSubtasks: 2,
  allowCrossProviderWorkers: true,
  claudeFastModeSupported: true,
  codexFastModeSupported: true,
  fastMode: false,
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
    claudeFastModeSupported: settings.claudeFastModeVisible,
    codexFastModeSupported: settings.codexFastModeVisible,
    fastMode: settings.staveAutoFastMode,
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
