import { afterEach, describe, expect, test } from "bun:test";
import {
  listLatestWorkspaceTurns,
  listTaskTurns,
  loadTurnRequestSnapshot,
  loadTurnReplay,
  replayPersistedTurn,
} from "@/lib/db/turns.db";

const originalWindow = globalThis.window;

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("turn replay data access", () => {
  test("lists recent task turns and replays normalized turn events", async () => {
    setWindowApi({
      persistence: {
        listTaskTurns: async () => ({
          ok: true,
          turns: [{
            id: "turn-1",
            workspaceId: "ws-1",
            taskId: "task-1",
            providerId: "codex",
            createdAt: "2026-03-09T00:00:00.000Z",
            completedAt: "2026-03-09T00:00:02.000Z",
            eventCount: 2,
          }],
        }),
        listTurnEvents: async () => ({
          ok: true,
          events: [
            {
              id: "event-1",
              turnId: "turn-1",
              sequence: 1,
              eventType: "text",
              payload: { type: "text", text: "hello" },
              createdAt: "2026-03-09T00:00:01.000Z",
            },
            {
              id: "event-2",
              turnId: "turn-1",
              sequence: 2,
              eventType: "done",
              payload: { type: "done" },
              createdAt: "2026-03-09T00:00:02.000Z",
            },
          ],
        }),
      },
    });

    const turns = await listTaskTurns({
      workspaceId: "ws-1",
      taskId: "task-1",
    });
    const replay = await loadTurnReplay({ turnId: "turn-1" });
    const replayedTypes: string[] = [];
    for await (const item of replayPersistedTurn({ turnId: "turn-1" })) {
      replayedTypes.push(item.event.type);
    }

    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe("turn-1");
    expect(replay.map((item) => item.event.type)).toEqual(["text", "done"]);
    expect(replayedTypes).toEqual(["text", "done"]);
  });

  test("lists the latest turn for each task in a workspace", async () => {
    setWindowApi({
      persistence: {
        listLatestWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: "turn-task-2",
              workspaceId: "ws-1",
              taskId: "task-2",
              providerId: "claude-code",
              createdAt: "2026-03-10T00:00:03.000Z",
              completedAt: null,
              eventCount: 1,
            },
            {
              id: "turn-task-1",
              workspaceId: "ws-1",
              taskId: "task-1",
              providerId: "codex",
              createdAt: "2026-03-10T00:00:01.000Z",
              completedAt: "2026-03-10T00:00:02.000Z",
              eventCount: 2,
            },
          ],
        }),
      },
    });

    const turns = await listLatestWorkspaceTurns({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.taskId)).toEqual(["task-2", "task-1"]);
    expect(turns[0]?.completedAt).toBeNull();
  });

  test("loads a persisted request snapshot when present", async () => {
    setWindowApi({
      persistence: {
        listTurnEvents: async () => ({
          ok: true,
          events: [
            {
              id: "event-0",
              turnId: "turn-req-1",
              sequence: 0,
              eventType: "request_snapshot",
              payload: {
                type: "request_snapshot",
                prompt: "fallback prompt",
                conversation: {
                  target: {
                    providerId: "claude-code",
                    model: "claude-sonnet-4-6",
                  },
                  mode: "chat",
                  history: [],
                  input: {
                    role: "user",
                    providerId: "user",
                    model: "user",
                    content: "hello",
                    parts: [{ type: "text", text: "hello" }],
                  },
                  contextParts: [],
                },
              },
              createdAt: "2026-03-10T00:00:00.000Z",
            },
            {
              id: "event-1",
              turnId: "turn-req-1",
              sequence: 1,
              eventType: "text",
              payload: { type: "text", text: "hello" },
              createdAt: "2026-03-10T00:00:01.000Z",
            },
          ],
        }),
      },
    });

    const snapshot = await loadTurnRequestSnapshot({ turnId: "turn-req-1" });

    expect(snapshot).toEqual({
      type: "request_snapshot",
      prompt: "fallback prompt",
      conversation: {
        target: {
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
        },
        mode: "chat",
        history: [],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
        contextParts: [],
      },
    });
  });

  test("skips request snapshots during replay and maps legacy persisted events", async () => {
    const originalConsoleError = console.error;
    const consoleErrors: unknown[][] = [];
    console.error = (...args) => {
      consoleErrors.push(args);
    };

    try {
      setWindowApi({
        persistence: {
          listTurnEvents: async () => ({
            ok: true,
            events: [
              {
                id: "event-0",
                turnId: "turn-legacy-1",
                sequence: 0,
                eventType: "request_snapshot",
                payload: {
                  type: "request_snapshot",
                  prompt: "legacy prompt",
                },
                createdAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "event-1",
                turnId: "turn-legacy-1",
                sequence: 1,
                eventType: "AGENT_MESSAGE",
                payload: {
                  eventType: "AGENT_MESSAGE",
                  text: "legacy hello",
                },
                createdAt: "2026-03-10T00:00:01.000Z",
              },
              {
                id: "event-2",
                turnId: "turn-legacy-1",
                sequence: 2,
                eventType: "TASK_COMPLETE",
                payload: {
                  eventType: "TASK_COMPLETE",
                },
                createdAt: "2026-03-10T00:00:02.000Z",
              },
            ],
          }),
        },
      });

      const replay = await loadTurnReplay({ turnId: "turn-legacy-1" });

      expect(replay.map((item) => item.event.type)).toEqual(["text", "done"]);
      expect(replay[0]?.event).toEqual({
        type: "text",
        text: "legacy hello",
      });
      expect(consoleErrors).toEqual([]);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
