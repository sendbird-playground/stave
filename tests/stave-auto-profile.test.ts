import { describe, expect, test } from "bun:test";
import {
  applyStaveRoleRuntimeOverrides,
  buildStaveAutoModelSettingsPatch,
  buildStaveAutoProfileFromSettings,
  createDefaultStaveAutoRoleRuntimeOverrides,
  DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  detectStaveAutoModelPreset,
  normalizeStaveAutoRoleRuntimeOverrides,
} from "@/lib/providers/stave-auto-profile";

function createSettings(overrides: Partial<Parameters<typeof buildStaveAutoProfileFromSettings>[0]["settings"]> = {}) {
  return {
    ...buildStaveAutoModelSettingsPatch({ presetId: DEFAULT_STAVE_AUTO_MODEL_PRESET_ID }),
    staveAutoOrchestrationMode: "auto" as const,
    staveAutoMaxSubtasks: 3,
    staveAutoMaxParallelSubtasks: 2,
    staveAutoAllowCrossProviderWorkers: true,
    staveAutoFastMode: false,
    staveAutoRoleRuntimeOverrides: createDefaultStaveAutoRoleRuntimeOverrides(),
    claudeFastModeVisible: true,
    codexFastModeVisible: true,
    ...overrides,
  };
}

describe("stave auto profile presets", () => {
  test("uses GPT-5.4 as the recommended verify model", () => {
    const recommended = buildStaveAutoModelSettingsPatch({ presetId: DEFAULT_STAVE_AUTO_MODEL_PRESET_ID });

    expect(recommended.staveAutoImplementModel).toBe("gpt-5.3-codex");
    expect(recommended.staveAutoVerifyModel).toBe("gpt-5.4");
  });

  test("detects known presets from matching role settings", () => {
    expect(detectStaveAutoModelPreset({
      settings: buildStaveAutoModelSettingsPatch({ presetId: "recommended" }),
    })).toBe("recommended");
    expect(detectStaveAutoModelPreset({
      settings: buildStaveAutoModelSettingsPatch({ presetId: "recommended-1m" }),
    })).toBe("recommended-1m");
    expect(detectStaveAutoModelPreset({
      settings: buildStaveAutoModelSettingsPatch({ presetId: "claude-only" }),
    })).toBe("claude-only");
    expect(detectStaveAutoModelPreset({
      settings: buildStaveAutoModelSettingsPatch({ presetId: "codex-only" }),
    })).toBe("codex-only");
  });

  test("treats mixed manual values as custom", () => {
    const custom = buildStaveAutoModelSettingsPatch({ presetId: "recommended" });
    custom.staveAutoImplementModel = "claude-sonnet-4-6";

    expect(detectStaveAutoModelPreset({ settings: custom })).toBeNull();
  });

  test("lowers supervisor defaults across the built-in presets", () => {
    expect(buildStaveAutoModelSettingsPatch({ presetId: "recommended" }).staveAutoSupervisorModel).toBe("claude-sonnet-4-6");
    expect(buildStaveAutoModelSettingsPatch({ presetId: "recommended-1m" }).staveAutoSupervisorModel).toBe("claude-sonnet-4-6[1m]");
    expect(buildStaveAutoModelSettingsPatch({ presetId: "claude-only" }).staveAutoSupervisorModel).toBe("claude-sonnet-4-6");
    expect(buildStaveAutoModelSettingsPatch({ presetId: "codex-only" }).staveAutoSupervisorModel).toBe("gpt-5.4-mini");
  });

  test("recommended-1m preset uses [1m] models for supervisor, analyze and general", () => {
    const patch = buildStaveAutoModelSettingsPatch({ presetId: "recommended-1m" });

    expect(patch.staveAutoSupervisorModel).toBe("claude-sonnet-4-6[1m]");
    expect(patch.staveAutoAnalyzeModel).toBe("claude-opus-4-6[1m]");
    expect(patch.staveAutoGeneralModel).toBe("claude-sonnet-4-6[1m]");

    // Lightweight roles stay on standard-context models
    expect(patch.staveAutoClassifierModel).toBe("claude-haiku-4-5");
    expect(patch.staveAutoQuickEditModel).toBe("claude-haiku-4-5");
    expect(patch.staveAutoImplementModel).toBe("gpt-5.3-codex");
    expect(patch.staveAutoVerifyModel).toBe("gpt-5.4");
  });

  test("builds the runtime profile from preset-backed settings", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        ...buildStaveAutoModelSettingsPatch({ presetId: "codex-only" }),
        staveAutoFastMode: true,
      }),
    });

    expect(profile.classifierModel).toBe("gpt-5.4-mini");
    expect(profile.implementModel).toBe("gpt-5.3-codex");
    expect(profile.verifyModel).toBe("gpt-5.4");
    expect(profile.fastMode).toBe(true);
    expect(profile.claudeFastModeSupported).toBe(true);
    expect(profile.codexFastModeSupported).toBe(true);
  });

  test("normalizes partial role runtime overrides", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            implement: {
              codex: {
                reasoningEffort: "xhigh",
                fastMode: true,
              },
            },
          },
        }),
      }),
    });

    expect(profile.roleRuntimeOverrides?.implement.codex.reasoningEffort).toBe("xhigh");
    expect(profile.roleRuntimeOverrides?.implement.codex.fastMode).toBe(true);
    expect(profile.roleRuntimeOverrides?.general.claude.permissionMode).toBeUndefined();
  });
});

describe("applyStaveRoleRuntimeOverrides", () => {
  test("applies Claude role overrides on top of inherited runtime options", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            plan: {
              claude: {
                permissionMode: "acceptEdits",
                thinkingMode: "enabled",
                effort: "high",
                fastMode: true,
              },
            },
          },
        }),
      }),
    });

    expect(applyStaveRoleRuntimeOverrides({
      profile,
      role: "plan",
      model: "claude-opus-4-6",
      runtimeOptions: {
        claudePermissionMode: "auto",
        claudeThinkingMode: "adaptive",
        claudeEffort: "medium",
        claudeFastMode: false,
      },
    })).toMatchObject({
      claudePermissionMode: "acceptEdits",
      claudeThinkingMode: "enabled",
      claudeEffort: "high",
      claudeFastMode: true,
    });
  });

  test("applies Codex role overrides on top of inherited runtime options", () => {
    const profile = buildStaveAutoProfileFromSettings({
      settings: createSettings({
        staveAutoRoleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
          value: {
            implement: {
              codex: {
                approvalPolicy: "never",
                reasoningEffort: "xhigh",
                fastMode: false,
              },
            },
          },
        }),
      }),
    });

    expect(applyStaveRoleRuntimeOverrides({
      profile,
      role: "implement",
      model: "gpt-5.3-codex",
      runtimeOptions: {
        codexApprovalPolicy: "on-request",
        codexModelReasoningEffort: "medium",
        codexFastMode: true,
      },
    })).toMatchObject({
      codexApprovalPolicy: "never",
      codexModelReasoningEffort: "xhigh",
      codexFastMode: false,
    });
  });
});
