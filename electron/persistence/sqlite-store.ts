import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type {
  PersistenceProjectRegistryEntry,
  PersistenceNotificationCreateInput,
  PersistenceNotificationRecord,
  PersistenceTurnEvent,
  PersistenceTurnSummary,
  PersistenceWorkspaceSnapshot,
  PersistenceWorkspaceSummary,
} from "./types";

interface WorkspaceMetaRow {
  id: string;
  name: string;
  updated_at: string;
}

interface WorkspaceSnapshotRow {
  snapshot_json: string;
}

interface JsonValueRow {
  value_json: string;
}

interface TurnSummaryRow {
  id: string;
  workspace_id: string;
  task_id: string;
  provider_id: "claude-code" | "codex" | "stave";
  created_at: string;
  completed_at: string | null;
  event_count: number;
}

interface NotificationRow {
  id: string;
  kind: "task.turn_completed" | "task.approval_requested";
  title: string;
  body: string;
  project_path: string | null;
  project_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  task_id: string | null;
  task_title: string | null;
  turn_id: string | null;
  provider_id: "claude-code" | "codex" | "stave" | null;
  action_json: string | null;
  payload_json: string;
  created_at: string;
  read_at: string | null;
}

export class SqliteStore {
  private db: Database.Database;

  constructor(args: { dbPath: string }) {
    const dbPath = path.resolve(args.dbPath);
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_meta (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        unread INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated
        ON tasks (workspace_id, updated_at);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        content TEXT NOT NULL,
        is_streaming INTEGER NOT NULL DEFAULT 0,
        parts_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_workspace_task
        ON messages (workspace_id, task_id);

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_turns_workspace_task_created
        ON turns (workspace_id, task_id, created_at);

      CREATE TABLE IF NOT EXISTS turn_events (
        id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_events_turn_sequence
        ON turn_events (turn_id, sequence);

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        project_path TEXT,
        project_name TEXT,
        workspace_id TEXT,
        workspace_name TEXT,
        task_id TEXT,
        task_title TEXT,
        turn_id TEXT,
        provider_id TEXT,
        action_json TEXT,
        payload_json TEXT NOT NULL,
        source_dedupe_key TEXT,
        created_at TEXT NOT NULL,
        read_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source_dedupe
        ON notifications (source_dedupe_key)
        WHERE source_dedupe_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_notifications_created
        ON notifications (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
        ON notifications (read_at, created_at DESC);
    `);

  }

  private mapNotificationRow(row: NotificationRow): PersistenceNotificationRecord {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      projectPath: row.project_path,
      projectName: row.project_name,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      taskId: row.task_id,
      taskTitle: row.task_title,
      turnId: row.turn_id,
      providerId: row.provider_id,
      action: row.action_json ? JSON.parse(row.action_json) : null,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  }

  private getNotificationById(id: string): PersistenceNotificationRecord | null {
    const row = this.db.prepare(`
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at
      FROM notifications
      WHERE id = ?
    `).get(id) as NotificationRow | undefined;
    return row ? this.mapNotificationRow(row) : null;
  }

  private getNotificationByDedupeKey(dedupeKey: string): PersistenceNotificationRecord | null {
    const row = this.db.prepare(`
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at
      FROM notifications
      WHERE source_dedupe_key = ?
      LIMIT 1
    `).get(dedupeKey) as NotificationRow | undefined;
    return row ? this.mapNotificationRow(row) : null;
  }

  listWorkspaceSummaries(): PersistenceWorkspaceSummary[] {
    const rows = this.db
      .prepare("SELECT id, name, updated_at FROM workspace_meta ORDER BY updated_at DESC")
      .all() as WorkspaceMetaRow[];
    return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }));
  }

  createNotification(args: {
    notification: PersistenceNotificationCreateInput;
  }): { inserted: boolean; notification: PersistenceNotificationRecord | null } {
    const notification = args.notification;
    const createdAt = notification.createdAt ?? new Date().toISOString();
    const readAt = notification.readAt ?? null;
    const actionJson = notification.action ? JSON.stringify(notification.action) : null;
    const payloadJson = JSON.stringify(notification.payload ?? {});
    const dedupeKey = notification.dedupeKey ?? null;

    const result = this.db.prepare(`
      INSERT OR IGNORE INTO notifications (
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        source_dedupe_key,
        created_at,
        read_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notification.id,
      notification.kind,
      notification.title,
      notification.body,
      notification.projectPath ?? null,
      notification.projectName ?? null,
      notification.workspaceId ?? null,
      notification.workspaceName ?? null,
      notification.taskId ?? null,
      notification.taskTitle ?? null,
      notification.turnId ?? null,
      notification.providerId ?? null,
      actionJson,
      payloadJson,
      dedupeKey,
      createdAt,
      readAt,
    );

    if (result.changes > 0) {
      return {
        inserted: true,
        notification: this.getNotificationById(notification.id),
      };
    }

    if (dedupeKey) {
      return {
        inserted: false,
        notification: this.getNotificationByDedupeKey(dedupeKey),
      };
    }

    return {
      inserted: false,
      notification: this.getNotificationById(notification.id),
    };
  }

  listNotifications(args?: {
    limit?: number;
    unreadOnly?: boolean;
  }): PersistenceNotificationRecord[] {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const unreadOnly = args?.unreadOnly === true;
    const rows = this.db.prepare(`
      SELECT
        id,
        kind,
        title,
        body,
        project_path,
        project_name,
        workspace_id,
        workspace_name,
        task_id,
        task_title,
        turn_id,
        provider_id,
        action_json,
        payload_json,
        created_at,
        read_at
      FROM notifications
      ${unreadOnly ? "WHERE read_at IS NULL" : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(limit) as NotificationRow[];

    return rows.map((row) => this.mapNotificationRow(row));
  }

  markNotificationRead(args: {
    id: string;
    readAt?: string;
  }): PersistenceNotificationRecord | null {
    const readAt = args.readAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE notifications
      SET read_at = COALESCE(read_at, ?)
      WHERE id = ?
    `).run(readAt, args.id);
    return this.getNotificationById(args.id);
  }

  markAllNotificationsRead(args?: {
    readAt?: string;
  }): number {
    const readAt = args?.readAt ?? new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE notifications
      SET read_at = ?
      WHERE read_at IS NULL
    `).run(readAt);
    return result.changes;
  }

  loadWorkspaceSnapshot(args: { workspaceId: string }): PersistenceWorkspaceSnapshot | null {
    const row = this.db
      .prepare("SELECT snapshot_json FROM workspaces WHERE id = ?")
      .get(args.workspaceId) as WorkspaceSnapshotRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.snapshot_json) as PersistenceWorkspaceSnapshot;
  }

  loadProjectRegistry(): PersistenceProjectRegistryEntry[] {
    const row = this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get("project_registry") as JsonValueRow | undefined;
    if (!row) {
      return [];
    }
    return JSON.parse(row.value_json) as PersistenceProjectRegistryEntry[];
  }

  saveProjectRegistry(args: { projects: PersistenceProjectRegistryEntry[] }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO app_state (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run("project_registry", JSON.stringify(args.projects), now);
  }

  upsertWorkspace(args: {
    id: string;
    name: string;
    snapshot: PersistenceWorkspaceSnapshot;
  }) {
    const now = new Date().toISOString();
    const snapshotJson = JSON.stringify(args.snapshot);
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO workspaces (id, name, updated_at, snapshot_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at,
          snapshot_json = excluded.snapshot_json
      `).run(args.id, args.name, now, snapshotJson);

      this.db.prepare(`
        INSERT INTO workspace_meta (id, name, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `).run(args.id, args.name, now);

      this.db.prepare("DELETE FROM tasks WHERE workspace_id = ?").run(args.id);
      this.db.prepare("DELETE FROM messages WHERE workspace_id = ?").run(args.id);

      for (const task of args.snapshot.tasks) {
        const persistedTaskRowId = `${args.id}:${task.id}`;
        this.db.prepare(`
          INSERT INTO tasks (id, workspace_id, title, provider, updated_at, unread, archived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          persistedTaskRowId,
          args.id,
          task.title,
          task.provider,
          task.updatedAt,
          task.unread ? 1 : 0,
          task.archivedAt ?? null,
        );
      }

      for (const [taskId, messages] of Object.entries(args.snapshot.messagesByTask)) {
        for (const message of messages) {
          const persistedMessageRowId = `${args.id}:${taskId}:${message.id}`;
          this.db.prepare(`
            INSERT INTO messages (
              id, workspace_id, task_id, role, model, provider_id, content, is_streaming, parts_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            persistedMessageRowId,
            args.id,
            taskId,
            message.role,
            message.model,
            message.providerId,
            message.content,
            message.isStreaming ? 1 : 0,
            JSON.stringify(message.parts ?? []),
          );
        }
      }
    });

    tx();
  }

  closeWorkspace(args: { workspaceId: string }) {
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM turn_events
        WHERE turn_id IN (SELECT id FROM turns WHERE workspace_id = ?)
      `).run(args.workspaceId);
      this.db.prepare("DELETE FROM turns WHERE workspace_id = ?").run(args.workspaceId);
      this.db.prepare("DELETE FROM messages WHERE workspace_id = ?").run(args.workspaceId);
      this.db.prepare("DELETE FROM tasks WHERE workspace_id = ?").run(args.workspaceId);
      this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(args.workspaceId);
      this.db.prepare("DELETE FROM workspace_meta WHERE id = ?").run(args.workspaceId);
    });
    tx();
  }

  beginTurn(args: {
    id: string;
    workspaceId: string;
    taskId: string;
    providerId: "claude-code" | "codex" | "stave";
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(args.id, args.workspaceId, args.taskId, args.providerId, createdAt);
  }

  appendTurnEvent(args: {
    id: string;
    turnId: string;
    sequence: number;
    eventType: string;
    payload: unknown;
    createdAt?: string;
  }) {
    const createdAt = args.createdAt ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO turn_events (id, turn_id, sequence, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      args.id,
      args.turnId,
      args.sequence,
      args.eventType,
      JSON.stringify(args.payload),
      createdAt,
    );
  }

  completeTurn(args: { id: string; completedAt?: string }) {
    const completedAt = args.completedAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE turns
      SET completed_at = ?
      WHERE id = ?
    `).run(completedAt, args.id);
  }

  listTurnEvents(args: { turnId: string; afterSequence?: number; limit?: number }): PersistenceTurnEvent[] {
    const afterSequence = Math.max(0, args.afterSequence ?? 0);
    const limit = Math.max(1, Math.min(5000, args.limit ?? 2000));
    const rows = this.db.prepare(`
      SELECT id, turn_id, sequence, event_type, payload_json, created_at
      FROM turn_events
      WHERE turn_id = ? AND sequence >= ?
      ORDER BY sequence ASC
      LIMIT ?
    `).all(args.turnId, afterSequence, limit) as Array<{
      id: string;
      turn_id: string;
      sequence: number;
      event_type: string;
      payload_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      turnId: row.turn_id,
      sequence: row.sequence,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }));
  }

  listTurns(args: { workspaceId: string; taskId: string; limit?: number }): PersistenceTurnSummary[] {
    const limit = Math.max(1, Math.min(20, args.limit ?? 5));
    const rows = this.db.prepare(`
      SELECT
        turns.id,
        turns.workspace_id,
        turns.task_id,
        turns.provider_id,
        turns.created_at,
        turns.completed_at,
        COUNT(CASE WHEN turn_events.event_type != 'request_snapshot' THEN 1 END) AS event_count
      FROM turns
      LEFT JOIN turn_events ON turn_events.turn_id = turns.id
      WHERE turns.workspace_id = ? AND turns.task_id = ?
      GROUP BY turns.id, turns.workspace_id, turns.task_id, turns.provider_id, turns.created_at, turns.completed_at
      ORDER BY turns.created_at DESC
      LIMIT ?
    `).all(args.workspaceId, args.taskId, limit) as TurnSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      providerId: row.provider_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      eventCount: row.event_count,
    }));
  }

  listLatestTurnsForWorkspace(args: { workspaceId: string; limit?: number }): PersistenceTurnSummary[] {
    const limit = Math.max(1, Math.min(500, args.limit ?? 200));
    const rows = this.db.prepare(`
      SELECT id, workspace_id, task_id, provider_id, created_at, completed_at, event_count
      FROM (
        SELECT
          turns.id,
          turns.workspace_id,
          turns.task_id,
          turns.provider_id,
          turns.created_at,
          turns.completed_at,
          COUNT(CASE WHEN turn_events.event_type != 'request_snapshot' THEN 1 END) AS event_count,
          ROW_NUMBER() OVER (
            PARTITION BY turns.task_id
            ORDER BY turns.created_at DESC, turns.id DESC
          ) AS workspace_turn_rank
        FROM turns
        LEFT JOIN turn_events ON turn_events.turn_id = turns.id
        WHERE turns.workspace_id = ?
        GROUP BY turns.id, turns.workspace_id, turns.task_id, turns.provider_id, turns.created_at, turns.completed_at
      ) latest_turns
      WHERE workspace_turn_rank = 1
      ORDER BY created_at DESC
      LIMIT ?
    `).all(args.workspaceId, limit) as TurnSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
      providerId: row.provider_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      eventCount: row.event_count,
    }));
  }

  close() {
    this.db.close();
  }
}
