import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { Attachment, ChatMessage, EditorTab, Task } from "@/types/chat";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

type PromptDraftByTask = Record<string, {
  text: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
}>;

type ActiveWorkspaceProjectionState = {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  promptDraftByTask: PromptDraftByTask;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerConversationByTask: Record<string, TaskProviderConversationState>;
  nativeConversationReadyByTask: Record<string, boolean>;
};

type WorkspaceRuntimeCacheState = ActiveWorkspaceProjectionState & {
  activeWorkspaceId: string;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion: number;
};

export type ActiveWorkspaceStatePatch = Pick<
  ActiveWorkspaceProjectionState,
  | "activeTaskId"
  | "tasks"
  | "messagesByTask"
  | "promptDraftByTask"
  | "workspaceInformation"
  | "editorTabs"
  | "activeEditorTabId"
  | "activeTurnIdsByTask"
  | "providerConversationByTask"
  | "nativeConversationReadyByTask"
>;

export type WorkspaceRuntimeStatePatch = Partial<ActiveWorkspaceStatePatch> & {
  workspaceSnapshotVersion?: number;
  workspaceRuntimeCacheById?: Record<string, WorkspaceSessionState>;
};

export function createWorkspaceSessionStateFromAppState(
  state: ActiveWorkspaceProjectionState,
): WorkspaceSessionState {
  return {
    activeTaskId: state.activeTaskId,
    tasks: state.tasks,
    messagesByTask: state.messagesByTask,
    promptDraftByTask: state.promptDraftByTask,
    workspaceInformation: state.workspaceInformation,
    editorTabs: state.editorTabs,
    activeEditorTabId: state.activeEditorTabId,
    activeTurnIdsByTask: state.activeTurnIdsByTask,
    providerConversationByTask: state.providerConversationByTask,
    nativeConversationReadyByTask: state.nativeConversationReadyByTask,
  };
}

export function createActiveWorkspaceStatePatch(session: WorkspaceSessionState): ActiveWorkspaceStatePatch {
  return {
    activeTaskId: session.activeTaskId,
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    promptDraftByTask: session.promptDraftByTask,
    workspaceInformation: session.workspaceInformation,
    editorTabs: session.editorTabs,
    activeEditorTabId: session.activeEditorTabId,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    providerConversationByTask: session.providerConversationByTask,
    nativeConversationReadyByTask: session.nativeConversationReadyByTask,
  };
}

export function saveActiveWorkspaceRuntimeCache(args: {
  state: Pick<
    WorkspaceRuntimeCacheState,
    | "activeWorkspaceId"
    | "workspaceRuntimeCacheById"
    | "activeTaskId"
    | "tasks"
    | "messagesByTask"
    | "promptDraftByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "activeTurnIdsByTask"
    | "providerConversationByTask"
    | "nativeConversationReadyByTask"
  >;
}) {
  if (!args.state.activeWorkspaceId) {
    return args.state.workspaceRuntimeCacheById;
  }
  return {
    ...args.state.workspaceRuntimeCacheById,
    [args.state.activeWorkspaceId]: createWorkspaceSessionStateFromAppState(args.state),
  };
}

export function applyPendingProviderEventsToStoreState(args: {
  state: WorkspaceRuntimeCacheState;
  taskWorkspaceId: string;
  taskId: string;
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId: string;
}) {
  const isActiveWorkspaceTarget = args.taskWorkspaceId === args.state.activeWorkspaceId;
  if (isActiveWorkspaceTarget) {
    const activeTurnId = args.state.activeTurnIdsByTask[args.taskId];
    if (activeTurnId !== args.turnId) {
      console.warn("[provider-turn] dropped late events for inactive turn", {
        taskId: args.taskId,
        workspaceId: args.taskWorkspaceId,
        expectedTurnId: args.turnId,
        activeTurnId: activeTurnId ?? null,
        eventTypes: args.events.map((event) => event.type),
      });
      return {
        stateChanged: false,
        statePatch: {} as WorkspaceRuntimeStatePatch,
        persistInactiveWorkspaceSession: null,
        updatedSession: null,
      };
    }

    const applied = applyProviderEventsToWorkspaceSession({
      session: createWorkspaceSessionStateFromAppState(args.state),
      taskId: args.taskId,
      events: args.events,
      provider: args.provider,
      model: args.model,
      turnId: args.turnId,
    });

    if (!applied.stateChanged) {
      return {
        stateChanged: false,
        statePatch: {} as WorkspaceRuntimeStatePatch,
        persistInactiveWorkspaceSession: null,
        updatedSession: null,
      };
    }

    return {
      stateChanged: true,
      statePatch: {
        ...createActiveWorkspaceStatePatch(applied.session),
        workspaceSnapshotVersion: applied.snapshotChanged
          ? args.state.workspaceSnapshotVersion + 1
          : args.state.workspaceSnapshotVersion,
      },
      persistInactiveWorkspaceSession: null,
      updatedSession: applied.session,
    };
  }

  const workspaceSession = args.state.workspaceRuntimeCacheById[args.taskWorkspaceId];
  if (!workspaceSession) {
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
    };
  }

  const activeTurnId = workspaceSession.activeTurnIdsByTask[args.taskId];
  if (activeTurnId !== args.turnId) {
    console.warn("[provider-turn] dropped late events for inactive cached workspace turn", {
      taskId: args.taskId,
      workspaceId: args.taskWorkspaceId,
      expectedTurnId: args.turnId,
      activeTurnId: activeTurnId ?? null,
      eventTypes: args.events.map((event) => event.type),
    });
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
    };
  }

  const applied = applyProviderEventsToWorkspaceSession({
    session: workspaceSession,
    taskId: args.taskId,
    events: args.events,
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
  });

  if (!applied.stateChanged) {
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
    };
  }

  return {
    stateChanged: true,
    statePatch: {
      workspaceRuntimeCacheById: {
        ...args.state.workspaceRuntimeCacheById,
        [args.taskWorkspaceId]: applied.session,
      },
    },
    persistInactiveWorkspaceSession: applied.turnCompleted
      ? {
          workspaceId: args.taskWorkspaceId,
          session: applied.session,
        }
      : null,
    updatedSession: applied.session,
  };
}
