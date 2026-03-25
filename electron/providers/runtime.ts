import { cleanupClaudeTask, getClaudeCommandCatalog, streamClaudeWithSdk } from "./claude-sdk-runtime";
import { cleanupCodexTask, streamCodexWithSdk } from "./codex-sdk-runtime";
import { buildStaveResolvedArgs, resolveStaveTarget } from "./stave-router";
import type { BridgeEvent, ProviderRuntime, StreamTurnArgs } from "./types";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const sdkTurnTimeoutMs = Number(process.env.STAVE_PROVIDER_TIMEOUT_MS ?? 300000);
type ActiveRuntimeSession = {
  turnId: string;
  providerId: StreamTurnArgs["providerId"];
  taskId?: string;
  streamId?: string;
  abort?: () => void;
  respondApproval?: (args: { requestId: string; approved: boolean }) => boolean;
  respondUserInput?: (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => boolean;
};

const activeSessions = new Map<string, ActiveRuntimeSession>();
const activeStreams = new Map<string, { events: BridgeEvent[]; done: boolean }>();

function upsertActiveSession(args: {
  turnId: string;
  providerId: StreamTurnArgs["providerId"];
  taskId?: string;
  streamId?: string;
  abort?: () => void;
  respondApproval?: ActiveRuntimeSession["respondApproval"];
  respondUserInput?: ActiveRuntimeSession["respondUserInput"];
}) {
  const current = activeSessions.get(args.turnId);
  activeSessions.set(args.turnId, {
    turnId: args.turnId,
    providerId: args.providerId,
    taskId: args.taskId ?? current?.taskId,
    streamId: args.streamId ?? current?.streamId,
    abort: args.abort ?? current?.abort,
    respondApproval: args.respondApproval ?? current?.respondApproval,
    respondUserInput: args.respondUserInput ?? current?.respondUserInput,
  });
}

function toClaudeErrorEvents(args: { message: string }): BridgeEvent[] {
  return [
    { type: "system", content: "claude-code SDK turn failed" },
    { type: "text", text: args.message },
    { type: "done" as const },
  ];
}

function toCodexErrorEvents(args: { message: string }): BridgeEvent[] {
  return [
    { type: "system", content: "codex SDK turn failed" },
    { type: "text", text: args.message },
    { type: "done" as const },
  ];
}

function abortActive(args: { turnId: string }) {
  const session = activeSessions.get(args.turnId);
  const aborter = session?.abort;
  if (!aborter) {
    return false;
  }
  aborter();
  activeSessions.delete(args.turnId);
  return true;
}

function clearActiveTurnState(args: { turnId: string }) {
  activeSessions.delete(args.turnId);
}

function clearActiveTaskSessions(args: { taskId: string }) {
  for (const [turnId, session] of activeSessions.entries()) {
    if (session.taskId !== args.taskId) {
      continue;
    }
    session.abort?.();
    activeSessions.delete(turnId);
  }
}

async function withTimeout<T>(args: {
  task: Promise<T>;
  timeoutMs: number;
  onTimeout?: () => void;
}): Promise<T | null> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      args.onTimeout?.();
      resolve(null);
    }, args.timeoutMs);
  });
  try {
    return await Promise.race([args.task, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function runProviderTurn(args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void }) {
  const turnId = args.turnId ?? randomUUID();
  upsertActiveSession({
    turnId,
    providerId: args.providerId,
    taskId: args.taskId,
  });
  const turnTimeoutMs = args.runtimeOptions?.providerTimeoutMs ?? sdkTurnTimeoutMs;

  // ── Stave meta-provider: resolve the real target and re-enter ──────────────
  if (args.providerId === "stave") {
    const contextParts = args.conversation?.contextParts ?? [];
    const attachedFileCount = contextParts.filter(
      (p) => p.type === "file_context" || p.type === "image_context",
    ).length;
    const historyLength = args.conversation?.history?.length ?? 0;

    const target = resolveStaveTarget({
      prompt: args.prompt,
      attachedFileCount,
      historyLength,
      routeModels: args.runtimeOptions?.staveRouteModels,
    });

    // Notify the client which provider + model was selected
    args.onEvent?.({ type: "system", content: `[Stave] ${target.reason}` });
    // Let the client know the resolved provider + model so the message badge can update
    args.onEvent?.({ type: "model_resolved", resolvedProviderId: target.providerId, resolvedModel: target.model });

    // Delegate to the real provider via a recursive call so that all
    // timeout / abort / session logic is handled identically.
    return runProviderTurn(buildStaveResolvedArgs(args, target));
  }

  if (args.providerId === "claude-code") {
    let timedOut = false;
    try {
      const events = await withTimeout({
        task: streamClaudeWithSdk({
          ...args,
          onEvent: (event) => {
            if (timedOut) {
              return;
            }
            args.onEvent?.(event);
          },
          registerAbort: (aborter) => {
            upsertActiveSession({
              turnId,
              providerId: args.providerId,
              taskId: args.taskId,
              abort: aborter,
            });
          },
          registerApprovalResponder: (responder) => {
            upsertActiveSession({
              turnId,
              providerId: args.providerId,
              taskId: args.taskId,
              respondApproval: responder,
            });
          },
          registerUserInputResponder: (responder) => {
            upsertActiveSession({
              turnId,
              providerId: args.providerId,
              taskId: args.taskId,
              respondUserInput: responder,
            });
          },
        }),
        timeoutMs: turnTimeoutMs,
        onTimeout: () => {
          timedOut = true;
          abortActive({ turnId });
        },
      });
      if (events && events.length > 0) {
        return events;
      }
      const fallback = toClaudeErrorEvents({
        message: `Claude SDK unavailable/timeout. Check claude login and SDK environment. timeout=${turnTimeoutMs}ms`,
      });
      fallback.forEach((event) => args.onEvent?.(event));
      return fallback;
    } finally {
      clearActiveTurnState({ turnId });
    }
  }

  let timedOut = false;
  try {
    const events = await withTimeout({
      task: streamCodexWithSdk({
        ...args,
        onEvent: (event) => {
          if (timedOut) {
            return;
          }
          args.onEvent?.(event);
        },
        registerAbort: (aborter) => {
          upsertActiveSession({
            turnId,
            providerId: args.providerId,
            taskId: args.taskId,
            abort: aborter,
          });
        },
      }),
      timeoutMs: turnTimeoutMs,
      onTimeout: () => {
        timedOut = true;
        abortActive({ turnId });
      },
    });
    if (events && events.length > 0) {
      return events;
    }
    const fallback = toCodexErrorEvents({
      message: `Codex SDK unavailable/timeout. Check codex auth and SDK environment. timeout=${turnTimeoutMs}ms`,
    });
    fallback.forEach((event) => args.onEvent?.(event));
    return fallback;
  } finally {
    clearActiveTurnState({ turnId });
  }
}

export const providerRuntime: ProviderRuntime = {
  streamTurn: (args) => runProviderTurn(args),
  startTurnStream: (args, options) => {
    const streamId = randomUUID();
    const turnId = args.turnId ?? randomUUID();
    const shouldBufferForPolling = !options?.onEvent;
    const session = { events: [] as BridgeEvent[], done: false };
    activeStreams.set(streamId, session);
    upsertActiveSession({
      turnId,
      providerId: args.providerId,
      taskId: args.taskId,
      streamId,
    });
    void runProviderTurn({
      ...args,
      turnId,
      onEvent: (event) => {
        if (shouldBufferForPolling) {
          session.events.push(event);
        }
        options?.onEvent?.(event);
      },
    })
      .catch((error) => {
        const errorEvent: BridgeEvent = {
          type: "error",
          message: `Provider stream failed: ${String(error)}`,
          recoverable: true,
        };
        session.events.push(errorEvent);
        options?.onEvent?.(errorEvent);
        const doneEvent: BridgeEvent = { type: "done" };
        session.events.push(doneEvent);
        options?.onEvent?.(doneEvent);
      })
      .finally(() => {
        session.done = true;
        clearActiveTurnState({ turnId });
        if (!shouldBufferForPolling) {
          activeStreams.delete(streamId);
        }
        options?.onDone?.();
      });
    return { ok: true, streamId };
  },
  readTurnStream: ({ streamId, cursor }) => {
    const session = activeStreams.get(streamId);
    if (!session) {
      return {
        ok: false,
        events: [],
        cursor,
        done: true,
        message: "Stream session not found.",
      };
    }
    const safeCursor = Number.isFinite(cursor) ? cursor : 0;
    const nextCursor = Math.max(0, Math.min(safeCursor, session.events.length));
    const events = session.events.slice(nextCursor);
    const outCursor = nextCursor + events.length;
    const done = session.done;
    if (done && outCursor >= session.events.length) {
      activeStreams.delete(streamId);
    }
    return {
      ok: true,
      events,
      cursor: outCursor,
      done,
    };
  },
  abortTurn: ({ turnId }) => {
    const ok = abortActive({ turnId });
    if (!ok) {
      return { ok: false, message: "No active provider turn." };
    }
    return { ok: true, message: "Provider turn aborted." };
  },
  cleanupTask: ({ taskId }) => {
    clearActiveTaskSessions({ taskId });
    cleanupClaudeTask(taskId);
    cleanupCodexTask(taskId);
    return { ok: true, message: `Cleaned provider runtime state for task ${taskId}.` };
  },
  respondApproval: ({ turnId, requestId, approved }) => ({
    ...(() => {
      const responder = activeSessions.get(turnId)?.respondApproval;
      if (!responder) {
        return {
          ok: false,
          message: `No active approval responder for turn ${turnId}. requestId=${requestId}`,
        };
      }
      const delivered = responder({ requestId, approved });
      if (!delivered) {
        return {
          ok: false,
          message: `Approval responder rejected request for turn ${turnId}. requestId=${requestId}`,
        };
      }
      return {
        ok: true,
        message: `Approval response delivered to turn ${turnId}. requestId=${requestId}`,
      };
    })(),
  }),
  respondUserInput: ({ turnId, requestId, answers, denied }) => ({
    ...(() => {
      const responder = activeSessions.get(turnId)?.respondUserInput;
      if (!responder) {
        return {
          ok: false,
          message: `No active user-input responder for turn ${turnId}. requestId=${requestId}`,
        };
      }
      const delivered = responder({ requestId, answers, denied });
      if (!delivered) {
        return {
          ok: false,
          message: `User-input responder rejected request for turn ${turnId}. requestId=${requestId}`,
        };
      }
      return {
        ok: true,
        message: `User-input response delivered to turn ${turnId}. requestId=${requestId}`,
      };
    })(),
  }),
  checkAvailability: ({ providerId }) => new Promise((resolve) => {
    // Stave delegates to claude-code as its primary routing target
    const command = providerId === "claude-code" || providerId === "stave" ? "claude" : "codex";
    const child = spawn(command, ["--version"], { shell: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: true,
        available: false,
        detail: String(error),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: true,
        available: code === 0,
        detail: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
      });
    });
  }),
  getCommandCatalog: async ({ providerId, cwd, runtimeOptions }) => {
    if (providerId === "stave") {
      return {
        ok: true,
        supported: false,
        commands: [],
        detail: "Stave auto-routing does not expose a native command catalog. Switch to Claude Code or Codex directly to access provider-specific commands.",
      };
    }

    if (providerId === "claude-code") {
      const result = await withTimeout({
        task: getClaudeCommandCatalog({ cwd, runtimeOptions }),
        timeoutMs: 15_000,
      });
      return result ?? {
        ok: false,
        supported: false,
        commands: [],
        detail: "Timed out loading the Claude command catalog.",
      };
    }

    return {
      ok: true,
      supported: false,
      commands: [],
      detail: "Codex does not expose a native slash-command catalog through the current SDK transport.",
    };
  },
};
