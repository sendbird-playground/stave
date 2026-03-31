import { describe, expect, test } from "bun:test";
import { canSendEditorContextToTask } from "@/store/editor.utils";

describe("canSendEditorContextToTask", () => {
  test("allows send to agent when the task is idle and an editor tab is active", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: true,
      isTaskResponding: false,
    })).toBe(true);
  });

  test("blocks send to agent when there is no active editor tab", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: false,
      isTaskResponding: false,
    })).toBe(false);
  });

  test("blocks send to agent while the task already has an active turn", () => {
    expect(canSendEditorContextToTask({
      taskId: "task-a",
      hasActiveEditorTab: true,
      isTaskResponding: true,
    })).toBe(false);
  });
});
