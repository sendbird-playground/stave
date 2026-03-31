import { describe, expect, test } from "bun:test";
import {
  buildChatInputRuntimeQuickControls,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
} from "@/components/session/chat-input.runtime";

const updateSettings = () => {};

const baseArgs = {
  activeProvider: "codex" as const,
  permissionMode: "on-request" as const,
  providerTimeoutMs: 3600000,
  claudePermissionMode: "acceptEdits" as const,
  claudePermissionModeBeforePlan: null,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
  claudeAllowUnsandboxedCommands: true,
  claudeEffort: "medium" as const,
  claudeThinkingMode: "adaptive" as const,
  claudeAgentProgressSummaries: true,
  claudeFastMode: false,
  codexSandboxMode: "workspace-write" as const,
  codexSkipGitRepoCheck: false,
  codexNetworkAccessEnabled: true,
  codexApprovalPolicy: "on-request" as const,
  codexModelReasoningEffort: "high" as const,
  codexWebSearchMode: "live" as const,
  codexShowRawAgentReasoning: true,
  codexReasoningSummary: "detailed" as const,
  codexSupportsReasoningSummaries: "enabled" as const,
  codexFastMode: true,
  codexExperimentalPlanMode: true,
  codexPathOverride: "/opt/homebrew/bin/codex",
  staveAutoFastMode: false,
  staveAutoOrchestrationMode: "auto" as const,
  staveAutoMaxSubtasks: 3,
  staveAutoAllowCrossProviderWorkers: true,
  staveAutoMaxParallelSubtasks: 2,
  updateSettings,
};

describe("chat-input runtime helpers", () => {
  test("builds Codex quick controls from shared option metadata", () => {
    const controls = buildChatInputRuntimeQuickControls(baseArgs);

    expect(controls.map((control) => control.id)).toEqual([
      "permission-mode",
      "effort",
      "web-search",
    ]);
    expect(controls[1]?.value).toBe("high");
    expect(controls[2]?.value).toBe("live");
  });

  test("surfaces Codex runtime status items including binary override", () => {
    const items = buildChatInputRuntimeStatusItems(baseArgs);

    expect(items.find((item) => item.id === "timeout")?.value).toBe("1 hour");
    expect(items.find((item) => item.id === "plan-mode")?.value).toBe("Experimental");
    expect(items.find((item) => item.id === "summary")?.value).toBe("Detailed");
    expect(items.find((item) => item.id === "codex-binary")?.value).toBe(".../bin/codex");
  });

  test("only forwards command-catalog runtime options for Claude", () => {
    expect(buildCommandCatalogRuntimeOptions({
      ...baseArgs,
      modelClaude: "claude-sonnet-4-6",
    })).toBeUndefined();

    expect(buildCommandCatalogRuntimeOptions({
      ...baseArgs,
      activeProvider: "claude-code",
      modelClaude: "claude-sonnet-4-6",
    })).toMatchObject({
      model: "claude-sonnet-4-6",
      claudePermissionMode: "acceptEdits",
      claudeThinkingMode: "adaptive",
    });
  });
});
