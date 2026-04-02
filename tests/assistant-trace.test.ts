import { describe, expect, test } from "bun:test";
import { getTodoProgress } from "@/components/ai-elements/todo";
import { deriveTodoTraceStatus } from "@/components/session/message/assistant-trace.utils";

describe("getTodoProgress", () => {
  test("summarizes todo counts from tool input", () => {
    expect(getTodoProgress({
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "pending" },
          { content: "Verify tests", status: "pending" },
        ],
      }),
    })).toEqual({
      todos: [
        { content: "Inspect renderer", status: "completed" },
        { content: "Patch todo trace", status: "pending" },
        { content: "Verify tests", status: "pending" },
      ],
      totalCount: 3,
      completedCount: 1,
      hasPendingTodos: true,
      hasInProgressTodos: false,
    });
  });
});

describe("deriveTodoTraceStatus", () => {
  test("keeps the todo step active while unfinished todos remain", () => {
    expect(deriveTodoTraceStatus({
      state: "output-available",
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "pending" },
        ],
      }),
    })).toBe("active");
  });

  test("marks the todo step done once every todo is completed", () => {
    expect(deriveTodoTraceStatus({
      state: "output-available",
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "completed" },
        ],
      }),
    })).toBe("done");
  });
});
