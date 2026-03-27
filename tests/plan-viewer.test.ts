import { describe, expect, test } from "bun:test";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";

describe("resolvePlanViewerState", () => {
  test("shows a completed Claude plan response in the viewer", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
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

  test("stays hidden for Codex even if a plan-like message exists", () => {
    const state = resolvePlanViewerState({
      activeProvider: "codex",
      claudePermissionMode: "plan",
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
      isPlanPending: false,
    });
  });

  test("shows preparing state only for Claude plan mode while a turn is active", () => {
    const state = resolvePlanViewerState({
      activeProvider: "claude-code",
      claudePermissionMode: "plan",
      isTurnActive: true,
      lastMessage: null,
    });

    expect(state).toEqual({
      planText: "",
      isPlanPreparing: true,
      isPlanPending: false,
    });
  });
});
