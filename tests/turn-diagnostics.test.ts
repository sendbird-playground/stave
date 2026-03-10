import { describe, expect, test } from "bun:test";
import { formatTurnDuration, summarizeTurnDiagnostics } from "@/lib/providers/turn-diagnostics";

describe("turn diagnostics", () => {
  test("summarizes completed turns with stop reasons and event counts", () => {
    const summary = summarizeTurnDiagnostics({
      turn: {
        id: "turn-1",
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-09T00:00:00.000Z",
        completedAt: "2026-03-09T00:00:04.000Z",
        eventCount: 4,
      },
      replay: [
        {
          persisted: {
            id: "event-1",
            turnId: "turn-1",
            sequence: 1,
            eventType: "thinking",
            payload: { type: "thinking", text: "plan", isStreaming: true },
            createdAt: "2026-03-09T00:00:00.500Z",
          },
          event: { type: "thinking", text: "plan", isStreaming: true },
        },
        {
          persisted: {
            id: "event-2",
            turnId: "turn-1",
            sequence: 2,
            eventType: "tool",
            payload: { type: "tool", toolName: "bash", input: "ls", state: "input-available" },
            createdAt: "2026-03-09T00:00:01.000Z",
          },
          event: { type: "tool", toolName: "bash", input: "ls", state: "input-available" },
        },
        {
          persisted: {
            id: "event-3",
            turnId: "turn-1",
            sequence: 3,
            eventType: "usage",
            payload: { type: "usage", inputTokens: 10, outputTokens: 20 },
            createdAt: "2026-03-09T00:00:03.000Z",
          },
          event: { type: "usage", inputTokens: 10, outputTokens: 20 },
        },
        {
          persisted: {
            id: "event-4",
            turnId: "turn-1",
            sequence: 4,
            eventType: "done",
            payload: { type: "done", stop_reason: "max_tokens" },
            createdAt: "2026-03-09T00:00:04.000Z",
          },
          event: { type: "done", stop_reason: "max_tokens" },
        },
      ],
    });

    expect(summary.status).toBe("truncated");
    expect(summary.stopReason).toBe("max_tokens");
    expect(summary.durationMs).toBe(4000);
    expect(summary.thinkingEvents).toBe(1);
    expect(summary.toolEvents).toBe(1);
    expect(summary.totalEvents).toBe(4);
  });

  test("marks inactive incomplete turns as interrupted", () => {
    const summary = summarizeTurnDiagnostics({
      turn: {
        id: "turn-2",
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-09T00:00:00.000Z",
        completedAt: null,
        eventCount: 1,
      },
      replay: [
        {
          persisted: {
            id: "event-1",
            turnId: "turn-2",
            sequence: 1,
            eventType: "text",
            payload: { type: "text", text: "partial" },
            createdAt: "2026-03-09T00:00:01.000Z",
          },
          event: { type: "text", text: "partial" },
        },
      ],
      isActiveTurn: false,
    });

    expect(summary.status).toBe("interrupted");
    expect(summary.lastEventType).toBe("text");
  });

  test("formats durations for running and completed turns", () => {
    expect(formatTurnDuration({ durationMs: null })).toBe("Running");
    expect(formatTurnDuration({ durationMs: 850 })).toBe("850ms");
    expect(formatTurnDuration({ durationMs: 4200 })).toBe("4.2s");
    expect(formatTurnDuration({ durationMs: null, status: "interrupted" })).toBe("Interrupted");
  });
});
