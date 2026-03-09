import { cleanupClaudeTask, streamClaudeWithSdk } from "./claude-sdk-runtime";
import { cleanupCodexTask, streamCodexWithSdk } from "./codex-sdk-runtime";
import type { BridgeEvent, ProviderRuntime, StreamTurnArgs } from "./types";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const sdkTurnTimeoutMs = Number(process.env.STAVE_PROVIDER_TIMEOUT_MS ?? 300000);
const activeAborters = new Map<StreamTurnArgs["providerId"], () => void>();
const activeApprovalResponders = new Map<StreamTurnArgs["providerId"], (args: { requestId: string; approved: boolean }) => boolean>();
const activeUserInputResponders = new Map<StreamTurnArgs["providerId"], (args: {
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}) => boolean>();
const activeStreams = new Map<string, { events: BridgeEvent[]; done: boolean }>();

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

function abortActive(args: { providerId: StreamTurnArgs["providerId"] }) {
  const aborter = activeAborters.get(args.providerId);
  if (!aborter) {
    return false;
  }
  aborter();
  activeAborters.delete(args.providerId);
  return true;
}

function clearActiveProviderState(args: { providerId: StreamTurnArgs["providerId"] }) {
  activeAborters.delete(args.providerId);
  activeApprovalResponders.delete(args.providerId);
  activeUserInputResponders.delete(args.providerId);
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
  const turnTimeoutMs = args.runtimeOptions?.providerTimeoutMs ?? sdkTurnTimeoutMs;
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
            activeAborters.set(args.providerId, aborter);
          },
          registerApprovalResponder: (responder) => {
            activeApprovalResponders.set(args.providerId, responder);
          },
          registerUserInputResponder: (responder) => {
            activeUserInputResponders.set(args.providerId, responder);
          },
        }),
        timeoutMs: turnTimeoutMs,
        onTimeout: () => {
          timedOut = true;
          abortActive({ providerId: args.providerId });
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
      clearActiveProviderState({ providerId: args.providerId });
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
          activeAborters.set(args.providerId, aborter);
        },
      }),
      timeoutMs: turnTimeoutMs,
      onTimeout: () => {
        timedOut = true;
        abortActive({ providerId: args.providerId });
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
    clearActiveProviderState({ providerId: args.providerId });
  }
}

export const providerRuntime: ProviderRuntime = {
  streamTurn: (args) => runProviderTurn(args),
  startTurnStream: (args, options) => {
    const streamId = randomUUID();
    const shouldBufferForPolling = !options?.onEvent;
    const session = { events: [] as BridgeEvent[], done: false };
    activeStreams.set(streamId, session);
    void runProviderTurn({
      ...args,
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
  abortTurn: ({ providerId }) => {
    const ok = abortActive({ providerId });
    if (!ok) {
      return { ok: false, message: "No active provider turn." };
    }
    return { ok: true, message: "Provider turn aborted." };
  },
  cleanupTask: ({ taskId }) => {
    cleanupClaudeTask(taskId);
    cleanupCodexTask(taskId);
    return { ok: true, message: `Cleaned provider runtime state for task ${taskId}.` };
  },
  respondApproval: ({ providerId, requestId, approved }) => ({
    ...(() => {
      const responder = activeApprovalResponders.get(providerId);
      if (!responder) {
        return {
          ok: false,
          message: `No active approval responder for ${providerId}. requestId=${requestId}`,
        };
      }
      const delivered = responder({ requestId, approved });
      if (!delivered) {
        return {
          ok: false,
          message: `Approval responder rejected request for ${providerId}. requestId=${requestId}`,
        };
      }
      return {
        ok: true,
        message: `Approval response delivered to ${providerId}. requestId=${requestId}`,
      };
    })(),
  }),
  respondUserInput: ({ providerId, requestId, answers, denied }) => ({
    ...(() => {
      const responder = activeUserInputResponders.get(providerId);
      if (!responder) {
        return {
          ok: false,
          message: `No active user-input responder for ${providerId}. requestId=${requestId}`,
        };
      }
      const delivered = responder({ requestId, answers, denied });
      if (!delivered) {
        return {
          ok: false,
          message: `User-input responder rejected request for ${providerId}. requestId=${requestId}`,
        };
      }
      return {
        ok: true,
        message: `User-input response delivered to ${providerId}. requestId=${requestId}`,
      };
    })(),
  }),
  checkAvailability: ({ providerId }) => new Promise((resolve) => {
    const command = providerId === "claude-code" ? "claude" : "codex";
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
};
