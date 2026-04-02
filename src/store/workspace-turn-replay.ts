import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

export function applyProviderEventsToWorkspaceSession(args: {
  session: WorkspaceSessionState;
  taskId: string;
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId: string;
}) {
  const replayed = replayProviderEventsToTaskState({
    taskId: args.taskId,
    messages: args.session.messagesByTask[args.taskId] ?? [],
    events: args.events,
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
    nativeConversationReady: args.session.nativeConversationReadyByTask[args.taskId],
    providerConversation: args.session.providerConversationByTask[args.taskId],
  });

  const activeTurnMatches = args.session.activeTurnIdsByTask[args.taskId] === replayed.activeTurnId;
  const nativeConversationReadyMatches =
    args.session.nativeConversationReadyByTask[args.taskId] === replayed.nativeConversationReady;
  const providerConversationMatches =
    replayed.providerConversation === undefined
    || args.session.providerConversationByTask[args.taskId] === replayed.providerConversation;

  if (
    !replayed.changed
    && activeTurnMatches
    && nativeConversationReadyMatches
    && providerConversationMatches
  ) {
    return {
      stateChanged: false,
      snapshotChanged: false,
      session: args.session,
      turnCompleted: replayed.activeTurnId === undefined,
    };
  }

  return {
    stateChanged: true,
    snapshotChanged: replayed.changed || !providerConversationMatches,
    session: {
      ...args.session,
      messagesByTask: replayed.changed
        ? {
            ...args.session.messagesByTask,
            [args.taskId]: replayed.messages,
          }
        : args.session.messagesByTask,
      messageCountByTask: replayed.changed
        ? {
            ...args.session.messageCountByTask,
            [args.taskId]: Math.max(
              replayed.messages.length,
              (args.session.messageCountByTask[args.taskId] ?? (args.session.messagesByTask[args.taskId] ?? []).length)
                + (replayed.messages.length - (args.session.messagesByTask[args.taskId] ?? []).length),
            ),
          }
        : args.session.messageCountByTask,
      activeTurnIdsByTask: activeTurnMatches
        ? args.session.activeTurnIdsByTask
        : {
            ...args.session.activeTurnIdsByTask,
            [args.taskId]: replayed.activeTurnId,
          },
      nativeConversationReadyByTask: nativeConversationReadyMatches
        ? args.session.nativeConversationReadyByTask
        : {
            ...args.session.nativeConversationReadyByTask,
            [args.taskId]: replayed.nativeConversationReady,
          },
      providerConversationByTask: providerConversationMatches
        ? args.session.providerConversationByTask
        : {
            ...args.session.providerConversationByTask,
            [args.taskId]: replayed.providerConversation!,
          },
    },
    turnCompleted: replayed.activeTurnId === undefined,
  };
}
