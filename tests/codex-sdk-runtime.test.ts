import { describe, expect, test } from "bun:test";
import {
  buildCodexConfigOverrides,
  buildCodexTodoPlanText,
  extractProposedPlan,
  mapCodexItemEvent,
  resolveApprovalPolicy,
  resolveCodexPlanReadyText,
} from "../electron/providers/codex-sdk-runtime";

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

  test("suppresses inline system messages for file_change items and only surfaces failures", () => {
    expect(mapCodexItemEvent({
      lifecycle: "item.started",
      item: {
        id: "file-change-1",
        type: "file_change",
        changes: [{ path: "src/app.ts" }],
      } as any,
    })).toEqual([]);

    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "file-change-2",
        type: "file_change",
        status: "failed",
        changes: [{ path: "src/app.ts" }],
      } as any,
    })).toEqual([
      {
        type: "error",
        message: "File change failed: src/app.ts",
        recoverable: false,
      },
    ]);
  });

  test("emits plan_ready when agent_message contains <proposed_plan> tags", () => {
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plan-test-1",
        type: "agent_message",
        text: "<proposed_plan>\nShip the fix.\n</proposed_plan>",
      },
    } as const);
    expect(events).toEqual([
      { type: "text", text: "<proposed_plan>\nShip the fix.\n</proposed_plan>", segmentId: "plan-test-1" },
      { type: "plan_ready", planText: "Ship the fix." },
    ]);
  });

  test("emits plan_ready for structured plan item on completion", () => {
    // Future-proofing: when Codex CLI exec JSONL emits type:"plan" items
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      // Cast because the SDK hasn't added PlanItem to ThreadItem yet
      item: {
        id: "plan-structured-1",
        type: "plan",
        plan_markdown: "## Plan\n- Step 1\n- Step 2",
      } as any,
    });
    expect(events).toEqual([
      { type: "plan_ready", planText: "## Plan\n- Step 1\n- Step 2" },
    ]);
  });

  test("streams plan item text during updates", () => {
    const item = {
      id: "plan-stream-1",
      type: "plan",
      plan_markdown: "Step 1 done",
    } as any;

    const started = mapCodexItemEvent({ lifecycle: "item.started", item });
    expect(started).toEqual([
      { type: "text", text: "Step 1 done", segmentId: "plan-stream-1" },
    ]);

    const updated = mapCodexItemEvent({
      lifecycle: "item.updated",
      item: { ...item, plan_markdown: "Step 1 done\nStep 2 done" },
    });
    expect(updated).toEqual([
      { type: "text", text: "\nStep 2 done", segmentId: "plan-stream-1" },
    ]);

    const completed = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: { ...item, plan_markdown: "Step 1 done\nStep 2 done" },
    });
    expect(completed).toEqual([
      { type: "plan_ready", planText: "Step 1 done\nStep 2 done" },
    ]);
  });

  test("handles empty plan item completion without leaking state", () => {
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plan-empty-1",
        type: "plan",
        plan_markdown: "  ",
      } as any,
    });
    expect(events).toEqual([]);
  });

  test("agent_message without <proposed_plan> is still plain text", () => {
    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plain-msg-1",
        type: "agent_message",
        text: "Just a regular message.",
      },
    } as const)).toEqual([
      { type: "text", text: "Just a regular message.", segmentId: "plain-msg-1" },
    ]);
  });
});

describe("extractProposedPlan", () => {
  test("extracts plan content from valid tags", () => {
    expect(extractProposedPlan("<proposed_plan>\nHello world\n</proposed_plan>")).toBe("Hello world");
  });

  test("returns null when no tags present", () => {
    expect(extractProposedPlan("just regular text")).toBeNull();
  });

  test("returns null when closing tag is missing", () => {
    expect(extractProposedPlan("<proposed_plan>\nincomplete")).toBeNull();
  });

  test("handles plan with surrounding text", () => {
    const text = "Some preamble\n<proposed_plan>\n## My Plan\n- do stuff\n</proposed_plan>\nSome epilogue";
    expect(extractProposedPlan(text)).toBe("## My Plan\n- do stuff");
  });
});

describe("buildCodexTodoPlanText", () => {
  test("formats todo items into markdown plan text", () => {
    expect(buildCodexTodoPlanText({
      items: [
        { text: "Inspect repo layout", completed: true },
        { text: "Implement runtime toggle", completed: false },
      ],
    })).toBe("## Draft Plan\n- [x] Inspect repo layout\n- [ ] Implement runtime toggle");
  });

  test("returns null when todo items are empty or blank", () => {
    expect(buildCodexTodoPlanText({
      items: [{ text: "  ", completed: false }],
    })).toBeNull();
  });
});

describe("resolveCodexPlanReadyText", () => {
  test("prefers the final pending message when available", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: "Ship the patch.",
      latestTodoPlanText: "## Draft Plan\n- [ ] ignored",
    })).toBe("Ship the patch.");
  });

  test("extracts proposed plan text from tagged final messages", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: "<proposed_plan>\n- step 1\n</proposed_plan>",
    })).toBe("- step 1");
  });

  test("falls back to the latest todo-list plan when no final message exists", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: null,
      latestTodoPlanText: "## Draft Plan\n- [ ] step 1",
    })).toBe("## Draft Plan\n- [ ] step 1");
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

  test("adds plan-mode config overrides for experimental Codex plan mode", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexExperimentalPlanMode: true,
        codexModelReasoningEffort: "low",
      },
    })).toEqual({
      collaboration_mode_kind: "plan",
      plan_mode_reasoning_effort: "low",
    });
  });
});

describe("resolveApprovalPolicy", () => {
  test("returns undefined for unknown or deprecated approval modes", () => {
    expect(resolveApprovalPolicy({ runtimeValue: undefined })).toBeUndefined();
    expect(resolveApprovalPolicy({ envValue: "on-failure" })).toBeUndefined();
  });

  test("forces never in plan mode when a fallback policy is provided", () => {
    expect(resolveApprovalPolicy({
      runtimeValue: "on-request",
      planMode: true,
      fallback: "on-request",
    })).toBe("never");
  });
});
