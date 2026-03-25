export interface PersistenceTaskRow {
  id: string;
  title: string;
  provider: "claude-code" | "codex";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
}

export interface PersistenceChatMessageRow {
  id: string;
  role: "user" | "assistant";
  model: string;
  providerId: string;
  content: string;
  isStreaming?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
  };
  promptSuggestions?: string[];
  parts: unknown[];
}

export interface PersistenceWorkspaceSnapshot {
  activeTaskId: string;
  tasks: PersistenceTaskRow[];
  messagesByTask: Record<string, PersistenceChatMessageRow[]>;
  promptDraftByTask?: Record<string, { text: string; attachedFilePaths: string[] }>;
  editorTabs?: Array<{
    id: string;
    filePath: string;
    kind?: "text" | "image";
    language: string;
    content: string;
    originalContent?: string;
    savedContent?: string;
    baseRevision?: string | null;
    hasConflict: boolean;
    isDirty: boolean;
  }>;
  activeEditorTabId?: string | null;
}

export interface PersistenceWorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PersistenceTurnEvent {
  id: string;
  turnId: string;
  sequence: number;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface PersistenceTurnSummary {
  id: string;
  workspaceId: string;
  taskId: string;
  providerId: "claude-code" | "codex";
  createdAt: string;
  completedAt: string | null;
  eventCount: number;
}

export interface PersistenceRpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface PersistenceRpcSuccessResponse<TResult = unknown> {
  id: string;
  ok: true;
  result: TResult;
}

export interface PersistenceRpcErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export type PersistenceRpcResponse<TResult = unknown> =
  | PersistenceRpcSuccessResponse<TResult>
  | PersistenceRpcErrorResponse;
