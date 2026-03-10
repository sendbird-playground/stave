import { describe, expect, test } from "bun:test";
import { buildCodexConfigOverrides, mapCodexItemEvent } from "../electron/providers/codex-sdk-runtime";

describe("mapCodexItemEvent", () => {
  test("emits a non-streaming reasoning completion event even when there is no final delta", () => {
    const item = {
      id: "reasoning-test-1",
      type: "reasoning",
      text: "thinking text",
    } as const;

    const streamingEvents = mapCodexItemEvent({
      lifecycle: "item.updated",
      item,
    });
    const completedEvents = mapCodexItemEvent({
      lifecycle: "item.completed",
      item,
    });

    expect(streamingEvents).toEqual([
      { type: "thinking", text: "thinking text", isStreaming: true },
    ]);
    expect(completedEvents).toEqual([
      { type: "thinking", text: "", isStreaming: false },
    ]);
  });

  test("emits live TodoWrite tool updates for todo_list items", () => {
    const item = {
      id: "todo-test-1",
      type: "todo_list",
      items: [
        { text: "Investigate logs", completed: true },
        { text: "Patch runtime", completed: false },
      ],
    } as const;

    expect(mapCodexItemEvent({
      lifecycle: "item.updated",
      item,
    })).toEqual([
      {
        type: "tool",
        toolUseId: "todo-test-1",
        toolName: "TodoWrite",
        input: JSON.stringify({
          todos: [
            { content: "Investigate logs", status: "completed" },
            { content: "Patch runtime", status: "pending" },
          ],
        }),
        state: "input-streaming",
      },
    ]);

    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item,
    })).toEqual([
      {
        type: "tool",
        toolUseId: "todo-test-1",
        toolName: "TodoWrite",
        input: JSON.stringify({
          todos: [
            { content: "Investigate logs", status: "completed" },
            { content: "Patch runtime", status: "pending" },
          ],
        }),
        state: "output-available",
      },
    ]);
  });

  test("treats plan-shaped agent messages as plain text", () => {
    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plan-test-1",
        type: "agent_message",
        text: "<proposed_plan>\nShip the fix.\n</proposed_plan>",
      },
    } as const)).toEqual([
      { type: "text", text: "<proposed_plan>\nShip the fix.\n</proposed_plan>" },
    ]);
  });
});

describe("buildCodexConfigOverrides", () => {
  test("returns only explicit Codex config overrides", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexShowRawAgentReasoning: true,
        codexReasoningSummary: "detailed",
        codexSupportsReasoningSummaries: "enabled",
      },
    })).toEqual({
      show_raw_agent_reasoning: true,
      model_reasoning_summary: "detailed",
      model_supports_reasoning_summaries: true,
    });
  });

  test("omits auto/default Codex config values", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexShowRawAgentReasoning: false,
        codexReasoningSummary: "auto",
        codexSupportsReasoningSummaries: "auto",
      },
    })).toBeUndefined();
  });
});
