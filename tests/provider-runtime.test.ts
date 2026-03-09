import { describe, expect, test } from "bun:test";
import { parseNormalizedEvent } from "@/lib/providers/runtime";

describe("parseNormalizedEvent", () => {
  test("accepts valid tool event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "tool",
        toolName: "bash",
        input: "ls",
        state: "input-available",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool");
  });

  test("accepts valid plan_ready event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "plan_ready",
        planText: "Ship it.",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("plan_ready");
  });

  test("accepts valid usage event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "usage",
        inputTokens: 123,
        outputTokens: 45,
        cacheReadTokens: 12,
        totalCostUsd: 0.01,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("usage");
  });

  test("accepts valid prompt suggestions event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "prompt_suggestions",
        suggestions: ["Refactor that function next"],
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("prompt_suggestions");
  });

  test("rejects invalid event", () => {
    const parsed = parseNormalizedEvent({ payload: { type: "tool", state: "bad" } });
    expect(parsed).toBeNull();
  });
});
