import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type {
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

interface TableInfoRow {
  name: string;
}

interface TurnSummaryRow {
  id: string;
  workspace_id: string;
  task_id: string;
  provider_id: "claude-code" | "codex";
  created_at: string;
  completed_at: string | null;
  event_count: number;
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
    `);

    const taskColumns = this.db.prepare("PRAGMA table_info(tasks)").all() as TableInfoRow[];
    if (!taskColumns.some((column) => column.name === "archived_at")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN archived_at TEXT");
    }
  }

  listWorkspaceSummaries(): PersistenceWorkspaceSummary[] {
    const rows = this.db
      .prepare("SELECT id, name, updated_at FROM workspace_meta ORDER BY updated_at DESC")
      .all() as WorkspaceMetaRow[];

    if (rows.length > 0) {
      return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }));
    }

    const fallback = this.db
      .prepare("SELECT id, name, updated_at FROM workspaces ORDER BY updated_at DESC")
      .all() as WorkspaceMetaRow[];
    return fallback.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }));
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

  deleteWorkspace(args: { workspaceId: string }) {
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
    providerId: "claude-code" | "codex";
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
