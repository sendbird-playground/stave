import { describe, expect, test } from "bun:test";
import { buildProviderRuntimeOptions, normalizeCodexApprovalPolicy } from "@/store/provider-runtime-options";

const settings = {
  chatStreamingEnabled: true,
  providerDebugStream: false,
  providerTimeoutMs: 3600000,
  claudePermissionMode: "acceptEdits",
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
  claudeAllowUnsandboxedCommands: true,
  claudeEffort: "medium",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: true,
  claudeFastMode: false,
  claudeFastModeVisible: true,
  codexSandboxMode: "workspace-write",
  codexSkipGitRepoCheck: false,
  codexNetworkAccessEnabled: true,
  codexApprovalPolicy: "on-request",
  codexPathOverride: "",
  codexModelReasoningEffort: "medium",
  codexWebSearchMode: "disabled",
  codexShowRawAgentReasoning: false,
  codexReasoningSummary: "auto",
  codexSupportsReasoningSummaries: "auto",
  codexFastMode: true,
  codexExperimentalPlanMode: false,
  codexFastModeVisible: true,
  staveAutoClassifierModel: "claude-haiku-4-5",
  staveAutoSupervisorModel: "claude-sonnet-4-6",
  staveAutoPlanModel: "claude-opus-4-6",
  staveAutoAnalyzeModel: "claude-sonnet-4-6",
  staveAutoImplementModel: "gpt-5.4",
  staveAutoQuickEditModel: "gpt-5.4",
  staveAutoGeneralModel: "claude-sonnet-4-6",
  staveAutoVerifyModel: "claude-haiku-4-5",
  staveAutoOrchestrationMode: "auto",
  staveAutoMaxSubtasks: 3,
  staveAutoMaxParallelSubtasks: 2,
  staveAutoAllowCrossProviderWorkers: true,
  staveAutoFastMode: false,
} as const;

describe("normalizeCodexApprovalPolicy", () => {
  test("falls back to the safe default when persisted data is invalid", () => {
    expect(normalizeCodexApprovalPolicy({ value: "bogus" })).toBe("on-request");
  });
});

describe("buildProviderRuntimeOptions", () => {
  test("forces Codex plan turns onto a read-only sandbox", () => {
    expect(buildProviderRuntimeOptions({
      provider: "codex",
      model: "gpt-5.4",
      settings: {
        ...settings,
        codexSandboxMode: "danger-full-access",
        codexExperimentalPlanMode: true,
      },
      providerSession: null,
    })).toMatchObject({
      model: "gpt-5.4",
      codexApprovalPolicy: "never",
      codexSandboxMode: "read-only",
      codexExperimentalPlanMode: true,
    });
  });

  test("forwards both resume ids when Stave routes across providers", () => {
    expect(buildProviderRuntimeOptions({
      provider: "stave",
      model: "stave-auto",
      settings,
      providerSession: {
        "claude-code": "claude-session-1",
        codex: "codex-thread-1",
      },
    })).toMatchObject({
      model: "stave-auto",
      claudeResumeSessionId: "claude-session-1",
      codexResumeThreadId: "codex-thread-1",
      codexFastMode: true,
      codexExperimentalPlanMode: false,
    });
  });

  test("limits resume ids to the active provider in direct turns", () => {
    expect(buildProviderRuntimeOptions({
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      settings,
      providerSession: {
        "claude-code": "claude-session-1",
        codex: "codex-thread-1",
      },
    })).toMatchObject({
      model: "claude-sonnet-4-6",
      claudeResumeSessionId: "claude-session-1",
    });

    expect(buildProviderRuntimeOptions({
      provider: "codex",
      model: "gpt-5.4",
      settings,
      providerSession: {
        "claude-code": "claude-session-1",
        codex: "codex-thread-1",
      },
    })).toMatchObject({
      model: "gpt-5.4",
      codexResumeThreadId: "codex-thread-1",
      codexSandboxMode: "workspace-write",
      codexExperimentalPlanMode: false,
    });
  });
});
