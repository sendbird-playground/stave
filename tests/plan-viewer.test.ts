import { describe, expect, test } from "bun:test";
import { resolvePlanViewerInsets, resolvePlanViewerLayout, resolvePlanViewerState } from "@/components/session/plan-viewer.utils";

describe("resolvePlanViewerState", () => {
  test("shows a completed Claude plan response in the viewer", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
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
      canReplyToPlan: true,
    });
  });

  test("shows plan viewer for Codex when a plan response exists", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: true,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
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
      canReplyToPlan: true,
    });
  });

  test("shows preparing state for Claude plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: true,
      latestPlanMessage: null,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("shows preparing state for Codex experimental plan mode while a turn is active and no plan yet", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: true,
      isTurnActive: true,
      latestPlanMessage: null,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
      canReplyToPlan: false,
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
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Read the codebase\n2. Make changes",
      },
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
      canReplyToPlan: false,
    });
  });

  test("waits for Codex to finish the current turn before allowing plan replies", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: true,
      isTurnActive: true,
      latestPlanMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "assistant",
        providerId: "codex",
        isPlanResponse: true,
        isStreaming: true,
        planText: "1. Inspect\n2. Patch",
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: false,
    });
  });

  test("keeps the viewer open while revising a plan in plan mode", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "user",
        providerId: "user",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: true,
      canReplyToPlan: true,
    });
  });

  test("hides the inline viewer once the task has moved past plan review", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
      lastMessage: {
        role: "user",
        providerId: "user",
        isPlanResponse: false,
        isStreaming: false,
        planText: undefined,
      },
    });

    expect(state).toEqual({
      planText: "1. Inspect\n2. Patch",
      isPlanPreparing: false,
      isPlanPending: false,
      canReplyToPlan: false,
    });
  });

  test("still shows the viewer when the latest message is the plan response", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: {
        role: "assistant",
        providerId: "claude-code",
        isPlanResponse: true,
        isStreaming: false,
        planText: "1. Inspect\n2. Patch",
      },
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
      canReplyToPlan: true,
    });
  });

  test("stays hidden when no plan mode and no plan response", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "default",
      codexExperimentalPlanMode: false,
      isTurnActive: false,
      latestPlanMessage: null,
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
      canReplyToPlan: false,
    });
  });
});

describe("resolvePlanViewerInsets", () => {
  test("anchors the viewer above the chat input dock in normal mode", () => {
    expect(resolvePlanViewerInsets({
      isExpanded: false,
      inputDockHeight: 76,
    })).toEqual({
      topOffset: null,
      rightOffset: 16,
      bottomOffset: 84,
    });
  });

  test("keeps expanded mode pinned to the full chat viewport above the input dock", () => {
    expect(resolvePlanViewerInsets({
      isExpanded: true,
      inputDockHeight: 76,
    })).toEqual({
      topOffset: 12,
      rightOffset: 16,
      bottomOffset: 84,
    });
  });
});

describe("resolvePlanViewerLayout", () => {
  test("anchors the normal viewer to the bottom-right and grows leftward", () => {
    expect(resolvePlanViewerLayout({
      viewState: "normal",
      inputDockHeight: 76,
    })).toEqual({
      wrapperClassName: "pointer-events-none absolute z-20",
      wrapperStyle: {
        right: 16,
        bottom: 84,
        width: "calc(100% - 32px)",
        maxWidth: 672,
      },
      cardClassName: "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
    });
  });

  test("anchors the expanded viewer to the same bottom-right origin above the input dock", () => {
    expect(resolvePlanViewerLayout({
      viewState: "expanded",
      inputDockHeight: 76,
    })).toEqual({
      wrapperClassName: "pointer-events-none absolute z-20",
      wrapperStyle: {
        right: 16,
        bottom: 84,
        width: "calc(100% - 32px)",
        height: "max(0px, calc(100% - 96px))",
      },
      cardClassName: "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg h-full w-full",
    });
  });

  test("keeps the dragged minimized viewer at its explicit position", () => {
    expect(resolvePlanViewerLayout({
      viewState: "minimized",
      inputDockHeight: 76,
      dragPos: {
        x: 120,
        y: 48,
      },
    })).toEqual({
      wrapperClassName: "pointer-events-none absolute z-20",
      wrapperStyle: {
        top: 48,
        left: 120,
      },
      cardClassName: "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg w-72",
    });
  });
});
