import { describe, expect, test } from "bun:test";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";

describe("resolvePlanViewerState", () => {
  test("shows a completed Claude plan response in the viewer", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
    });
  });

  test("shows plan viewer for Codex when a plan response exists", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: true,
      isTurnActive: false,
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
    });
  });

  test("shows preparing state for Claude plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: true,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
    });
  });

  test("shows preparing state for Codex experimental plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: true,
      isTurnActive: true,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
    });
  });

  test("shows plan as pending (not preparing) when plan_ready arrives before done event", () => {
    // This is the critical fix: plan_ready fires before done, so isTurnActive is still true
    // and isStreaming is still true, but the plan text is available.
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: true,
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Read the codebase\n2. Make changes",
      },
    });

    expect(state).toEqual({
      planText: "1. Read the codebase\n2. Make changes",
      isPlanPreparing: false,
      isPlanPending: true,
    });
  });

  test("stays hidden when no plan mode and no plan response", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      lastMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: false,
      isPlanPending: false,
    });
  });
});
