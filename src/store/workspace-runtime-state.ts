import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

type PromptDraftByTask = Record<string, PromptDraft>;

type ActiveWorkspaceProjectionState = {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  promptDraftByTask: PromptDraftByTask;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  nativeSessionReadyByTask: Record<string, boolean>;
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
  | "messageCountByTask"
  | "promptDraftByTask"
  | "workspaceInformation"
  | "editorTabs"
  | "activeEditorTabId"
  | "activeTurnIdsByTask"
  | "providerSessionByTask"
  | "nativeSessionReadyByTask"
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
    messageCountByTask: state.messageCountByTask,
    promptDraftByTask: state.promptDraftByTask,
    workspaceInformation: state.workspaceInformation,
    editorTabs: state.editorTabs,
    activeEditorTabId: state.activeEditorTabId,
    activeTurnIdsByTask: state.activeTurnIdsByTask,
    providerSessionByTask: state.providerSessionByTask,
    nativeSessionReadyByTask: state.nativeSessionReadyByTask,
  };
}

export function createActiveWorkspaceStatePatch(session: WorkspaceSessionState): ActiveWorkspaceStatePatch {
  return {
    activeTaskId: session.activeTaskId,
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    messageCountByTask: session.messageCountByTask,
    promptDraftByTask: session.promptDraftByTask,
    workspaceInformation: session.workspaceInformation,
    editorTabs: session.editorTabs,
    activeEditorTabId: session.activeEditorTabId,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    providerSessionByTask: session.providerSessionByTask,
    nativeSessionReadyByTask: session.nativeSessionReadyByTask,
  };
}

function compactWorkspaceSessionMessages(session: WorkspaceSessionState): WorkspaceSessionState {
  const retainedTaskIds = new Set<string>();
  if (session.activeTaskId) {
    retainedTaskIds.add(session.activeTaskId);
  }
  for (const [taskId, turnId] of Object.entries(session.activeTurnIdsByTask)) {
    if (turnId) {
      retainedTaskIds.add(taskId);
    }
  }
  const nextMessagesByTask = Object.fromEntries(
    Object.entries(session.messagesByTask).filter(([taskId]) => retainedTaskIds.has(taskId)),
  );
  if (Object.keys(nextMessagesByTask).length === Object.keys(session.messagesByTask).length) {
    return session;
  }
  return {
    ...session,
    messagesByTask: nextMessagesByTask,
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
    | "messageCountByTask"
    | "promptDraftByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "nativeSessionReadyByTask"
  >;
}) {
  if (!args.state.activeWorkspaceId) {
    return args.state.workspaceRuntimeCacheById;
  }
  const nextSession = compactWorkspaceSessionMessages(createWorkspaceSessionStateFromAppState(args.state));
  return {
    ...args.state.workspaceRuntimeCacheById,
    [args.state.activeWorkspaceId]: nextSession,
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
