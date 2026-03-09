import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { providerRuntime } from "../../providers/runtime";
import type { StreamTurnArgs } from "../../providers/types";
import { ensurePersistenceReady } from "../state";
import { isDoneEvent, toEventType } from "../utils/provider-events";

export function registerProviderHandlers() {
  ipcMain.handle("provider:stream-turn", async (_event, args: StreamTurnArgs) => {
    return providerRuntime.streamTurn(args);
  });

  ipcMain.handle("provider:start-stream-turn", (_event, args: StreamTurnArgs) => {
    return providerRuntime.startTurnStream(args);
  });

  ipcMain.handle("provider:start-push-turn", async (event, args: StreamTurnArgs) => {
    const turnId = randomUUID();
    const sender = event.sender;
    const store = await ensurePersistenceReady();
    let sequence = 0;
    let completed = false;

    if (args.taskId) {
      try {
        store.beginTurn({
          id: turnId,
          workspaceId: args.workspaceId ?? "default",
          taskId: args.taskId,
          providerId: args.providerId,
        });
      } catch (error) {
        console.warn("[provider:persistence] failed to begin turn", error, {
          turnId,
          providerId: args.providerId,
          taskId: args.taskId,
          workspaceId: args.workspaceId ?? null,
        });
      }
    }

    const started = providerRuntime.startTurnStream(args, {
      onEvent: (turnEvent) => {
        sequence += 1;
        if (args.taskId) {
          try {
            store.appendTurnEvent({
              id: randomUUID(),
              turnId,
              sequence,
              eventType: toEventType({ event: turnEvent }),
              payload: turnEvent,
            });
          } catch (error) {
            console.warn("[provider:persistence] failed to append turn event", error, {
              turnId,
              sequence,
              providerId: args.providerId,
              taskId: args.taskId,
              eventType: toEventType({ event: turnEvent }),
            });
          }
        }
        try {
          sender.send("provider:stream-event", {
            streamId: started.streamId,
            event: turnEvent,
            sequence,
            done: isDoneEvent({ event: turnEvent }),
            taskId: args.taskId ?? null,
            workspaceId: args.workspaceId ?? null,
            providerId: args.providerId,
            turnId: args.taskId ? turnId : null,
          });
        } catch (error) {
          console.warn("[provider:stream] failed to forward event to renderer", error, {
            turnId,
            sequence,
            providerId: args.providerId,
            taskId: args.taskId ?? null,
            eventType: toEventType({ event: turnEvent }),
          });
        }
      },
      onDone: () => {
        if (!completed && args.taskId) {
          completed = true;
          try {
            store.completeTurn({ id: turnId });
          } catch (error) {
            console.warn("[provider:persistence] failed to complete turn", error, {
              turnId,
              providerId: args.providerId,
              taskId: args.taskId,
            });
          }
        }
      },
    });

    return { ok: true, streamId: started.streamId, turnId: args.taskId ? turnId : null };
  });

  ipcMain.handle("provider:read-stream-turn", (_event, args: { streamId: string; cursor: number }) => {
    return providerRuntime.readTurnStream(args);
  });

  ipcMain.handle("provider:abort-turn", (_event, args: { providerId: "claude-code" | "codex" }) => {
    return providerRuntime.abortTurn({ providerId: args.providerId });
  });

  ipcMain.handle("provider:cleanup-task", (_event, args: { taskId: string }) => {
    return providerRuntime.cleanupTask({ taskId: args.taskId });
  });

  ipcMain.handle("provider:respond-approval", (_event, args: {
    providerId: "claude-code" | "codex";
    requestId: string;
    approved: boolean;
  }) => {
    return providerRuntime.respondApproval({
      providerId: args.providerId,
      requestId: args.requestId,
      approved: args.approved,
    });
  });

  ipcMain.handle("provider:respond-user-input", (_event, args: {
    providerId: "claude-code" | "codex";
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => {
    return providerRuntime.respondUserInput({
      providerId: args.providerId,
      requestId: args.requestId,
      answers: args.answers,
      denied: args.denied,
    });
  });

  ipcMain.handle("provider:check-availability", (_event, args: {
    providerId: "claude-code" | "codex";
  }) => {
    return providerRuntime.checkAvailability({ providerId: args.providerId });
  });
}
