import { describe, expect, test } from "bun:test";
import { resolveTodoFloaterVisibility } from "@/components/session/todo-floater.utils";

describe("resolveTodoFloaterVisibility", () => {
  const baseProgress = {
    todos: [
      { content: "Review overlap handling", status: "in_progress" as const },
    ],
    totalCount: 1,
    completedCount: 0,
    hasPendingTodos: false,
    hasInProgressTodos: true,
  };

  test("shows the todo floater above the chat input when work is active", () => {
    expect(resolveTodoFloaterVisibility({
      progress: baseProgress,
      todoState: "input-streaming",
      isTurnActive: true,
      lingering: false,
      planViewerVisible: false,
    })).toBe(true);
  });

  test("hides the todo floater whenever the plan viewer owns that slot", () => {
    expect(resolveTodoFloaterVisibility({
      progress: baseProgress,
      todoState: "input-streaming",
      isTurnActive: true,
      lingering: false,
      planViewerVisible: true,
    })).toBe(false);
  });
});
