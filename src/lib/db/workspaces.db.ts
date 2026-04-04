import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";
import { parseWorkspaceShell, parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface TaskProviderSessionState {
  "claude-code"?: string;
  codex?: string;
  // stave routes to claude-code/codex internally; this field is never set
  // but must exist so ProviderId-indexed accesses type-check correctly.
  stave?: string;
}

export interface WorkspaceSnapshot {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  editorTabs?: EditorTab[];
  activeEditorTabId?: string | null;
  workspaceInformation: WorkspaceInformationState;
}

export interface WorkspaceShell {
  activeTaskId: string;
  tasks: Task[];
  promptDraftByTask: Record<string, PromptDraft>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  editorTabs?: EditorTab[];
  activeEditorTabId?: string | null;
  workspaceInformation: WorkspaceInformationState;
  messageCountByTask: Record<string, number>;
}

export interface TaskMessagesPage {
  messages: ChatMessage[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMoreOlder: boolean;
}

interface RequiredPersistenceApi {
  listWorkspaces: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspaceShell?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    shell: WorkspaceShell | null;
  }>;
  loadWorkspace: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: WorkspaceSnapshot | null;
  }>;
  loadTaskMessages?: (args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }) => Promise<{
    ok: boolean;
    page: TaskMessagesPage | null;
  }>;
  upsertWorkspace: (args: {
    id: string;
    name: string;
    snapshot: WorkspaceSnapshot;
  }) => Promise<{ ok: boolean }>;
  loadProjectRegistry: () => Promise<{
    ok: boolean;
    projects: unknown[];
  }>;
  saveProjectRegistry: (args: {
    projects: unknown[];
  }) => Promise<{ ok: boolean }>;
  closeWorkspace: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
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

function buildShellFromSnapshot(snapshot: WorkspaceSnapshot): WorkspaceShell {
  return {
    activeTaskId: snapshot.activeTaskId,
    tasks: snapshot.tasks,
    promptDraftByTask: snapshot.promptDraftByTask,
    providerSessionByTask: snapshot.providerSessionByTask,
    editorTabs: snapshot.editorTabs,
    activeEditorTabId: snapshot.activeEditorTabId,
    workspaceInformation: snapshot.workspaceInformation,
    messageCountByTask: Object.fromEntries(
      Object.entries(snapshot.messagesByTask).map(([taskId, messages]) => [taskId, messages.length] as const)
    ),
  };
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

export async function loadWorkspaceShell(args: { workspaceId: string }): Promise<WorkspaceShell | null> {
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
    return buildShellFromSnapshot({
      ...parsed,
      messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: parsed.messagesByTask }),
    });
  }

  if (!persistence.loadWorkspaceShell) {
    const snapshot = await loadWorkspaceSnapshot(args);
    return snapshot ? buildShellFromSnapshot(snapshot) : null;
  }

  const response = await persistence.loadWorkspaceShell({ workspaceId: args.workspaceId });
  if (!response.ok) {
    throw new Error(`Failed to load workspace shell: ${args.workspaceId}`);
  }
  if (!response.shell) {
    return null;
  }
  const parsed = parseWorkspaceShell({ payload: response.shell });
  return parsed;
}

export async function loadTaskMessagesPage(args: {
  workspaceId: string;
  taskId: string;
  limit?: number;
  offset?: number;
}): Promise<TaskMessagesPage> {
  const limit = Math.max(1, Math.min(500, args.limit ?? 120));
  const offset = Math.max(0, args.offset ?? 0);
  const persistence = getPersistenceApi();
  if (!persistence) {
    const row = loadFallbackRows().find((item) => item.id === args.workspaceId);
    const snapshot = row?.snapshot ? parseWorkspaceSnapshot({ payload: row.snapshot }) : null;
    const messages = normalizeMessagesForSnapshot({
      messagesByTask: snapshot?.messagesByTask ?? {},
    })[args.taskId] ?? [];
    const start = Math.max(messages.length - offset - limit, 0);
    const end = Math.max(messages.length - offset, 0);
    const pageMessages = messages.slice(start, end);
    return {
      messages: pageMessages,
      totalCount: messages.length,
      limit,
      offset,
      hasMoreOlder: start > 0,
    };
  }

  if (!persistence.loadTaskMessages) {
    const snapshot = await loadWorkspaceSnapshot({ workspaceId: args.workspaceId });
    const messages = snapshot?.messagesByTask[args.taskId] ?? [];
    const start = Math.max(messages.length - offset - limit, 0);
    const end = Math.max(messages.length - offset, 0);
    const pageMessages = messages.slice(start, end);
    return {
      messages: pageMessages,
      totalCount: messages.length,
      limit,
      offset,
      hasMoreOlder: start > 0,
    };
  }

  const response = await persistence.loadTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit,
    offset,
  });
  if (!response.ok || !response.page) {
    throw new Error(`Failed to load task messages: ${args.workspaceId}/${args.taskId}`);
  }
  return {
    messages: normalizeMessagesForSnapshot({
      messagesByTask: { [args.taskId]: response.page.messages },
    })[args.taskId] ?? [],
    totalCount: response.page.totalCount,
    limit: response.page.limit,
    offset: response.page.offset,
    hasMoreOlder: response.page.hasMoreOlder,
  };
}

export async function closeWorkspacePersistence(args: { workspaceId: string }): Promise<void> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    const rows = loadFallbackRows().filter((row) => row.id !== args.workspaceId);
    saveFallbackRows({ rows });
    return;
  }
  await window.api?.persistence?.closeWorkspace?.({ workspaceId: args.workspaceId });
}

export async function loadProjectRegistrySnapshot(): Promise<unknown[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.loadProjectRegistry) {
    return [];
  }
  const response = await persistence.loadProjectRegistry();
  if (!response.ok) {
    throw new Error("Failed to load project registry from persistence bridge.");
  }
  return Array.isArray(response.projects) ? response.projects : [];
}

export async function saveProjectRegistrySnapshot(args: { projects: unknown[] }): Promise<void> {
  const persistence = getPersistenceApi();
  if (!persistence?.saveProjectRegistry) {
    return;
  }
  const response = await persistence.saveProjectRegistry({ projects: args.projects });
  if (!response.ok) {
    throw new Error("Failed to save project registry via persistence bridge.");
  }
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
