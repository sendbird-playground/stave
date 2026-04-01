import { type PersistedTurnSummary } from "@/lib/db/turns.db";
import { type TaskProviderConversationState, type WorkspaceSnapshot, upsertWorkspace } from "@/lib/db/workspaces.db";
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
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerConversationByTask: Record<string, TaskProviderConversationState>;
  nativeConversationReadyByTask: Record<string, boolean>;
}

export function createEmptyWorkspaceState() {
  return {
    activeTaskId: "",
    tasks: [] as Task[],
    messagesByTask: {} as Record<string, ChatMessage[]>,
    promptDraftByTask: {} as Record<string, PromptDraft>,
    workspaceInformation: createEmptyWorkspaceInformation(),
    editorTabs: [] as EditorTab[],
    activeEditorTabId: null as string | null,
    providerConversationByTask: {} as Record<string, TaskProviderConversationState>,
  };
}

export function buildNativeConversationReadyByTask(args: {
  tasks: Task[];
  providerConversationByTask: Record<string, TaskProviderConversationState>;
}) {
  const next: Record<string, boolean> = {};

  for (const task of args.tasks) {
    const providerConversation = args.providerConversationByTask[task.id];
    // stave has no native conversation of its own; treat as not ready
    next[task.id] = task.provider !== "stave" && Boolean(providerConversation?.[task.provider]?.trim());
  }

  return next;
}

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function hasInterruptedTurnNotice(messages: ChatMessage[]) {
  return messages.some((message) =>
    message.role === "assistant"
    && message.parts.some((part) => part.type === "system_event" && part.content === INTERRUPTED_TURN_NOTICE)
  );
}

function createInterruptedTurnNoticeMessage(args: { taskId: string; count: number }): ChatMessage {
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: "system",
    providerId: "user",
    content: INTERRUPTED_TURN_NOTICE,
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
      ...currentMessages.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message)),
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
  const providerConversationByTask = args.snapshot?.providerConversationByTask ?? empty.providerConversationByTask;
  const messagesByTask = args.appendInterruptedNotices
    ? appendInterruptedTurnNotices({
        messagesByTask: args.snapshot?.messagesByTask ?? empty.messagesByTask,
        latestTurns: args.latestTurns,
      })
    : (args.snapshot?.messagesByTask ?? empty.messagesByTask);
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
    promptDraftByTask: args.snapshot?.promptDraftByTask ?? empty.promptDraftByTask,
    workspaceInformation: args.snapshot?.workspaceInformation ?? empty.workspaceInformation,
    editorTabs,
    activeEditorTabId,
    activeTurnIdsByTask,
    providerConversationByTask,
    nativeConversationReadyByTask: buildNativeConversationReadyByTask({
      tasks,
      providerConversationByTask,
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
  providerConversationByTask: Record<string, TaskProviderConversationState>;
}) {
  return {
    activeTaskId: args.activeTaskId,
    tasks: args.tasks,
    messagesByTask: normalizeMessagesForSnapshot({ messagesByTask: args.messagesByTask }),
    promptDraftByTask: args.promptDraftByTask,
    workspaceInformation: args.workspaceInformation ?? createEmptyWorkspaceInformation(),
    editorTabs: args.editorTabs,
    activeEditorTabId: args.activeEditorTabId,
    providerConversationByTask: args.providerConversationByTask,
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
  providerConversationByTask: Record<string, TaskProviderConversationState>;
}) {
  await upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: args.activeTaskId,
      tasks: args.tasks,
      messagesByTask: args.messagesByTask,
      promptDraftByTask: args.promptDraftByTask,
      workspaceInformation: args.workspaceInformation,
      editorTabs: args.editorTabs,
      activeEditorTabId: args.activeEditorTabId,
      providerConversationByTask: args.providerConversationByTask,
    }),
  });
}
