import { type PersistedTurnSummary } from "@/lib/db/turns.db";
import {
  type TaskProviderSessionState,
  type WorkspaceShell,
  type WorkspaceSnapshot,
  loadWorkspaceShell,
  upsertWorkspace,
} from "@/lib/db/workspaces.db";
import { normalizeTaskControl } from "@/lib/tasks";
import { normalizeMessagesForSnapshot } from "@/lib/task-context/message-normalization";
import { createEmptyWorkspaceInformation, type WorkspaceInformationState } from "@/lib/workspace-information";
import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";

export const starterWorkspaceId = "base";
export const defaultWorkspaceName = "Default Workspace";
export const INTERRUPTED_TURN_NOTICE = "Generation interrupted because Stave was closed before this turn completed.";
export const WORKSPACE_SWITCH_TURN_NOTICE = "Generation interrupted because you switched workspaces before this turn completed.";

export interface WorkspaceSessionState {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  nativeSessionReadyByTask: Record<string, boolean>;
}

export function createEmptyWorkspaceState() {
  return {
    activeTaskId: "",
    tasks: [] as Task[],
    messagesByTask: {} as Record<string, ChatMessage[]>,
    messageCountByTask: {} as Record<string, number>,
    promptDraftByTask: {} as Record<string, PromptDraft>,
    workspaceInformation: createEmptyWorkspaceInformation(),
    editorTabs: [] as EditorTab[],
    activeEditorTabId: null as string | null,
    providerSessionByTask: {} as Record<string, TaskProviderSessionState>,
  };
}

export function buildNativeSessionReadyByTask(args: {
  tasks: Task[];
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  const next: Record<string, boolean> = {};

  for (const task of args.tasks) {
    const providerSession = args.providerSessionByTask[task.id];
    // stave has no native conversation of its own; treat as not ready
    next[task.id] = task.provider !== "stave" && Boolean(providerSession?.[task.provider]?.trim());
  }

  return next;
}

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function buildRecentTimestamp() {
  return new Date().toISOString();
}

function hasInterruptedTurnNotice(messages: ChatMessage[]) {
  return messages.some((message) =>
    message.role === "assistant"
    && message.parts.some((part) => part.type === "system_event" && part.content === INTERRUPTED_TURN_NOTICE)
  );
}

function createInterruptedTurnNoticeMessage(args: { taskId: string; count: number }): ChatMessage {
  const timestamp = buildRecentTimestamp();
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: "system",
    providerId: "user",
    content: INTERRUPTED_TURN_NOTICE,
    startedAt: timestamp,
    completedAt: timestamp,
    isStreaming: false,
    parts: [{
      type: "system_event",
      content: INTERRUPTED_TURN_NOTICE,
    }],
  };
}

export function appendInterruptedTurnNotices(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  latestTurns?: PersistedTurnSummary[];
}) {
  const latestTurns = args.latestTurns ?? [];
  if (latestTurns.length === 0) {
    return args.messagesByTask;
  }

  let changed = false;
  const nextMessagesByTask = { ...args.messagesByTask };

  for (const turn of latestTurns) {
    if (turn.completedAt !== null) {
      continue;
    }

    const currentMessages = nextMessagesByTask[turn.taskId] ?? [];
    if (hasInterruptedTurnNotice(currentMessages)) {
      continue;
    }

    nextMessagesByTask[turn.taskId] = [
      ...currentMessages,
      createInterruptedTurnNoticeMessage({
        taskId: turn.taskId,
        count: currentMessages.length,
      }),
    ];
    changed = true;
  }

  return changed ? nextMessagesByTask : args.messagesByTask;
}

function hasSystemNotice(args: { messages: ChatMessage[]; notice: string }) {
  return args.messages.some((message) =>
    message.role === "assistant"
    && message.parts.some((part) => part.type === "system_event" && part.content === args.notice)
  );
}

function createSystemNoticeMessage(args: { taskId: string; count: number; notice: string }): ChatMessage {
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: "system",
    providerId: "user",
    content: args.notice,
    isStreaming: false,
    parts: [{
      type: "system_event",
      content: args.notice,
    }],
  };
}

export function interruptActiveTaskTurns(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  notice: string;
}) {
  const interruptedTaskIds: string[] = [];
  let messagesChanged = false;
  let turnsChanged = false;
  const nextMessagesByTask = { ...args.messagesByTask };
  const nextActiveTurnIdsByTask = { ...args.activeTurnIdsByTask };

  for (const task of args.tasks) {
    if (!args.activeTurnIdsByTask[task.id]) {
      continue;
    }

    interruptedTaskIds.push(task.id);
    if (nextActiveTurnIdsByTask[task.id] !== undefined) {
      nextActiveTurnIdsByTask[task.id] = undefined;
      turnsChanged = true;
    }

    const currentMessages = nextMessagesByTask[task.id] ?? [];
    if (hasSystemNotice({ messages: currentMessages, notice: args.notice })) {
      continue;
    }

    nextMessagesByTask[task.id] = [
      ...currentMessages.map((message) => (
        message.isStreaming
          ? { ...message, completedAt: message.completedAt ?? buildRecentTimestamp(), isStreaming: false }
          : message
      )),
      createSystemNoticeMessage({
        taskId: task.id,
        count: currentMessages.length,
        notice: args.notice,
      }),
    ];
    messagesChanged = true;
  }

  return {
    interruptedTaskIds,
    messagesByTask: messagesChanged ? nextMessagesByTask : args.messagesByTask,
    activeTurnIdsByTask: turnsChanged ? nextActiveTurnIdsByTask : args.activeTurnIdsByTask,
  };
}

export function buildWorkspaceSessionState(args: {
  snapshot: WorkspaceSnapshot | null;
  latestTurns?: PersistedTurnSummary[];
  appendInterruptedNotices?: boolean;
}): WorkspaceSessionState {
  const empty = createEmptyWorkspaceState();
  const tasks = (args.snapshot?.tasks ?? empty.tasks).map(normalizeTaskControl);
  const providerSessionByTask = args.snapshot?.providerSessionByTask ?? empty.providerSessionByTask;
  const messagesByTask = args.appendInterruptedNotices
    ? appendInterruptedTurnNotices({
        messagesByTask: args.snapshot?.messagesByTask ?? empty.messagesByTask,
        latestTurns: args.latestTurns,
      })
    : (args.snapshot?.messagesByTask ?? empty.messagesByTask);
  const messageCountByTask = Object.fromEntries(
    Object.entries(messagesByTask).map(([taskId, messages]) => [taskId, messages.length] as const),
  ) as Record<string, number>;
  const editorTabs = args.snapshot?.editorTabs ?? empty.editorTabs;
  const requestedActiveEditorTabId = args.snapshot?.activeEditorTabId ?? empty.activeEditorTabId;
  const activeEditorTabId = editorTabs.some((tab) => tab.id === requestedActiveEditorTabId)
    ? requestedActiveEditorTabId
    : (editorTabs[0]?.id ?? null);
  const activeTurnIdsByTask = Object.fromEntries(
    (args.latestTurns ?? [])
      .filter((turn) => !turn.completedAt)
      .map((turn) => [turn.taskId, turn.id] as const)
  ) as Record<string, string | undefined>;

  return {
    activeTaskId: args.snapshot?.activeTaskId ?? empty.activeTaskId,
    tasks,
    messagesByTask,
    messageCountByTask,
    promptDraftByTask: args.snapshot?.promptDraftByTask ?? empty.promptDraftByTask,
    workspaceInformation: args.snapshot?.workspaceInformation ?? empty.workspaceInformation,
    editorTabs,
    activeEditorTabId,
    activeTurnIdsByTask,
    providerSessionByTask,
    nativeSessionReadyByTask: buildNativeSessionReadyByTask({
      tasks,
      providerSessionByTask,
    }),
  };
}

export function buildWorkspaceSessionStateFromShell(args: {
  shell: WorkspaceShell | null;
  messagesByTask?: Record<string, ChatMessage[]>;
  messageCountByTaskOverrides?: Record<string, number>;
  latestTurns?: PersistedTurnSummary[];
  appendInterruptedNotices?: boolean;
}): WorkspaceSessionState {
  const empty = createEmptyWorkspaceState();
  const tasks = (args.shell?.tasks ?? empty.tasks).map(normalizeTaskControl);
  const providerSessionByTask = args.shell?.providerSessionByTask ?? empty.providerSessionByTask;
  const loadedMessagesByTask = args.messagesByTask ?? empty.messagesByTask;
  const messagesByTask = args.appendInterruptedNotices
    ? appendInterruptedTurnNotices({
        messagesByTask: loadedMessagesByTask,
        latestTurns: args.latestTurns,
      })
    : loadedMessagesByTask;
  const messageCountByTask = {
    ...(args.shell?.messageCountByTask ?? empty.messageCountByTask),
    ...(args.messageCountByTaskOverrides ?? {}),
  };
  for (const [taskId, messages] of Object.entries(messagesByTask)) {
    messageCountByTask[taskId] = Math.max(messageCountByTask[taskId] ?? 0, messages.length);
  }
  const editorTabs = args.shell?.editorTabs ?? empty.editorTabs;
  const requestedActiveEditorTabId = args.shell?.activeEditorTabId ?? empty.activeEditorTabId;
  const activeEditorTabId = editorTabs.some((tab) => tab.id === requestedActiveEditorTabId)
    ? requestedActiveEditorTabId
    : (editorTabs[0]?.id ?? null);
  const activeTurnIdsByTask = Object.fromEntries(
    (args.latestTurns ?? [])
      .filter((turn) => !turn.completedAt)
      .map((turn) => [turn.taskId, turn.id] as const)
  ) as Record<string, string | undefined>;

  return {
    activeTaskId: args.shell?.activeTaskId ?? empty.activeTaskId,
    tasks,
    messagesByTask,
    messageCountByTask,
    promptDraftByTask: args.shell?.promptDraftByTask ?? empty.promptDraftByTask,
    workspaceInformation: args.shell?.workspaceInformation ?? empty.workspaceInformation,
    editorTabs,
    activeEditorTabId,
    activeTurnIdsByTask,
    providerSessionByTask,
    nativeSessionReadyByTask: buildNativeSessionReadyByTask({
      tasks,
      providerSessionByTask,
    }),
  };
}

export function createWorkspaceSnapshot(args: {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation?: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  return {
    activeTaskId: args.activeTaskId,
    tasks: args.tasks,
    messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: args.messagesByTask }),
    promptDraftByTask: args.promptDraftByTask,
    workspaceInformation: args.workspaceInformation ?? createEmptyWorkspaceInformation(),
    editorTabs: args.editorTabs,
    activeEditorTabId: args.activeEditorTabId,
    providerSessionByTask: args.providerSessionByTask,
  };
}

export async function persistWorkspaceSnapshot(args: {
  workspaceId: string;
  workspaceName: string;
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation?: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
}) {
  const persistedShell = await loadWorkspaceShell({ workspaceId: args.workspaceId });
  const nextTaskIds = new Set(args.tasks.map((task) => task.id));
  const preservedTasks = (persistedShell?.tasks ?? []).filter((task) => !nextTaskIds.has(task.id));
  const mergedTasks = preservedTasks.length > 0
    ? [...args.tasks, ...preservedTasks]
    : args.tasks;
  const mergedTaskIds = new Set(mergedTasks.map((task) => task.id));
  const mergedActiveTaskId = mergedTaskIds.has(args.activeTaskId)
    ? args.activeTaskId
    : (
      persistedShell?.activeTaskId && mergedTaskIds.has(persistedShell.activeTaskId)
        ? persistedShell.activeTaskId
        : (mergedTasks[0]?.id ?? "")
    );
  const mergedPromptDraftByTask = {
    ...(persistedShell?.promptDraftByTask ?? {}),
    ...args.promptDraftByTask,
  };
  const mergedProviderSessionByTask = {
    ...(persistedShell?.providerSessionByTask ?? {}),
    ...args.providerSessionByTask,
  };

  if (preservedTasks.length > 0) {
    console.warn("[persistence] shrink guard preserved missing tasks during workspace snapshot persist", {
      workspaceId: args.workspaceId,
      taskIds: preservedTasks.map((task) => task.id),
    });
  }

  await upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: mergedActiveTaskId,
      tasks: mergedTasks,
      messagesByTask: args.messagesByTask,
      promptDraftByTask: mergedPromptDraftByTask,
      workspaceInformation: args.workspaceInformation,
      editorTabs: args.editorTabs,
      activeEditorTabId: args.activeEditorTabId,
      providerSessionByTask: mergedProviderSessionByTask,
    }),
  });
}
