import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { PersistenceWorkspaceSnapshot } from "../electron/persistence/types";

const canRunNativeSqlite = typeof Bun === "undefined";
const nativeSqliteTest = canRunNativeSqlite ? test : test.skip;

async function loadSqliteStore() {
  const mod = await import("../electron/persistence/sqlite-store");
  return mod.SqliteStore;
}

function createSnapshot(): PersistenceWorkspaceSnapshot {
  return {
    version: 1,
    activeTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Task One",
        provider: "claude-code",
        updatedAt: "2026-03-06T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      {
        id: "task-2",
        title: "Task Two",
        provider: "codex",
        updatedAt: "2026-03-06T00:10:00.000Z",
        unread: false,
        archivedAt: "2026-03-06T00:11:00.000Z",
      },
    ],
    messagesByTask: {
      "task-1": [
        {
          id: "m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "hello",
          isStreaming: false,
          parts: [{ type: "text", text: "hello" }],
        },
      ],
      "task-2": [],
    },
  };
}

describe("SqliteStore", () => {
  let rootDir = "";
  let dbPath = "";

  beforeEach(() => {
    rootDir = path.join(tmpdir(), `stave-sqlite-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rootDir, { recursive: true });
    dbPath = path.join(rootDir, "app.sqlite");
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  nativeSqliteTest("recovers workspace snapshot and turn journal across restart", async () => {
    const SqliteStore = await loadSqliteStore();
    const snapshot = createSnapshot();
    const turnId = "turn-restart-1";

    {
      const store = new SqliteStore({ dbPath });
      store.upsertWorkspace({
        id: "ws-1",
        name: "Workspace One",
        snapshot,
      });
      store.beginTurn({
        id: turnId,
        workspaceId: "ws-1",
        taskId: "task-1",
        providerId: "codex",
        createdAt: "2026-03-06T01:00:00.000Z",
      });
      store.appendTurnEvent({
        id: "event-1",
        turnId,
        sequence: 1,
        eventType: "text",
        payload: { text: "start" },
        createdAt: "2026-03-06T01:00:01.000Z",
      });
      store.appendTurnEvent({
        id: "event-2",
        turnId,
        sequence: 2,
        eventType: "done",
        payload: {},
        createdAt: "2026-03-06T01:00:02.000Z",
      });
      store.completeTurn({ id: turnId, completedAt: "2026-03-06T01:00:03.000Z" });
      store.close();
    }

    const reopened = new SqliteStore({ dbPath });
    const summaries = reopened.listWorkspaceSummaries();
    const loaded = reopened.loadWorkspaceSnapshot({ workspaceId: "ws-1" });
    const replay = reopened.listTurnEvents({ turnId });
    const replayFromTwo = reopened.listTurnEvents({ turnId, afterSequence: 2 });
    reopened.close();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe("ws-1");
    expect(loaded).toEqual(snapshot);
    expect(replay.map((item) => item.sequence)).toEqual([1, 2]);
    expect(replayFromTwo.map((item) => item.sequence)).toEqual([2]);
    expect(replay.at(-1)?.eventType).toBe("done");
    expect(reopened.listTurns({ workspaceId: "ws-1", taskId: "task-1" })[0]).toMatchObject({
      id: turnId,
      eventCount: 2,
    });
  });

  nativeSqliteTest("enforces unique (turn_id, sequence) idempotency constraint", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });
    store.beginTurn({
      id: "turn-dup",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "claude-code",
    });
    store.appendTurnEvent({
      id: "event-a",
      turnId: "turn-dup",
      sequence: 1,
      eventType: "system",
      payload: { ok: true },
    });

    expect(() =>
      store.appendTurnEvent({
        id: "event-b",
        turnId: "turn-dup",
        sequence: 1,
        eventType: "system",
        payload: { ok: false },
      })
    ).toThrow();
    store.close();
  });

  nativeSqliteTest("lists the latest turn for each task in a workspace", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.beginTurn({
      id: "turn-task-1-old",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:00.000Z",
    });
    store.beginTurn({
      id: "turn-task-1-new",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:02.000Z",
    });
    store.appendTurnEvent({
      id: "event-task-1-new",
      turnId: "turn-task-1-new",
      sequence: 1,
      eventType: "text",
      payload: { type: "text", text: "newest" },
      createdAt: "2026-03-06T01:00:03.000Z",
    });
    store.beginTurn({
      id: "turn-task-2",
      workspaceId: "ws-1",
      taskId: "task-2",
      providerId: "claude-code",
      createdAt: "2026-03-06T01:00:01.000Z",
    });

    const turns = store.listLatestTurnsForWorkspace({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.id)).toEqual([
      "turn-task-1-new",
      "turn-task-2",
    ]);
    expect(turns[0]?.eventCount).toBe(1);

    store.close();
  });

  nativeSqliteTest("keeps request snapshots in the journal without inflating visible event counts", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    store.beginTurn({
      id: "turn-request-snapshot",
      workspaceId: "ws-1",
      taskId: "task-1",
      providerId: "codex",
      createdAt: "2026-03-06T01:00:00.000Z",
    });
    store.appendTurnEvent({
      id: "event-request-snapshot",
      turnId: "turn-request-snapshot",
      sequence: 0,
      eventType: "request_snapshot",
      payload: {
        type: "request_snapshot",
        prompt: "fallback prompt",
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
            content: "hello",
            parts: [{ type: "text", text: "hello" }],
          },
          contextParts: [],
        },
      },
      createdAt: "2026-03-06T01:00:00.500Z",
    });
    store.appendTurnEvent({
      id: "event-visible",
      turnId: "turn-request-snapshot",
      sequence: 1,
      eventType: "text",
      payload: { type: "text", text: "hello" },
      createdAt: "2026-03-06T01:00:01.000Z",
    });

    const replay = store.listTurnEvents({ turnId: "turn-request-snapshot" });
    const summaries = store.listTurns({ workspaceId: "ws-1", taskId: "task-1" });

    expect(replay.map((event) => event.sequence)).toEqual([0, 1]);
    expect(replay[0]?.eventType).toBe("request_snapshot");
    expect(summaries[0]?.eventCount).toBe(1);

    store.close();
  });

  nativeSqliteTest("stores notification history with dedupe and read state", async () => {
    const SqliteStore = await loadSqliteStore();
    const store = new SqliteStore({ dbPath });

    const first = store.createNotification({
      notification: {
        id: "notification-task-complete",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:00.000Z",
      },
    });
    const duplicate = store.createNotification({
      notification: {
        id: "notification-task-complete-duplicate",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:05.000Z",
      },
    });
    const approval = store.createNotification({
      notification: {
        id: "notification-approval",
        kind: "task.approval_requested",
        title: "Refactor notifications",
        body: "Bash: Allow command",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: {
          type: "approval",
          requestId: "approval-1",
          messageId: "task-1-m-2",
        },
        payload: {
          toolName: "Bash",
          description: "Allow command",
        },
        dedupeKey: "task.approval_requested:turn-1:approval-1",
        createdAt: "2026-03-06T01:11:00.000Z",
      },
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.notification?.id).toBe("notification-task-complete");
    expect(approval.inserted).toBe(true);

    const allNotifications = store.listNotifications();
    expect(allNotifications.map((notification) => notification.id)).toEqual([
      "notification-approval",
      "notification-task-complete",
    ]);

    const markedApproval = store.markNotificationRead({
      id: "notification-approval",
      readAt: "2026-03-06T01:12:00.000Z",
    });
    expect(markedApproval?.readAt).toBe("2026-03-06T01:12:00.000Z");

    const unreadNotifications = store.listNotifications({ unreadOnly: true });
    expect(unreadNotifications.map((notification) => notification.id)).toEqual([
      "notification-task-complete",
    ]);

    const changedCount = store.markAllNotificationsRead({
      readAt: "2026-03-06T01:13:00.000Z",
    });
    expect(changedCount).toBe(1);
    expect(store.listNotifications({ unreadOnly: true })).toEqual([]);

    store.close();
  });
});
