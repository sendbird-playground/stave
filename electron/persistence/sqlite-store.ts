import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type {
  PersistenceLocalMcpRequestLog,
  PersistenceLocalMcpRequestLogCreateInput,
  PersistenceLocalMcpRequestLogPage,
  PersistenceTaskMessagesPage,
  PersistenceWorkspaceShell,
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

interface WorkspaceMessageRow {
  id: string;
  task_id: string;
  role: "user" | "assistant";
  model: string;
  provider_id: string;
  content: string;
  is_streaming: number;
  parts_json: string;
  message_json: string | null;
}

interface TaskMessageCountRow {
  task_id: string;
  count: number;
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

interface LocalMcpRequestLogRow {
  id: string;
  http_method: string;
  path: string;
  rpc_method: string | null;
  rpc_request_id: string | null;
  tool_name: string | null;
  status_code: number;
  duration_ms: number;
  has_request_payload: number;
  request_payload_json: string | null;
  error_message: string | null;
  created_at: string;
}

const MAX_LOCAL_MCP_REQUEST_LOGS = 500;

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

      CREATE TABLE IF NOT EXISTS local_mcp_request_logs (
        id TEXT PRIMARY KEY,
        http_method TEXT NOT NULL,
        path TEXT NOT NULL,
        rpc_method TEXT,
        rpc_request_id TEXT,
        tool_name TEXT,
        status_code INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        request_payload_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_mcp_request_logs_created
        ON local_mcp_request_logs (created_at DESC, id DESC);
    `);
    try {
      this.db.exec("ALTER TABLE messages ADD COLUMN message_json TEXT");
    } catch {
      // column already exists
    }
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

  private mapLocalMcpRequestLogRow(row: LocalMcpRequestLogRow): PersistenceLocalMcpRequestLog {
    return {
      id: row.id,
      httpMethod: row.http_method,
      path: row.path,
      rpcMethod: row.rpc_method,
      rpcRequestId: row.rpc_request_id,
      toolName: row.tool_name,
      statusCode: row.status_code,
      durationMs: row.duration_ms,
      hasRequestPayload: row.has_request_payload === 1,
      requestPayload: row.request_payload_json ? JSON.parse(row.request_payload_json) : null,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  private getLocalMcpRequestLogCount(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM local_mcp_request_logs
    `).get() as { count: number };
    return row.count;
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

  private createWorkspaceShell(args: {
    snapshot: PersistenceWorkspaceSnapshot;
    messageCountByTask: Record<string, number>;
  }): PersistenceWorkspaceShell {
    return {
      activeTaskId: args.snapshot.activeTaskId,
      tasks: args.snapshot.tasks,
      promptDraftByTask: args.snapshot.promptDraftByTask ?? {},
      providerConversationByTask: args.snapshot.providerConversationByTask ?? {},
      editorTabs: args.snapshot.editorTabs ?? [],
      activeEditorTabId: args.snapshot.activeEditorTabId ?? null,
      workspaceInformation: args.snapshot.workspaceInformation,
      messageCountByTask: args.messageCountByTask,
    };
  }

  private parseWorkspacePayload(args: { snapshotJson: string }): PersistenceWorkspaceShell | PersistenceWorkspaceSnapshot {
    return JSON.parse(args.snapshotJson) as PersistenceWorkspaceShell | PersistenceWorkspaceSnapshot;
  }

  private toWorkspaceShell(args: {
    payload: PersistenceWorkspaceShell | PersistenceWorkspaceSnapshot;
  }): PersistenceWorkspaceShell {
    if ("messagesByTask" in args.payload) {
      const snapshot = args.payload as PersistenceWorkspaceSnapshot;
      return this.createWorkspaceShell({
        snapshot,
        messageCountByTask: Object.fromEntries(
          Object.entries(snapshot.messagesByTask).map(([taskId, messages]) => [taskId, messages.length] as const),
        ),
      });
    }
    return {
      promptDraftByTask: {},
      providerConversationByTask: {},
      editorTabs: [],
      activeEditorTabId: null,
      messageCountByTask: {},
      ...args.payload,
    };
  }

  private readWorkspacePayload(args: { workspaceId: string }) {
    const row = this.db
      .prepare("SELECT snapshot_json FROM workspaces WHERE id = ?")
      .get(args.workspaceId) as WorkspaceSnapshotRow | undefined;
    if (!row) {
      return null;
    }
    const payload = this.parseWorkspacePayload({ snapshotJson: row.snapshot_json });
    return {
      row,
      payload,
      shell: this.toWorkspaceShell({ payload }),
    };
  }

  private mapTaskMessageRow(args: {
    workspaceId: string;
    taskId: string;
    row: WorkspaceMessageRow;
  }) {
    if (args.row.message_json) {
      return JSON.parse(args.row.message_json) as PersistenceWorkspaceSnapshot["messagesByTask"][string][number];
    }
    const prefix = `${args.workspaceId}:${args.taskId}:`;
    return {
      id: args.row.id.startsWith(prefix) ? args.row.id.slice(prefix.length) : args.row.id,
      role: args.row.role,
      model: args.row.model,
      providerId: args.row.provider_id,
      content: args.row.content,
      isStreaming: args.row.is_streaming === 1,
      parts: JSON.parse(args.row.parts_json),
    };
  }

  private insertTaskMessages(args: {
    workspaceId: string;
    taskId: string;
    messages: PersistenceWorkspaceSnapshot["messagesByTask"][string];
  }) {
    for (const message of args.messages) {
      const persistedMessageRowId = `${args.workspaceId}:${args.taskId}:${message.id}`;
      this.db.prepare(`
        INSERT INTO messages (
          id, workspace_id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        persistedMessageRowId,
        args.workspaceId,
        args.taskId,
        message.role,
        message.model,
        message.providerId,
        message.content,
        message.isStreaming ? 1 : 0,
        JSON.stringify(message.parts ?? []),
        JSON.stringify(message),
      );
    }
  }

  private loadAllTaskMessages(args: {
    workspaceId: string;
    taskId: string;
  }) {
    const rows = this.db.prepare(`
      SELECT id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
      FROM messages
      WHERE workspace_id = ? AND task_id = ?
      ORDER BY rowid ASC
    `).all(args.workspaceId, args.taskId) as WorkspaceMessageRow[];
    return rows.map((row) => this.mapTaskMessageRow({ ...args, row }));
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

  createLocalMcpRequestLog(args: {
    log: PersistenceLocalMcpRequestLogCreateInput;
  }) {
    const createdAt = args.log.createdAt ?? new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO local_mcp_request_logs (
          id,
          http_method,
          path,
          rpc_method,
          rpc_request_id,
          tool_name,
          status_code,
          duration_ms,
          request_payload_json,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        args.log.id,
        args.log.httpMethod,
        args.log.path,
        args.log.rpcMethod ?? null,
        args.log.rpcRequestId ?? null,
        args.log.toolName ?? null,
        args.log.statusCode,
        args.log.durationMs,
        args.log.requestPayload === null ? null : JSON.stringify(args.log.requestPayload),
        args.log.errorMessage ?? null,
        createdAt,
      );

      this.db.prepare(`
        DELETE FROM local_mcp_request_logs
        WHERE id NOT IN (
          SELECT id
          FROM local_mcp_request_logs
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
      `).run(MAX_LOCAL_MCP_REQUEST_LOGS);
    });

    tx();
  }

  listLocalMcpRequestLogs(args?: {
    limit?: number;
    offset?: number;
    includePayload?: boolean;
  }): PersistenceLocalMcpRequestLogPage {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 100));
    const total = this.getLocalMcpRequestLogCount();
    const maxOffset = total === 0 ? 0 : Math.floor((total - 1) / limit) * limit;
    const offset = Math.max(0, Math.min(args?.offset ?? 0, maxOffset));
    const requestPayloadColumn = args?.includePayload === true
      ? "request_payload_json"
      : "NULL AS request_payload_json";
    const rows = this.db.prepare(`
      SELECT
        id,
        http_method,
        path,
        rpc_method,
        rpc_request_id,
        tool_name,
        status_code,
        duration_ms,
        CASE WHEN request_payload_json IS NULL THEN 0 ELSE 1 END AS has_request_payload,
        ${requestPayloadColumn},
        error_message,
        created_at
      FROM local_mcp_request_logs
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      OFFSET ?
    `).all(limit, offset) as LocalMcpRequestLogRow[];

    return {
      logs: rows.map((row) => this.mapLocalMcpRequestLogRow(row)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  getLocalMcpRequestLog(args: {
    id: string;
    includePayload?: boolean;
  }): PersistenceLocalMcpRequestLog | null {
    const requestPayloadColumn = args.includePayload === true
      ? "request_payload_json"
      : "NULL AS request_payload_json";
    const row = this.db.prepare(`
      SELECT
        id,
        http_method,
        path,
        rpc_method,
        rpc_request_id,
        tool_name,
        status_code,
        duration_ms,
        CASE WHEN request_payload_json IS NULL THEN 0 ELSE 1 END AS has_request_payload,
        ${requestPayloadColumn},
        error_message,
        created_at
      FROM local_mcp_request_logs
      WHERE id = ?
    `).get(args.id) as LocalMcpRequestLogRow | undefined;

    return row ? this.mapLocalMcpRequestLogRow(row) : null;
  }

  clearLocalMcpRequestLogs(): number {
    const result = this.db.prepare("DELETE FROM local_mcp_request_logs").run();
    return result.changes;
  }

  loadWorkspaceShell(args: { workspaceId: string }): PersistenceWorkspaceShell | null {
    const payloadEntry = this.readWorkspacePayload(args);
    return payloadEntry?.shell ?? null;
  }

  loadTaskMessagesPage(args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }): PersistenceTaskMessagesPage | null {
    const payloadEntry = this.readWorkspacePayload({ workspaceId: args.workspaceId });
    if (!payloadEntry) {
      return null;
    }

    const limit = Math.max(1, Math.min(500, args.limit ?? 120));
    const offset = Math.max(0, args.offset ?? 0);

    if ("messagesByTask" in payloadEntry.payload) {
      const allMessages = (payloadEntry.payload as PersistenceWorkspaceSnapshot).messagesByTask[args.taskId] ?? [];
      const start = Math.max(allMessages.length - offset - limit, 0);
      const end = Math.max(allMessages.length - offset, 0);
      return {
        messages: allMessages.slice(start, end),
        totalCount: allMessages.length,
        limit,
        offset,
        hasMoreOlder: start > 0,
      };
    }

    const totalCount = payloadEntry.shell.messageCountByTask?.[args.taskId]
      ?? (() => {
        const row = this.db.prepare(`
          SELECT COUNT(*) AS count
          FROM messages
          WHERE workspace_id = ? AND task_id = ?
        `).get(args.workspaceId, args.taskId) as { count: number };
        return row.count;
      })();
    const rows = this.db.prepare(`
      SELECT id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
      FROM messages
      WHERE workspace_id = ? AND task_id = ?
      ORDER BY rowid DESC
      LIMIT ?
      OFFSET ?
    `).all(args.workspaceId, args.taskId, limit, offset) as WorkspaceMessageRow[];

    return {
      messages: rows
        .reverse()
        .map((row) => this.mapTaskMessageRow({ workspaceId: args.workspaceId, taskId: args.taskId, row })),
      totalCount,
      limit,
      offset,
      hasMoreOlder: offset + rows.length < totalCount,
    };
  }

  loadWorkspaceSnapshot(args: { workspaceId: string }): PersistenceWorkspaceSnapshot | null {
    const payloadEntry = this.readWorkspacePayload(args);
    if (!payloadEntry) {
      return null;
    }
    if ("messagesByTask" in payloadEntry.payload) {
      return payloadEntry.payload as PersistenceWorkspaceSnapshot;
    }
    const { messageCountByTask: _messageCountByTask, ...shell } = payloadEntry.shell;
    return {
      ...shell,
      messagesByTask: Object.fromEntries(
        payloadEntry.shell.tasks.map((task) => [
          task.id,
          this.loadAllTaskMessages({ workspaceId: args.workspaceId, taskId: task.id }),
        ] as const),
      ),
    };
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
    const tx = this.db.transaction(() => {
      const existingPayloadEntry = this.readWorkspacePayload({ workspaceId: args.id });
      const existingTaskIds = new Set(existingPayloadEntry?.shell.tasks.map((task) => task.id) ?? []);
      const nextTaskIds = new Set(args.snapshot.tasks.map((task) => task.id));
      const providedTaskIds = new Set(
        Object.keys(args.snapshot.messagesByTask).filter((taskId) => nextTaskIds.has(taskId)),
      );
      const removedTaskIds = [...existingTaskIds].filter((taskId) => !nextTaskIds.has(taskId));
      const preservedLegacyTaskIds = existingPayloadEntry && "messagesByTask" in existingPayloadEntry.payload
        ? args.snapshot.tasks
            .map((task) => task.id)
            .filter((taskId) => !providedTaskIds.has(taskId) && taskId in (existingPayloadEntry.payload as PersistenceWorkspaceSnapshot).messagesByTask)
        : [];

      this.db.prepare(`
        INSERT INTO workspace_meta (id, name, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `).run(args.id, args.name, now);

      this.db.prepare(`
        DELETE FROM tasks WHERE workspace_id = ?
      `).run(args.id);

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

      for (const taskId of removedTaskIds) {
        this.db.prepare("DELETE FROM messages WHERE workspace_id = ? AND task_id = ?").run(args.id, taskId);
      }

      if (existingPayloadEntry && "messagesByTask" in existingPayloadEntry.payload) {
        const legacySnapshot = existingPayloadEntry.payload as PersistenceWorkspaceSnapshot;
        for (const taskId of preservedLegacyTaskIds) {
          this.db.prepare("DELETE FROM messages WHERE workspace_id = ? AND task_id = ?").run(args.id, taskId);
          this.insertTaskMessages({
            workspaceId: args.id,
            taskId,
            messages: legacySnapshot.messagesByTask[taskId] ?? [],
          });
        }
      }

      for (const [taskId, messages] of Object.entries(args.snapshot.messagesByTask)) {
        if (!nextTaskIds.has(taskId)) {
          continue;
        }
        this.db.prepare("DELETE FROM messages WHERE workspace_id = ? AND task_id = ?").run(args.id, taskId);
        this.insertTaskMessages({
          workspaceId: args.id,
          taskId,
          messages,
        });
      }

      const countRows = this.db.prepare(`
        SELECT task_id, COUNT(*) AS count
        FROM messages
        WHERE workspace_id = ?
        GROUP BY task_id
      `).all(args.id) as TaskMessageCountRow[];
      const countByTask = new Map(countRows.map((row) => [row.task_id, row.count] as const));
      const shell = this.createWorkspaceShell({
        snapshot: args.snapshot,
        messageCountByTask: Object.fromEntries(
          args.snapshot.tasks.map((task) => [task.id, countByTask.get(task.id) ?? 0] as const),
        ),
      });
      const snapshotJson = JSON.stringify(shell);

      this.db.prepare(`
        INSERT INTO workspaces (id, name, updated_at, snapshot_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at,
          snapshot_json = excluded.snapshot_json
      `).run(args.id, args.name, now, snapshotJson);
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
