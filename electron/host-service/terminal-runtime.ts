import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import {
  buildTerminalSessionSlotKey,
  type CliSessionCreateSessionArgs,
  type TerminalCreateSessionArgs,
} from "../../src/lib/terminal/types";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../providers/cli-path-env";
import {
  bindTerminalSessionSlot,
  clearTerminalSessionSlotRegistry,
  createTerminalSessionSlotRegistry,
  getTerminalSessionIdForSlotKey,
  unbindTerminalSessionSlotBySessionId,
  unbindTerminalSessionSlotBySlotKey,
} from "../main/terminal-session-slot-registry";
import { resolveCommandCwd } from "../main/utils/command";
import type {
  HostServiceEventMap,
  HostTerminalCreateSessionResult,
  HostTerminalMutationResult,
  HostTerminalReadSessionResult,
} from "./protocol";

const DEFAULT_TERMINAL_FOREGROUND = "#d4d4d4";
const DEFAULT_TERMINAL_BACKGROUND = "#1e1e1e";
const TERMINAL_SESSION_CLOSE_TIMEOUT_MS = 5_000;
const TERMINAL_PUSH_BACKLOG_WARN_BYTES = 128 * 1024;
const TERMINAL_PUSH_BACKLOG_LOG_INTERVAL_MS = 2_000;

const TERMINAL_BACKGROUND_BUFFER_MAX_BYTES = 32 * 1024 * 1024;
const TERMINAL_OUTPUT_CHUNKS_MAX_BYTES = 8 * 1024 * 1024;

interface TerminalSessionEntry {
  pty: pty.IPty;
  dataSubscription: pty.IDisposable | null;
  exitSubscription: pty.IDisposable | null;
  headlessTerminal: HeadlessTerminal;
  serializeAddon: SerializeAddon;
  headlessDataSubscription: { dispose: () => void } | null;
  lastHeadlessWritePromise: Promise<void>;
  outputChunks: string[];
  outputChunksBytes: number;
  pendingPush: string[];
  pendingPushBytes: number;
  peakPendingPushBytes: number;
  lastBackpressureLogAt: number;
  backlogWarningActive: boolean;
  pushScheduled: boolean;
  pushWriteInFlight: boolean;
  lastPushWritePromise: Promise<void> | null;
  deliveryMode: "poll" | "push";
  closing: boolean;
  slotKey: string | null;
  closed: Promise<void>;
  close: () => void;
  disposePtyListeners: () => void;
  disposeHeadlessMirror: () => void;
  flushPushOutput: () => void;
  markClosed: () => void;
  activeAttachmentId: string | null;
  streamReadyAttachmentId: string | null;
  backgroundBuffer: string[];
  backgroundBufferBytes: number;
  exitCode: number | null;
  exitSignal: number | undefined;
}

function createBufferedDataHandler(onData: (data: string) => void) {
  let buffer = "";
  return (data: string) => {
    buffer += data;
    let sendUpTo = buffer.length;

    if (buffer.endsWith("\x1b")) {
      sendUpTo = buffer.length - 1;
    } else if (buffer.endsWith("\x1b[")) {
      sendUpTo = buffer.length - 2;
    } else {
      const csiTail = buffer.match(/\x1b\[[0-9;]*$/);
      if (csiTail) {
        sendUpTo = buffer.length - csiTail[0].length;
      }
    }

    if (sendUpTo === buffer.length) {
      const oscStart = buffer.lastIndexOf("\x1b]");
      if (oscStart >= 0) {
        const afterOsc = buffer.substring(oscStart);
        const hasTerminator =
          afterOsc.includes("\x07") || afterOsc.includes("\x1b\\");
        if (!hasTerminator) {
          sendUpTo = oscStart;
        }
      }
    }

    if (sendUpTo > 0) {
      onData(buffer.substring(0, sendUpTo));
      buffer = buffer.substring(sendUpTo);
    }
  };
}

function createOscColorInterceptor(args: {
  writeToPty: (data: string) => void;
  foreground: string;
  background: string;
}) {
  function hexToX11(hex: string) {
    const value = hex.replace("#", "");
    return `rgb:${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4, 6)}`;
  }

  const foreground = hexToX11(args.foreground);
  const background = hexToX11(args.background);

  return (data: string) =>
    data.replace(
      /\x1b\](10|11);?\?(?:\x07|\x1b\\)/g,
      (_match, code: string) => {
        args.writeToPty(
          `\x1b]${code};${code === "10" ? foreground : background}\x1b\\`,
        );
        return "";
      },
    );
}

function logTerminalPushBackpressure(message: string) {
  process.stderr.write(`[terminal:push-backpressure] ${message}\n`);
}

export function createTerminalRuntime(args: {
  emitEvent: <TEvent extends keyof HostServiceEventMap>(
    event: TEvent,
    payload: HostServiceEventMap[TEvent],
  ) => Promise<void>;
}) {
  const { emitEvent } = args;
  const sessions = new Map<string, TerminalSessionEntry>();
  const sessionSlotRegistry = createTerminalSessionSlotRegistry();
  const exitedSlotInfo = new Map<
    string,
    { exitCode: number; signal?: number }
  >();

  function deleteSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session?.slotKey != null) {
      exitedSlotInfo.set(session.slotKey, {
        exitCode: session.exitCode ?? -1,
        signal: session.exitSignal,
      });
    }
    sessions.delete(sessionId);
    unbindTerminalSessionSlotBySessionId({
      registry: sessionSlotRegistry,
      sessionId,
    });
  }

  function getSessionBySlotKey(slotKey: string) {
    const sessionId = getTerminalSessionIdForSlotKey({
      registry: sessionSlotRegistry,
      slotKey,
    });
    if (!sessionId) {
      return null;
    }
    const session = sessions.get(sessionId);
    if (session) {
      return { sessionId, session };
    }
    unbindTerminalSessionSlotBySlotKey({
      registry: sessionSlotRegistry,
      slotKey,
    });
    return null;
  }

  function bufferPendingPushOutput(session: TerminalSessionEntry) {
    if (session.pendingPush.length === 0) {
      return;
    }
    appendOutputChunk(session, session.pendingPush.join(""));
    session.pendingPush.length = 0;
    session.pendingPushBytes = 0;
    session.pushScheduled = false;
  }

  function appendBounded(
    buffer: string[],
    tracker: { bytes: number },
    data: string,
    maxBytes: number,
  ) {
    buffer.push(data);
    tracker.bytes += Buffer.byteLength(data);
    while (tracker.bytes > maxBytes && buffer.length > 1) {
      const removed = buffer.shift()!;
      tracker.bytes -= Buffer.byteLength(removed);
    }
  }

  function appendBackgroundBuffer(session: TerminalSessionEntry, data: string) {
    appendBounded(
      session.backgroundBuffer,
      {
        get bytes() {
          return session.backgroundBufferBytes;
        },
        set bytes(v) {
          session.backgroundBufferBytes = v;
        },
      },
      data,
      TERMINAL_BACKGROUND_BUFFER_MAX_BYTES,
    );
  }

  function appendOutputChunk(session: TerminalSessionEntry, data: string) {
    appendBounded(
      session.outputChunks,
      {
        get bytes() {
          return session.outputChunksBytes;
        },
        set bytes(v) {
          session.outputChunksBytes = v;
        },
      },
      data,
      TERMINAL_OUTPUT_CHUNKS_MAX_BYTES,
    );
  }

  function hasActiveAttachment(session: TerminalSessionEntry) {
    return session.activeAttachmentId !== null;
  }

  function isPushStreamReady(session: TerminalSessionEntry) {
    return (
      session.deliveryMode === "push" &&
      session.activeAttachmentId !== null &&
      session.streamReadyAttachmentId === session.activeAttachmentId
    );
  }

  function drainBackgroundBuffer(session: TerminalSessionEntry): string {
    if (session.backgroundBuffer.length === 0) {
      return "";
    }
    const backlog = session.backgroundBuffer.join("");
    session.backgroundBuffer.length = 0;
    session.backgroundBufferBytes = 0;
    return backlog;
  }

  function serializeScreenState(session: TerminalSessionEntry): string {
    try {
      return session.serializeAddon.serialize();
    } catch (error) {
      console.warn("[terminal] failed to serialize screen state", error);
      return "";
    }
  }

  function maybeLogTerminalBackpressure(args: {
    session: TerminalSessionEntry;
    sessionId: string;
    reason: string;
    flushedBytes?: number;
  }) {
    const now = Date.now();
    if (
      now - args.session.lastBackpressureLogAt <
      TERMINAL_PUSH_BACKLOG_LOG_INTERVAL_MS
    ) {
      return;
    }
    args.session.lastBackpressureLogAt = now;
    args.session.backlogWarningActive = true;
    const flushedSuffix =
      typeof args.flushedBytes === "number"
        ? ` flushedBytes=${args.flushedBytes}`
        : "";
    logTerminalPushBackpressure(
      `reason=${args.reason} session=${args.sessionId} slot=${args.session.slotKey ?? "none"} deliveryMode=${args.session.deliveryMode} pendingChunks=${args.session.pendingPush.length} pendingBytes=${args.session.pendingPushBytes} peakPendingBytes=${args.session.peakPendingPushBytes}${flushedSuffix}`,
    );
  }

  function maybeLogTerminalRecovery(args: {
    session: TerminalSessionEntry;
    sessionId: string;
  }) {
    if (
      !args.session.backlogWarningActive ||
      args.session.pendingPushBytes > 0
    ) {
      return;
    }
    args.session.backlogWarningActive = false;
    logTerminalPushBackpressure(
      `reason=drained session=${args.sessionId} slot=${args.session.slotKey ?? "none"} peakPendingBytes=${args.session.peakPendingPushBytes}`,
    );
  }

  function mirrorPtyOutput(session: TerminalSessionEntry, data: string) {
    session.lastHeadlessWritePromise = session.lastHeadlessWritePromise.then(
      () =>
        new Promise<void>((resolve) => {
          try {
            session.headlessTerminal.write(data, resolve);
          } catch (error) {
            console.warn("[terminal] failed to mirror PTY output", error);
            resolve();
          }
        }),
    );
    return session.lastHeadlessWritePromise;
  }

  function schedulePushFlush(session: TerminalSessionEntry) {
    if (
      session.closing ||
      !isPushStreamReady(session) ||
      session.pushScheduled ||
      session.pushWriteInFlight ||
      session.pendingPush.length === 0
    ) {
      return;
    }
    session.pushScheduled = true;
    setImmediate(session.flushPushOutput);
  }

  function flushPushOutputNow(args: {
    session: TerminalSessionEntry;
    sessionId: string;
  }) {
    const { session, sessionId } = args;
    session.pushScheduled = false;
    if (
      session.closing ||
      session.pushWriteInFlight ||
      !isPushStreamReady(session) ||
      session.pendingPush.length === 0
    ) {
      return session.lastPushWritePromise ?? Promise.resolve();
    }
    const output = session.pendingPush.join("");
    const outputBytes = session.pendingPushBytes;
    session.pendingPush.length = 0;
    session.pendingPushBytes = 0;
    session.pushWriteInFlight = true;
    const pushPromise = emitEvent("terminal.output", { sessionId, output })
      .catch((error) => {
        if (hasActiveAttachment(session)) {
          appendOutputChunk(session, output);
          session.deliveryMode = "poll";
          session.streamReadyAttachmentId = null;
        } else {
          appendBackgroundBuffer(session, output);
        }
        maybeLogTerminalBackpressure({
          reason: "emit-failed-fallback-to-poll",
          session,
          sessionId,
          flushedBytes: outputBytes,
        });
        console.error("[terminal] failed to emit push output", error);
      })
      .finally(() => {
        session.pushWriteInFlight = false;
        if (session.lastPushWritePromise === pushPromise) {
          session.lastPushWritePromise = null;
        }
        maybeLogTerminalRecovery({ session, sessionId });
        schedulePushFlush(session);
      });
    session.lastPushWritePromise = pushPromise;
    return pushPromise;
  }

  function setSessionDeliveryMode(args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.deliveryMode = args.deliveryMode;
    if (args.deliveryMode === "push" && isPushStreamReady(session)) {
      schedulePushFlush(session);
    } else {
      bufferPendingPushOutput(session);
    }
    return { ok: true };
  }

  function createPtySession(args: {
    command: string;
    commandArgs?: string[];
    env: Record<string, string>;
    cwd: string;
    cols?: number;
    rows?: number;
    deliveryMode?: "poll" | "push";
    themeColors?: { foreground?: string; background?: string };
    slotKey?: string;
  }) {
    const ptyProcess = pty.spawn(args.command, args.commandArgs ?? [], {
      name: "xterm-256color",
      cols: args.cols ?? 80,
      rows: args.rows ?? 24,
      cwd: resolveCommandCwd({ cwd: args.cwd }),
      env: args.env,
    });

    const sessionId = randomUUID();
    const headlessTerminal = new HeadlessTerminal({
      cols: Math.max(1, args.cols ?? 80),
      rows: Math.max(1, args.rows ?? 24),
      allowProposedApi: true,
    });
    const serializeAddon = new SerializeAddon();
    headlessTerminal.loadAddon(serializeAddon);
    let headlessMirrorDisposed = false;
    let closeResolved = false;
    let resolveClosed = () => {};
    const closed = new Promise<void>((resolve) => {
      resolveClosed = () => {
        if (closeResolved) {
          return;
        }
        closeResolved = true;
        resolve();
      };
    });

    const session: TerminalSessionEntry = {
      pty: ptyProcess,
      dataSubscription: null,
      exitSubscription: null,
      headlessTerminal,
      serializeAddon,
      headlessDataSubscription: null,
      lastHeadlessWritePromise: Promise.resolve(),
      outputChunks: [],
      outputChunksBytes: 0,
      pendingPush: [],
      pendingPushBytes: 0,
      peakPendingPushBytes: 0,
      lastBackpressureLogAt: 0,
      backlogWarningActive: false,
      pushScheduled: false,
      pushWriteInFlight: false,
      lastPushWritePromise: null,
      deliveryMode: args.deliveryMode ?? "poll",
      closing: false,
      slotKey: args.slotKey ?? null,
      closed,
      activeAttachmentId: null,
      streamReadyAttachmentId: null,
      backgroundBuffer: [],
      backgroundBufferBytes: 0,
      exitCode: null,
      exitSignal: undefined,
      close: () => {
        if (session.closing) {
          return;
        }
        session.closing = true;
        session.disposePtyListeners();
        session.disposeHeadlessMirror();
        session.markClosed();
        const closablePty = ptyProcess as pty.IPty & { destroy?: () => void };
        if (typeof closablePty.destroy === "function") {
          closablePty.destroy();
          return;
        }
        ptyProcess.kill();
      },
      disposePtyListeners: () => {
        session.dataSubscription?.dispose();
        session.exitSubscription?.dispose();
        session.dataSubscription = null;
        session.exitSubscription = null;
      },
      disposeHeadlessMirror: () => {
        if (headlessMirrorDisposed) {
          return;
        }
        headlessMirrorDisposed = true;
        session.headlessDataSubscription?.dispose();
        session.headlessDataSubscription = null;
        session.headlessTerminal.dispose();
      },
      flushPushOutput: () => {
        void flushPushOutputNow({ session, sessionId });
      },
      markClosed: resolveClosed,
    };

    sessions.set(sessionId, session);
    if (args.slotKey) {
      exitedSlotInfo.delete(args.slotKey);
      bindTerminalSessionSlot({
        registry: sessionSlotRegistry,
        sessionId,
        slotKey: args.slotKey,
      });
    }

    const interceptOscColor = createOscColorInterceptor({
      writeToPty: (response) => {
        if (!session.closing) {
          ptyProcess.write(response);
        }
      },
      foreground: args.themeColors?.foreground ?? DEFAULT_TERMINAL_FOREGROUND,
      background: args.themeColors?.background ?? DEFAULT_TERMINAL_BACKGROUND,
    });

    session.headlessDataSubscription = headlessTerminal.onData((data) => {
      if (!data || session.closing) {
        return;
      }
      ptyProcess.write(data);
    });

    session.dataSubscription = ptyProcess.onData(
      createBufferedDataHandler((data) => {
        if (session.closing) {
          return;
        }
        const filtered = interceptOscColor(data);
        if (!filtered) {
          return;
        }
        void mirrorPtyOutput(session, filtered);
        if (!hasActiveAttachment(session)) {
          appendBackgroundBuffer(session, filtered);
          return;
        }
        if (isPushStreamReady(session)) {
          session.pendingPush.push(filtered);
          session.pendingPushBytes += Buffer.byteLength(filtered);
          session.peakPendingPushBytes = Math.max(
            session.peakPendingPushBytes,
            session.pendingPushBytes,
          );
          if (session.pendingPushBytes >= TERMINAL_PUSH_BACKLOG_WARN_BYTES) {
            maybeLogTerminalBackpressure({
              reason: "queued",
              session,
              sessionId,
            });
          }
          schedulePushFlush(session);
          return;
        }
        appendOutputChunk(session, filtered);
      }),
    );

    session.exitSubscription = ptyProcess.onExit(({ exitCode, signal }) => {
      session.exitCode = exitCode ?? -1;
      session.exitSignal = signal;
      session.disposePtyListeners();
      session.disposeHeadlessMirror();
      session.markClosed();
      deleteSession(sessionId);
      void (async () => {
        await flushPushOutputNow({ session, sessionId });
        await emitEvent("terminal.exit", {
          sessionId,
          exitCode: exitCode ?? -1,
          signal,
        });
      })().catch((error) => {
        console.error("[terminal] failed to emit session exit", error);
      });
    });

    return sessionId;
  }

  function createSession(
    args: TerminalCreateSessionArgs,
  ): HostTerminalCreateSessionResult {
    const slotKey = buildTerminalSessionSlotKey({
      workspaceId: args.workspaceId,
      surface: "terminal",
      tabId: args.terminalTabId,
    });
    const existing = getSessionBySlotKey(slotKey);
    if (existing && !existing.session.closing) {
      setSessionDeliveryMode({
        sessionId: existing.sessionId,
        deliveryMode: args.deliveryMode ?? existing.session.deliveryMode,
      });
      return { ok: true, sessionId: existing.sessionId };
    }

    const shellExe = args.shell?.trim() || process.env.SHELL || "/bin/bash";
    return {
      ok: true,
      sessionId: createPtySession({
        command: shellExe,
        cwd: args.cwd || args.workspacePath,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
        slotKey,
        env: {
          ...(process.env as Record<string, string>),
          STAVE_WORKSPACE_PATH: args.workspacePath,
          STAVE_TASK_ID: args.taskId ?? "",
        },
      }),
    };
  }

  function createCliSession(
    args: CliSessionCreateSessionArgs,
  ): HostTerminalCreateSessionResult {
    const slotKey = buildTerminalSessionSlotKey({
      workspaceId: args.workspaceId,
      surface: "cli",
      tabId: args.cliSessionTabId,
    });
    const existing = getSessionBySlotKey(slotKey);
    if (existing && !existing.session.closing) {
      setSessionDeliveryMode({
        sessionId: existing.sessionId,
        deliveryMode: args.deliveryMode ?? existing.session.deliveryMode,
      });
      return { ok: true, sessionId: existing.sessionId };
    }

    if (args.providerId === "claude-code") {
      const executablePath = resolveClaudeCliExecutablePath({
        explicitPath: args.runtimeOptions?.claudeBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          stderr:
            "Claude executable not found. Check Claude CLI installation and auth.",
        };
      }
      const env = buildClaudeCliEnv({ executablePath });
      return {
        ok: true,
        sessionId: createPtySession({
          command: executablePath,
          cwd: args.cwd || args.workspacePath,
          cols: args.cols,
          rows: args.rows,
          deliveryMode: args.deliveryMode,
          slotKey,
          env: {
            ...env,
            STAVE_WORKSPACE_PATH: args.workspacePath,
            STAVE_TASK_ID: args.taskId ?? "",
            STAVE_TASK_TITLE: args.taskTitle ?? "",
          },
        }),
      };
    }

    const executablePath = resolveCodexCliExecutablePath({
      explicitPath: args.runtimeOptions?.codexBinaryPath,
    });
    if (!executablePath) {
      return {
        ok: false,
        stderr:
          "Codex executable not found. Check Codex CLI installation or the configured binary path.",
      };
    }
    const env = buildCodexCliEnv({ executablePath });
    return {
      ok: true,
      sessionId: createPtySession({
        command: executablePath,
        cwd: args.cwd || args.workspacePath,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
        slotKey,
        env: {
          ...env,
          STAVE_WORKSPACE_PATH: args.workspacePath,
          STAVE_TASK_ID: args.taskId ?? "",
          STAVE_TASK_TITLE: args.taskTitle ?? "",
        },
      }),
    };
  }

  function writeSession(args: {
    sessionId: string;
    input: string;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.pty.write(args.input);
    return { ok: true };
  }

  function readSession(args: {
    sessionId: string;
  }): HostTerminalReadSessionResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return {
        ok: false,
        output: "",
        stderr: "Terminal session not found.",
      };
    }
    bufferPendingPushOutput(session);
    const backgroundOutput = drainBackgroundBuffer(session);
    const pollOutput = session.outputChunks.join("");
    session.outputChunks.length = 0;
    session.outputChunksBytes = 0;
    const output = backgroundOutput
      ? `${backgroundOutput}${pollOutput}`
      : pollOutput;
    return { ok: true, output };
  }

  function resizeSession(args: {
    sessionId: string;
    cols: number;
    rows: number;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    const cols = Math.max(1, args.cols);
    const rows = Math.max(1, args.rows);
    session.pty.resize(cols, rows);
    session.headlessTerminal.resize(cols, rows);
    return { ok: true };
  }

  function closeSession(args: {
    sessionId: string;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.close();
    session.disposeHeadlessMirror();
    deleteSession(args.sessionId);
    return { ok: true };
  }

  function bufferSessionOutput(args: {
    sessionId: string;
    output: string;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    if (args.output) {
      appendOutputChunk(session, args.output);
    }
    return { ok: true };
  }

  function closeSessionsBySlotPrefix(args: { prefix: string }): {
    ok: true;
    closedCount: number;
  } {
    let closedCount = 0;
    for (const [slotKey, sessionId] of sessionSlotRegistry.sessionIdBySlotKey) {
      if (!slotKey.startsWith(args.prefix)) {
        continue;
      }
      const session = sessions.get(sessionId);
      if (session && !session.closing) {
        session.close();
        deleteSession(sessionId);
        closedCount++;
      }
    }
    for (const slotKey of exitedSlotInfo.keys()) {
      if (slotKey.startsWith(args.prefix)) {
        exitedSlotInfo.delete(slotKey);
      }
    }
    return { ok: true, closedCount };
  }

  async function cleanupAll() {
    const currentSessions = [...sessions.values()];
    sessions.clear();
    clearTerminalSessionSlotRegistry({ registry: sessionSlotRegistry });

    await Promise.allSettled(
      currentSessions.map(async (session) => {
        session.close();
        await Promise.race([
          session.closed,
          new Promise<void>((resolve) => {
            setTimeout(resolve, TERMINAL_SESSION_CLOSE_TIMEOUT_MS);
          }),
        ]);
      }),
    );
  }

  async function attachSession(args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }): Promise<{
    ok: boolean;
    attachmentId?: string;
    backlog?: string;
    screenState?: string;
    stderr?: string;
  }> {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    const attachmentId = randomUUID();
    session.activeAttachmentId = attachmentId;
    session.streamReadyAttachmentId = null;
    const backlog = drainBackgroundBuffer(session);
    bufferPendingPushOutput(session);
    session.deliveryMode = args.deliveryMode;
    await session.lastHeadlessWritePromise;
    const screenState = serializeScreenState(session);

    // Any output accumulated while attach was capturing is now represented by
    // screenState. Keep only post-attach output for the later resume flush.
    session.outputChunks.length = 0;
    session.outputChunksBytes = 0;

    return {
      ok: true,
      attachmentId,
      backlog,
      screenState,
    };
  }

  function detachSession(args: {
    sessionId: string;
    attachmentId?: string;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    if (
      args.attachmentId &&
      session.activeAttachmentId &&
      session.activeAttachmentId !== args.attachmentId
    ) {
      return { ok: true };
    }
    session.activeAttachmentId = null;
    session.streamReadyAttachmentId = null;
    bufferPendingPushOutput(session);
    for (const chunk of session.outputChunks) {
      appendBackgroundBuffer(session, chunk);
    }
    session.outputChunks.length = 0;
    session.outputChunksBytes = 0;
    session.deliveryMode = "poll";
    return { ok: true };
  }

  function resumeSessionStream(args: {
    sessionId: string;
    attachmentId: string;
  }): HostTerminalMutationResult {
    const session = sessions.get(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    if (session.activeAttachmentId !== args.attachmentId) {
      return { ok: true };
    }
    session.streamReadyAttachmentId = args.attachmentId;
    if (session.deliveryMode === "push" && session.outputChunks.length > 0) {
      const output = session.outputChunks.join("");
      session.outputChunks.length = 0;
      session.outputChunksBytes = 0;
      session.pendingPush.push(output);
      session.pendingPushBytes += Buffer.byteLength(output);
      session.peakPendingPushBytes = Math.max(
        session.peakPendingPushBytes,
        session.pendingPushBytes,
      );
    }
    if (isPushStreamReady(session)) {
      schedulePushFlush(session);
    }
    return { ok: true };
  }

  function getSlotState(args: { slotKey: string }): {
    state: "idle" | "running" | "background" | "exited";
    sessionId?: string;
    exitCode?: number;
    signal?: number;
  } {
    const existing = getSessionBySlotKey(args.slotKey);
    if (!existing) {
      const exited = exitedSlotInfo.get(args.slotKey);
      if (exited) {
        return {
          state: "exited",
          exitCode: exited.exitCode,
          signal: exited.signal,
        };
      }
      return { state: "idle" };
    }
    const { sessionId, session } = existing;
    if (session.closing) {
      return {
        state: "exited",
        sessionId,
        exitCode: session.exitCode ?? -1,
        signal: session.exitSignal,
      };
    }
    if (!hasActiveAttachment(session)) {
      return { state: "background", sessionId };
    }
    return { state: "running", sessionId };
  }

  return {
    createSession,
    createCliSession,
    writeSession,
    readSession,
    setSessionDeliveryMode,
    resizeSession,
    closeSession,
    bufferSessionOutput,
    attachSession,
    detachSession,
    resumeSessionStream,
    getSlotState,
    closeSessionsBySlotPrefix,
    cleanupAll,
  };
}
