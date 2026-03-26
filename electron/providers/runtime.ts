import {
  cleanupClaudeTask,
  getClaudeCommandCatalog,
  resolveClaudeExecutablePath,
  streamClaudeWithSdk,
} from "./claude-sdk-runtime";
import {
  cleanupCodexTask,
  resolveCodexExecutablePath,
  streamCodexWithSdk,
} from "./codex-sdk-runtime";
import { buildStaveResolvedArgs } from "./stave-router";
import { runPreprocessor } from "./stave-preprocessor";
import { getCachedAvailability, setCachedAvailability } from "./stave-availability";
import { runOrchestrator } from "./stave-orchestrator";
import type { BridgeEvent, ProviderRuntime, StreamTurnArgs } from "./types";
import { buildExecutableLookupEnv } from "./executable-path";
import {
  DEFAULT_STAVE_AUTO_PROFILE,
  resolveStaveIntentModel,
  resolveStaveProviderForModel,
} from "../../src/lib/providers/stave-auto-profile";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

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
const CODEX_LOOKUP_PATHS = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;

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

function describeClaudeAvailability() {
  const executablePath = resolveClaudeExecutablePath();
  const available = executablePath.length > 0;
  const detail = available
    ? `Resolved Claude CLI: ${executablePath}`
    : "Claude CLI not found from STAVE_CLAUDE_CLI_PATH, CLAUDE_CODE_PATH, login-shell PATH, or home-bin candidates.";
  setCachedAvailability("claude-code", available);
  return { available, detail };
}

function describeCodexAvailability(args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {}) {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexPathOverride,
  });
  if (!executablePath) {
    setCachedAvailability("codex", false);
    return {
      available: false,
      detail: "Codex executable not found from runtime override, env vars, login-shell PATH, home-bin candidates, or bundled SDK binary.",
    };
  }

  const env = buildExecutableLookupEnv({
    extraPaths: [
      ...CODEX_LOOKUP_PATHS,
      path.dirname(executablePath),
    ],
  });
  const versionProbe = spawnSync(executablePath, ["--version"], {
    encoding: "utf8",
    env,
  });
  const available = versionProbe.status === 0;
  const detail = available
    ? `Resolved Codex executable: ${executablePath}`
    : [
        `Codex executable probe failed: ${executablePath}`,
        (versionProbe.stderr ?? "").trim(),
        versionProbe.error ? String(versionProbe.error) : "",
      ].filter(Boolean).join("\n");
  setCachedAvailability("codex", available);
  return { available, detail };
}

function describeStaveAvailability(args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {}) {
  const claude = describeClaudeAvailability();
  const codex = describeCodexAvailability(args);
  const available = claude.available || codex.available;
  setCachedAvailability("stave", available);
  return {
    available,
    detail: [
      `Claude: ${claude.available ? "available" : "unavailable"}`,
      claude.detail,
      `Codex: ${codex.available ? "available" : "unavailable"}`,
      codex.detail,
    ].join("\n"),
  };
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

  // ── Stave meta-provider: Pre-processor → direct or orchestrate ────────────
  if (args.providerId === "stave") {
    const contextParts = args.conversation?.contextParts ?? [];
    const attachedFileCount = contextParts.filter(
      (p) => p.type === "file_context" || p.type === "image_context",
    ).length;
    const historyLength = args.conversation?.history?.length ?? 0;
    const profile = args.runtimeOptions?.staveAuto ?? DEFAULT_STAVE_AUTO_PROFILE;

    // Helper: run a provider turn in batch mode (collect all events, no streaming).
    // Injected into the Pre-processor so it can call any provider without a
    // circular module dependency.
    const runTurnBatch = async (batchArgs: StreamTurnArgs): Promise<BridgeEvent[]> => {
      const collected: BridgeEvent[] = [];
      await runProviderTurn({ ...batchArgs, onEvent: (e) => collected.push(e) });
      return collected;
    };

    const plan = await runPreprocessor({
      userPrompt: args.prompt,
      historyLength,
      attachedFileCount,
      profile,
      baseArgs: { cwd: args.cwd, taskId: args.taskId, workspaceId: args.workspaceId },
      runTurnBatch,
    });

    // Emit the structured execution plan so the UI can reflect it.
    if (plan.strategy === "orchestrate") {
      args.onEvent?.({
        type: "stave:execution_processing",
        strategy: "orchestrate",
        supervisorModel: profile.supervisorModel,
        reason: plan.reason,
      });
    }

    if (plan.strategy === "direct") {
      // ── Phase 2: Availability-aware fallback ────────────────────────────────
      // Fallback pairs: if the plan's provider is cached as unavailable, pick
      // an equivalent model from the other provider.
      const MODEL_FALLBACK: Record<string, string> = {
        "claude-opus-4-6": "gpt-5.4",
        "claude-sonnet-4-6": "gpt-5.4",
        "claude-haiku-4-5": "gpt-5.3-codex",
        "gpt-5.4": "claude-opus-4-6",
        "gpt-5.3-codex": "claude-haiku-4-5",
        "opusplan": "claude-opus-4-6",
      };

      let chosenModel = resolveStaveIntentModel({
        profile,
        intent: plan.intent,
      });
      const planProvider = resolveStaveProviderForModel({ model: chosenModel });
      const planProviderAvail = getCachedAvailability(planProvider);
      if (planProviderAvail === false) {
        const fallback = MODEL_FALLBACK[chosenModel];
        if (fallback) {
          chosenModel = fallback;
        }
      }

      // Resolve to the chosen provider and model.
      const resolvedTarget = {
        providerId: resolveStaveProviderForModel({ model: chosenModel }),
        model: chosenModel,
        reason: plan.reason,
      };

      const resolvedArgs = buildStaveResolvedArgs(args, resolvedTarget);

      // Apply fast-mode hint if the Pre-processor flagged it OR the Stave Auto profile enables fast mode globally,
      // guarded by per-provider support flags.
      const claudeFastSupported = profile.claudeFastModeSupported !== false;
      const codexFastSupported = profile.codexFastModeSupported !== false;
      if (plan.executionHints?.fastMode || profile.fastMode) {
        resolvedArgs.runtimeOptions = {
          ...resolvedArgs.runtimeOptions,
          ...(claudeFastSupported ? { claudeFastMode: true } : {}),
          ...(codexFastSupported ? { codexFastMode: true } : {}),
        };
      }

      // Compute the effective fast mode flag for the resolved provider.
      const resolvedProvider = resolvedTarget.providerId;
      const fastModeApplied =
        resolvedProvider === "codex"
          ? (resolvedArgs.runtimeOptions?.codexFastMode ?? false)
          : (resolvedArgs.runtimeOptions?.claudeFastMode ?? false);

      // Emit the structured execution plan so the UI can reflect it.
      args.onEvent?.({
        type: "stave:execution_processing",
        strategy: "direct",
        model: chosenModel,
        reason: plan.reason,
        fastModeRequested: (plan.executionHints?.fastMode ?? false) || (profile.fastMode ?? false),
        fastModeApplied,
      });

      // Notify the client of the resolved model (updates the message badge).
      // Note: the routing reason is already shown via the stave:execution_processing event → stave_processing MessagePart.
      args.onEvent?.({ type: "model_resolved", resolvedProviderId: resolvedTarget.providerId, resolvedModel: resolvedTarget.model });

      return runProviderTurn(resolvedArgs);
    }

    // strategy === "orchestrate" — Phase 3: invoke the Orchestrator.
    await runOrchestrator({
      userPrompt: args.prompt,
      profile,
      baseArgs: { cwd: args.cwd, taskId: args.taskId, workspaceId: args.workspaceId },
      runtimeOptions: args.runtimeOptions,
      onEvent: (event) => args.onEvent?.(event),
      runTurnBatch,
    });
    return;
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
  checkAvailability: async ({ providerId, runtimeOptions }) => {
    if (providerId === "claude-code") {
      const result = describeClaudeAvailability();
      return { ok: true, ...result };
    }
    if (providerId === "codex") {
      const result = describeCodexAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    const result = describeStaveAvailability({ runtimeOptions });
    return { ok: true, ...result };
  },
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
