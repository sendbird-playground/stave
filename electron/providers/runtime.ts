import {
  buildClaudeEnv,
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
import {
  cleanupCodexAppServerTask,
  streamCodexWithAppServer,
} from "./codex-app-server-runtime";
import { getProviderConnectedToolStatus } from "./connected-tool-status";
import {
  buildStaveResolvedArgs,
  resolveForcedStavePlanTarget,
  resolveSkillFastPath,
  type StaveRouteTarget,
} from "./stave-router";
import { resolveAvailableStaveModel } from "./stave-model-fallback";
import { runPreprocessor } from "./stave-preprocessor";
import { getCachedAvailability, setCachedAvailability } from "./stave-availability";
import { runOrchestrator } from "./stave-orchestrator";
import type { BridgeEvent, ProviderRuntime, StreamTurnArgs } from "./types";
import {
  applyStaveRoleRuntimeOverrides,
  DEFAULT_STAVE_AUTO_PROFILE,
  resolveStaveIntentModel,
  resolveStaveProviderForModel,
} from "../../src/lib/providers/stave-auto-profile";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { buildRuntimeProcessEnv, probeExecutableVersion } from "./runtime-shared";

const sdkTurnTimeoutMs = Number(process.env.STAVE_PROVIDER_TIMEOUT_MS ?? 300000);
const ACTIVE_STREAM_TTL_MS = 15 * 60 * 1000;
const COMPLETED_STREAM_TTL_MS = 60 * 1000;
const DEFAULT_PROVIDER_TASK_KEY = "default";
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
type ActiveStreamSession = {
  events: BridgeEvent[];
  done: boolean;
  updatedAt: number;
  baseCursor: number;
};

const activeStreams = new Map<string, ActiveStreamSession>();
const CODEX_LOOKUP_PATHS = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;
const CODEX_RUNTIME_SELECTOR = process.env.STAVE_CODEX_RUNTIME?.trim().toLowerCase();

function shouldUseLegacyCodexRuntime() {
  return CODEX_RUNTIME_SELECTOR === "legacy-sdk";
}

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
    { type: "system", content: "codex turn failed" },
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

function pruneExpiredStreams(now = Date.now()) {
  for (const [streamId, session] of activeStreams.entries()) {
    const ttl = session.done ? COMPLETED_STREAM_TTL_MS : ACTIVE_STREAM_TTL_MS;
    if (now - session.updatedAt > ttl) {
      activeStreams.delete(streamId);
    }
  }
}

function getStreamEndCursor(session: ActiveStreamSession) {
  return session.baseCursor + session.events.length;
}

function compactStreamToCursor(session: ActiveStreamSession, cursor: number) {
  const nextCursor = Math.max(
    session.baseCursor,
    Math.min(cursor, getStreamEndCursor(session)),
  );
  const dropCount = nextCursor - session.baseCursor;
  if (dropCount > 0) {
    session.events.splice(0, dropCount);
    session.baseCursor = nextCursor;
  }
  return nextCursor;
}

function cleanupProviderTaskState(taskId: string) {
  cleanupClaudeTask(taskId);
  cleanupCodexTask(taskId);
  cleanupCodexAppServerTask(taskId);
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

function describeClaudeAvailability(args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {}) {
  const executablePath = resolveClaudeExecutablePath({
    explicitPath: args.runtimeOptions?.claudeBinaryPath,
  });
  if (!executablePath) {
    setCachedAvailability("claude-code", false);
    return {
      available: false,
      detail: "Claude CLI not found from runtime override, STAVE_CLAUDE_CLI_PATH, CLAUDE_CODE_PATH, login-shell PATH, or home-bin candidates.",
    };
  }

  const versionProbe = probeExecutableVersion({
    executablePath,
    env: buildClaudeEnv({ executablePath }),
  });
  const available = versionProbe.status === 0;
  const detail = available
    ? `Resolved Claude CLI: ${executablePath}`
    : [
        `Claude executable probe failed: ${executablePath}`,
        versionProbe.stderr,
        versionProbe.error,
      ].filter(Boolean).join("\n");
  setCachedAvailability("claude-code", available);
  return { available, detail };
}

function describeCodexAvailability(args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {}) {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!executablePath) {
    setCachedAvailability("codex", false);
    return {
      available: false,
      detail: "Codex executable not found from runtime override, env vars, login-shell PATH, or home-bin candidates.",
    };
  }

  const versionProbe = probeExecutableVersion({
    executablePath,
    env: buildRuntimeProcessEnv({
      executablePath,
      extraPaths: CODEX_LOOKUP_PATHS,
    }),
  });
  const available = versionProbe.status === 0;
  const detail = available
    ? `Resolved Codex executable: ${executablePath}`
    : [
        `Codex executable probe failed: ${executablePath}`,
        versionProbe.stderr,
        versionProbe.error,
      ].filter(Boolean).join("\n");
  setCachedAvailability("codex", available);
  return { available, detail };
}

function describeStaveAvailability(args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {}) {
  const claude = describeClaudeAvailability(args);
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

    const forcedPlanTarget = resolveForcedStavePlanTarget({
      profile,
      runtimeOptions: args.runtimeOptions,
    });
    if (forcedPlanTarget != null) {
      const chosenModel = resolveAvailableStaveModel({ model: forcedPlanTarget.model });

      const resolvedTarget: StaveRouteTarget = {
        providerId: resolveStaveProviderForModel({ model: chosenModel }),
        model: chosenModel,
        reason: forcedPlanTarget.reason,
      };

      const resolvedArgs = buildStaveResolvedArgs(args, resolvedTarget, {
        forceCodexPlanMode: true,
      });

      const claudeFastSupported = profile.claudeFastModeSupported !== false;
      const codexFastSupported = profile.codexFastModeSupported !== false;
      if (profile.fastMode) {
        resolvedArgs.runtimeOptions = {
          ...resolvedArgs.runtimeOptions,
          ...(claudeFastSupported ? { claudeFastMode: true } : {}),
          ...(codexFastSupported ? { codexFastMode: true } : {}),
        };
      }
      resolvedArgs.runtimeOptions = applyStaveRoleRuntimeOverrides({
        profile,
        role: "plan",
        model: resolvedTarget.model,
        runtimeOptions: resolvedArgs.runtimeOptions,
      });

      // Plan-mode forced route: role overrides must not clobber the plan routing signal.
      // The forceCodexPlanMode flag (set above) already handles Codex; guard Claude here.
      if (resolvedTarget.providerId === "claude-code") {
        resolvedArgs.runtimeOptions!.claudePermissionMode = "plan";
      }

      const fastModeApplied =
        resolvedTarget.providerId === "codex"
          ? (resolvedArgs.runtimeOptions?.codexFastMode ?? false)
          : (resolvedArgs.runtimeOptions?.claudeFastMode ?? false);

      args.onEvent?.({
        type: "stave:execution_processing",
        strategy: "direct",
        model: chosenModel,
        reason: forcedPlanTarget.reason,
        fastModeRequested: profile.fastMode ?? false,
        fastModeApplied,
      });

      args.onEvent?.({
        type: "model_resolved",
        resolvedProviderId: resolvedTarget.providerId,
        resolvedModel: resolvedTarget.model,
      });

      return runProviderTurn(resolvedArgs);
    }

    // ── Skill fast-path: bypass preprocessor when skill_context is present ──
    // Skills carry an explicit provider preference — no classifier needed.
    const skillTarget = resolveSkillFastPath({ contextParts, profile });
    if (skillTarget != null) {
      const chosenModel = resolveAvailableStaveModel({ model: skillTarget.model });

      const resolvedTarget: StaveRouteTarget = {
        providerId: resolveStaveProviderForModel({ model: chosenModel }),
        model: chosenModel,
        reason: skillTarget.reason,
      };

      const resolvedArgs = buildStaveResolvedArgs(args, resolvedTarget);
      resolvedArgs.runtimeOptions = applyStaveRoleRuntimeOverrides({
        profile,
        role: resolvedTarget.providerId === "codex" ? "implement" : "general",
        model: resolvedTarget.model,
        runtimeOptions: resolvedArgs.runtimeOptions,
      });

      // Emit execution plan with skill fast-path indication.
      args.onEvent?.({
        type: "stave:execution_processing",
        strategy: "direct",
        model: chosenModel,
        reason: skillTarget.reason,
      });

      args.onEvent?.({
        type: "model_resolved",
        resolvedProviderId: resolvedTarget.providerId,
        resolvedModel: resolvedTarget.model,
      });

      return runProviderTurn(resolvedArgs);
    }

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
      // (MODEL_FALLBACK is hoisted to the top of the stave block.)

      const chosenModel = resolveAvailableStaveModel({
        model: resolveStaveIntentModel({
          profile,
          intent: plan.intent,
        }),
      });

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
      resolvedArgs.runtimeOptions = applyStaveRoleRuntimeOverrides({
        profile,
        role: plan.intent,
        model: resolvedTarget.model,
        runtimeOptions: resolvedArgs.runtimeOptions,
      });

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
      task: (shouldUseLegacyCodexRuntime() ? streamCodexWithSdk : streamCodexWithAppServer)({
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
    const fallback = toCodexErrorEvents({
      message: `Codex unavailable/timeout. Check codex auth and runtime environment. timeout=${turnTimeoutMs}ms`,
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
    pruneExpiredStreams();
    const streamId = randomUUID();
    const turnId = args.turnId ?? randomUUID();
    const shouldBufferForPolling = options?.bufferEvents ?? !options?.onEvent;
    const session: ActiveStreamSession = {
      events: [],
      done: false,
      updatedAt: Date.now(),
      baseCursor: 0,
    };
    activeStreams.set(streamId, session);
    upsertActiveSession({
      turnId,
      providerId: args.providerId,
      taskId: args.taskId,
      streamId,
    });
    queueMicrotask(() => {
      void runProviderTurn({
        ...args,
        turnId,
        onEvent: (event) => {
          if (shouldBufferForPolling) {
            session.events.push(event);
          }
          session.updatedAt = Date.now();
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
          session.updatedAt = Date.now();
          clearActiveTurnState({ turnId });
          if (!shouldBufferForPolling) {
            activeStreams.delete(streamId);
          }
          options?.onDone?.();
        });
    });
    return { ok: true, streamId };
  },
  readTurnStream: ({ streamId, cursor }) => {
    pruneExpiredStreams();
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
    if (safeCursor < session.baseCursor) {
      return {
        ok: false,
        events: [],
        cursor: session.baseCursor,
        done: session.done,
        message: "Stream cursor is older than the retained replay window.",
      };
    }
    const nextCursor = compactStreamToCursor(session, safeCursor);
    const events = session.events.slice();
    const outCursor = nextCursor + events.length;
    const done = session.done;
    session.updatedAt = Date.now();
    if (done && session.events.length === 0) {
      activeStreams.delete(streamId);
    }
    return {
      ok: true,
      events,
      cursor: outCursor,
      done,
    };
  },
  ackTurnStream: ({ streamId, cursor }) => {
    pruneExpiredStreams();
    const session = activeStreams.get(streamId);
    if (!session) {
      return {
        ok: false,
        message: "Stream session not found.",
      };
    }
    const safeCursor = Number.isFinite(cursor) ? cursor : 0;
    if (safeCursor < session.baseCursor) {
      return {
        ok: false,
        message: "Stream cursor is older than the retained replay window.",
      };
    }
    compactStreamToCursor(session, safeCursor);
    session.updatedAt = Date.now();
    if (session.done && session.events.length === 0) {
      activeStreams.delete(streamId);
    }
    return {
      ok: true,
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
    cleanupProviderTaskState(taskId);
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
      const result = describeClaudeAvailability({ runtimeOptions });
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
      detail: "Codex does not expose a native slash-command catalog through the current SDK/CLI transport. Slash commands are passed through unchanged.",
    };
  },
  getConnectedToolStatus: async (args) => getProviderConnectedToolStatus(args),
  shutdown: async () => {
    const taskIds = new Set<string>();
    for (const session of activeSessions.values()) {
      session.abort?.();
      if (session.taskId) {
        taskIds.add(session.taskId);
      }
    }
    activeSessions.clear();
    activeStreams.clear();
    cleanupProviderTaskState(DEFAULT_PROVIDER_TASK_KEY);
    for (const taskId of taskIds) {
      cleanupProviderTaskState(taskId);
    }
  },
};
