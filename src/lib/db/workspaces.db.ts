import type { ChatMessage, Task } from "@/types/chat";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import { CURRENT_WORKSPACE_SNAPSHOT_VERSION } from "@/lib/task-context/workspace-snapshot";

export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface TaskProviderConversationState {
  "claude-code"?: string;
  codex?: string;
}

export interface WorkspaceSnapshot {
  version: number;
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, { text: string; attachedFilePaths: string[] }>;
  providerConversationByTask: Record<string, TaskProviderConversationState>;
}

interface RequiredPersistenceApi {
  listWorkspaces: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspace: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: WorkspaceSnapshot | null;
  }>;
  upsertWorkspace: (args: {
    id: string;
    name: string;
    snapshot: WorkspaceSnapshot;
  }) => Promise<{ ok: boolean }>;
}

const fallbackStorageKey = "stave:workspace-fallback:v1";
let memoryFallbackRows: Array<{ id: string; name: string; updatedAt: string; snapshot: WorkspaceSnapshot }> = [];

function hasWindow() {
  return typeof window !== "undefined";
}

function loadFallbackRows() {
  if (!hasWindow()) {
    return memoryFallbackRows;
  }
  try {
    const raw = window.localStorage.getItem(fallbackStorageKey);
    if (!raw) {
      return memoryFallbackRows;
    }
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; updatedAt: string; snapshot: WorkspaceSnapshot }>;
    memoryFallbackRows = Array.isArray(parsed) ? parsed : memoryFallbackRows;
    return memoryFallbackRows;
  } catch {
    return memoryFallbackRows;
  }
}

function saveFallbackRows(args: { rows: Array<{ id: string; name: string; updatedAt: string; snapshot: WorkspaceSnapshot }> }) {
  memoryFallbackRows = args.rows;
  if (!hasWindow()) {
    return;
  }
  try {
    window.localStorage.setItem(fallbackStorageKey, JSON.stringify(args.rows));
  } catch {
    // ignore localStorage write errors and keep in-memory fallback
  }
}

function getPersistenceApi() {
  const api = window.api?.persistence;
  if (!api?.listWorkspaces || !api?.loadWorkspace || !api?.upsertWorkspace) {
    return null;
  }
  return api as RequiredPersistenceApi;
}

export async function listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    return loadFallbackRows()
      .map((row) => ({ id: row.id, name: row.name, updatedAt: row.updatedAt }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const response = await persistence.listWorkspaces();
  if (!response.ok) {
    throw new Error("Failed to list workspaces from persistence bridge.");
  }
  return response.rows;
}

export async function loadWorkspaceSnapshot(args: { workspaceId: string }): Promise<WorkspaceSnapshot | null> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    if (!row) {
      return null;
    }
    const parsed = parseWorkspaceSnapshot({ payload: row.snapshot });
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: parsed.messagesByTask }),
    };
  }
  const response = await persistence.loadWorkspace({ workspaceId: args.workspaceId });
  if (!response.ok) {
    throw new Error(`Failed to load workspace snapshot: ${args.workspaceId}`);
  }
  if (!response.snapshot) {
    return null;
  }
  const parsed = parseWorkspaceSnapshot({ payload: response.snapshot });
  if (!parsed) {
    return null;
  }
  return {
    ...parsed,
    messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: parsed.messagesByTask }),
  };
}

export async function deleteWorkspacePersistence(args: { workspaceId: string }): Promise<void> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows().filter((row) => row.id !== args.workspaceId);
    saveFallbackRows({ rows });
    return;
  }
  await window.api?.persistence?.deleteWorkspace?.({ workspaceId: args.workspaceId });
}

export async function upsertWorkspace(args: {
  id: string;
  name: string;
  snapshot: WorkspaceSnapshot;
}): Promise<void> {
  const validated = parseWorkspaceSnapshot({ payload: args.snapshot });
  if (!validated) {
    throw new Error(`Invalid workspace snapshot for upsert: ${args.id}`);
  }
  const normalized: WorkspaceSnapshot = {
    ...validated,
    version: CURRENT_WORKSPACE_SNAPSHOT_VERSION,
    messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: validated.messagesByTask }),
  };
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows();
    const nextUpdatedAt = new Date().toISOString();
    const nextRows = (() => {
      const existingIndex = rows.findIndex((row) => row.id === args.id);
      if (existingIndex < 0) {
        return [...rows, { id: args.id, name: args.name, updatedAt: nextUpdatedAt, snapshot: normalized }];
      }
      return rows.map((row, index) =>
        index === existingIndex
          ? { id: args.id, name: args.name, updatedAt: nextUpdatedAt, snapshot: normalized }
          : row
      );
    })();
    saveFallbackRows({ rows: nextRows });
    return;
  }
  const response = await persistence.upsertWorkspace({
    id: args.id,
    name: args.name,
    snapshot: normalized,
  });
  if (!response.ok) {
    throw new Error(`Failed to upsert workspace snapshot: ${args.id}`);
  }
}
