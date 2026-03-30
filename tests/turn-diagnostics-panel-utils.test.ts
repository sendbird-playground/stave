import { describe, expect, test } from "bun:test";
import {
  filterReplayEvents,
  formatRequestSnapshotPromptPreview,
  groupReplayEvents,
  getReplayEventFilterId,
  summarizeSessionOverview,
  getTurnPreviewStatus,
  pickSelectedReplayTurnId,
  summarizeReplayEventFilters,
} from "@/components/session/turn-diagnostics-panel.utils";

describe("turn diagnostics panel utils", () => {
  test("preserves an existing selected turn when it is still present", () => {
    expect(pickSelectedReplayTurnId({
      turns: [
        {
          id: "turn-3",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-03-11T00:00:03.000Z",
          completedAt: "2026-03-11T00:00:04.000Z",
          eventCount: 8,
        },
        {
          id: "turn-2",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-03-11T00:00:01.000Z",
          completedAt: "2026-03-11T00:00:02.000Z",
          eventCount: 5,
        },
      ],
      currentSelectedTurnId: "turn-2",
      activeTurnId: "turn-3",
    })).toBe("turn-2");
  });

  test("falls back to the active turn when the current selection disappears", () => {
    expect(pickSelectedReplayTurnId({
      turns: [
        {
          id: "turn-3",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-03-11T00:00:03.000Z",
          completedAt: null,
          eventCount: 8,
        },
        {
          id: "turn-2",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-03-11T00:00:01.000Z",
          completedAt: "2026-03-11T00:00:02.000Z",
          eventCount: 5,
        },
      ],
      currentSelectedTurnId: "turn-1",
      activeTurnId: "turn-3",
    })).toBe("turn-3");
  });

  test("falls back to the newest available turn when no selection is available", () => {
    expect(pickSelectedReplayTurnId({
      turns: [
        {
          id: "turn-3",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-03-11T00:00:03.000Z",
          completedAt: "2026-03-11T00:00:04.000Z",
          eventCount: 8,
        },
      ],
    })).toBe("turn-3");
  });

  test("derives recent-turn preview status from active-turn and completion state", () => {
    expect(getTurnPreviewStatus({
      turn: {
        id: "turn-3",
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-11T00:00:03.000Z",
        completedAt: null,
        eventCount: 8,
      },
      activeTurnId: "turn-3",
    })).toBe("running");

    expect(getTurnPreviewStatus({
      turn: {
        id: "turn-2",
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-11T00:00:01.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        eventCount: 5,
      },
      activeTurnId: "turn-3",
    })).toBe("completed");

    expect(getTurnPreviewStatus({
      turn: {
        id: "turn-1",
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-11T00:00:00.000Z",
        completedAt: null,
        eventCount: 1,
      },
      activeTurnId: "turn-3",
    })).toBe("interrupted");
  });

  test("maps replay events into stable filter buckets", () => {
    expect(getReplayEventFilterId({
      item: {
        persisted: {
          id: "event-1",
          turnId: "turn-1",
          sequence: 1,
          eventType: "tool",
          payload: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
          createdAt: "2026-03-11T00:00:01.000Z",
        },
        event: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
      },
    })).toBe("tools");

    expect(getReplayEventFilterId({
      item: {
        persisted: {
          id: "event-2",
          turnId: "turn-1",
          sequence: 2,
          eventType: "error",
          payload: { type: "error", message: "boom", recoverable: false },
          createdAt: "2026-03-11T00:00:02.000Z",
        },
        event: { type: "error", message: "boom", recoverable: false },
      },
    })).toBe("errors");
  });

  test("summarizes replay filter counts and filters the replay list", () => {
    const replay = [
      {
        persisted: {
          id: "event-1",
          turnId: "turn-1",
          sequence: 1,
          eventType: "thinking",
          payload: { type: "thinking", text: "plan", isStreaming: true },
          createdAt: "2026-03-11T00:00:00.500Z",
        },
        event: { type: "thinking", text: "plan", isStreaming: true },
      },
      {
        persisted: {
          id: "event-2",
          turnId: "turn-1",
          sequence: 2,
          eventType: "tool",
          payload: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
          createdAt: "2026-03-11T00:00:01.000Z",
        },
        event: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
      },
      {
        persisted: {
          id: "event-3",
          turnId: "turn-1",
          sequence: 3,
          eventType: "diff",
          payload: { type: "diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
          createdAt: "2026-03-11T00:00:02.000Z",
        },
        event: { type: "diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
      },
      {
        persisted: {
          id: "event-4",
          turnId: "turn-1",
          sequence: 4,
          eventType: "approval",
          payload: { type: "approval", toolName: "Bash", requestId: "approval-1", description: "Allow command" },
          createdAt: "2026-03-11T00:00:03.000Z",
        },
        event: { type: "approval", toolName: "Bash", requestId: "approval-1", description: "Allow command" },
      },
      {
        persisted: {
          id: "event-5",
          turnId: "turn-1",
          sequence: 5,
          eventType: "system",
          payload: { type: "system", content: "Generation aborted by user." },
          createdAt: "2026-03-11T00:00:04.000Z",
        },
        event: { type: "system", content: "Generation aborted by user." },
      },
      {
        persisted: {
          id: "event-6",
          turnId: "turn-1",
          sequence: 6,
          eventType: "error",
          payload: { type: "error", message: "boom", recoverable: false },
          createdAt: "2026-03-11T00:00:05.000Z",
        },
        event: { type: "error", message: "boom", recoverable: false },
      },
    ] as const;

    expect(summarizeReplayEventFilters({ replay })).toEqual([
      { id: "all", count: 6 },
      { id: "content", count: 1 },
      { id: "tools", count: 1 },
      { id: "edits", count: 1 },
      { id: "approvals", count: 1 },
      { id: "system", count: 1 },
      { id: "errors", count: 1 },
    ]);

    expect(filterReplayEvents({ replay, filter: "tools" }).map((item) => item.persisted.id)).toEqual(["event-2"]);
    expect(filterReplayEvents({ replay, filter: "errors" }).map((item) => item.persisted.id)).toEqual(["event-6"]);
    expect(groupReplayEvents({ replay }).map((group) => ({
      id: group.id,
      ids: group.events.map((item) => item.persisted.id),
    }))).toEqual([
      { id: "content", ids: ["event-1"] },
      { id: "tools", ids: ["event-2"] },
      { id: "edits", ids: ["event-3"] },
      { id: "approvals", ids: ["event-4"] },
      { id: "system", ids: ["event-5"] },
      { id: "errors", ids: ["event-6"] },
    ]);
  });

  test("shows selected skills when the fallback prompt is empty", () => {
    expect(formatRequestSnapshotPromptPreview({
      requestSnapshot: {
        type: "request_snapshot",
        prompt: "",
        conversation: {
          target: {
            providerId: "codex",
            model: "gpt-5.4",
          },
          mode: "chat",
          history: [],
          input: {
            role: "user",
            providerId: "user",
            model: "user",
            content: "",
            parts: [],
          },
          contextParts: [{
            type: "skill_context",
            skills: [{
              id: "local:shared:reviewer",
              slug: "reviewer",
              name: "reviewer",
              description: "Review code with a strict checklist.",
              scope: "local",
              provider: "shared",
              path: "/tmp/reviewer/SKILL.md",
              invocationToken: "$reviewer",
              instructions: "Review the code for regressions and missing tests.",
            }],
          }],
        },
      },
    })).toBe("(skill-only input; selected skills: $reviewer)");
  });

  test("keeps the empty fallback label when no skill context exists", () => {
    expect(formatRequestSnapshotPromptPreview({
      requestSnapshot: {
        type: "request_snapshot",
        prompt: "",
        conversation: {
          target: {
            providerId: "codex",
            model: "gpt-5.4",
          },
          mode: "chat",
          history: [],
          input: {
            role: "user",
            providerId: "user",
            model: "user",
            content: "",
            parts: [],
          },
          contextParts: [],
        },
      },
    })).toBe("(empty fallback prompt; provider runtime used canonical request)");
  });

  test("summarizes recent-session overview across turn bundles", () => {
    expect(summarizeSessionOverview({
      activeTurnId: "turn-3",
      turns: [
        {
          turn: {
            id: "turn-3",
            workspaceId: "ws-1",
            taskId: "task-1",
            providerId: "codex",
            createdAt: "2026-03-11T00:00:03.000Z",
            completedAt: null,
            eventCount: 3,
          },
          replay: [
            {
              persisted: {
                id: "event-1",
                turnId: "turn-3",
                sequence: 1,
                eventType: "tool",
                payload: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
                createdAt: "2026-03-11T00:00:03.100Z",
              },
              event: { type: "tool", toolName: "Read", input: "a", state: "output-available" },
            },
            {
              persisted: {
                id: "event-2",
                turnId: "turn-3",
                sequence: 2,
                eventType: "diff",
                payload: { type: "diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
                createdAt: "2026-03-11T00:00:03.200Z",
              },
              event: { type: "diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
            },
          ],
          requestSnapshot: {
            type: "request_snapshot",
            prompt: "p",
            conversation: {
              target: { providerId: "codex", model: "gpt-5-codex" },
              mode: "chat",
              history: [],
              input: { role: "user", content: "Hi", parts: [] },
              contextParts: [],
            },
          },
        },
        {
          turn: {
            id: "turn-2",
            workspaceId: "ws-1",
            taskId: "task-1",
            providerId: "claude-code",
            createdAt: "2026-03-11T00:00:02.000Z",
            completedAt: "2026-03-11T00:00:02.400Z",
            eventCount: 4,
          },
          replay: [
            {
              persisted: {
                id: "event-3",
                turnId: "turn-2",
                sequence: 1,
                eventType: "approval",
                payload: { type: "approval", toolName: "Bash", requestId: "approval-1", description: "Approve" },
                createdAt: "2026-03-11T00:00:02.050Z",
              },
              event: { type: "approval", toolName: "Bash", requestId: "approval-1", description: "Approve" },
            },
            {
              persisted: {
                id: "event-4",
                turnId: "turn-2",
                sequence: 2,
                eventType: "error",
                payload: { type: "error", message: "boom", recoverable: false },
                createdAt: "2026-03-11T00:00:02.100Z",
              },
              event: { type: "error", message: "boom", recoverable: false },
            },
            {
              persisted: {
                id: "event-5",
                turnId: "turn-2",
                sequence: 3,
                eventType: "diff",
                payload: { type: "diff", filePath: "src/a.ts", oldContent: "b", newContent: "c", status: "accepted" },
                createdAt: "2026-03-11T00:00:02.200Z",
              },
              event: { type: "diff", filePath: "src/a.ts", oldContent: "b", newContent: "c", status: "accepted" },
            },
            {
              persisted: {
                id: "event-6",
                turnId: "turn-2",
                sequence: 4,
                eventType: "done",
                payload: { type: "done", stop_reason: "max_tokens" },
                createdAt: "2026-03-11T00:00:02.400Z",
              },
              event: { type: "done", stop_reason: "max_tokens" },
            },
          ],
          requestSnapshot: {
            type: "request_snapshot",
            prompt: "p",
            conversation: {
              target: { providerId: "claude-code", model: "claude-sonnet-4" },
              mode: "chat",
              history: [],
              input: { role: "user", content: "Hi", parts: [] },
              contextParts: [],
            },
          },
        },
      ],
    })).toEqual({
      totalTurns: 2,
      totalEvents: 7,
      runningTurns: 1,
      completedTurns: 0,
      interruptedTurns: 0,
      truncatedTurns: 0,
      errorTurns: 1,
      toolEvents: 1,
      approvalEvents: 1,
      inputEvents: 0,
      diffEvents: 2,
      errorEvents: 1,
      filesTouched: [
        { filePath: "src/a.ts", count: 2 },
      ],
      providers: ["claude-code", "codex"],
      models: ["claude-sonnet-4", "gpt-5-codex"],
    });
  });
});
