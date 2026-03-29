import { describe, expect, test } from "bun:test";
import { buildCodexConfigOverrides, mapCodexItemEvent, resolveApprovalPolicy } from "../electron/providers/codex-sdk-runtime";

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
  test("returns explicit Codex config overrides including raw reasoning on", () => {
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

  test("keeps an explicit raw reasoning off toggle so the UI can disable it reliably", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexShowRawAgentReasoning: false,
        codexReasoningSummary: "auto",
        codexSupportsReasoningSummaries: "auto",
      },
    })).toEqual({
      show_raw_agent_reasoning: false,
    });
  });

  test("omits auto/default Codex config values when no explicit toggle is present", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexReasoningSummary: "auto",
        codexSupportsReasoningSummaries: "auto",
      },
    })).toBeUndefined();
  });
});

describe("resolveApprovalPolicy", () => {
  test("returns undefined for unknown or deprecated approval modes", () => {
    expect(resolveApprovalPolicy({ runtimeValue: undefined })).toBeUndefined();
    expect(resolveApprovalPolicy({ envValue: "on-failure" })).toBeUndefined();
  });
});
