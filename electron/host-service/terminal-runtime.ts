import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
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

interface TerminalSessionEntry {
  pty: pty.IPty;
  outputChunks: string[];
  pendingPush: string[];
  pushScheduled: boolean;
  deliveryMode: "poll" | "push";
  closing: boolean;
  closed: Promise<void>;
  close: () => void;
  flushPushOutput: () => void;
  markClosed: () => void;
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
    data.replace(/\x1b\](10|11);?\?(?:\x07|\x1b\\)/g, (_match, code: string) => {
      args.writeToPty(`\x1b]${code};${code === "10" ? foreground : background}\x1b\\`);
      return "";
    });
}

function buildTerminalSessionSlotKey(args: {
  workspaceId: string;
  surface: "terminal" | "cli";
  tabId: string;
}) {
  return `${args.surface}:${args.workspaceId}:${args.tabId}`;
}

export function createTerminalRuntime(args: {
  emitEvent: <TEvent extends keyof HostServiceEventMap>(
    event: TEvent,
    payload: HostServiceEventMap[TEvent],
  ) => void;
}) {
  const { emitEvent } = args;
  const sessions = new Map<string, TerminalSessionEntry>();
  const sessionSlotRegistry = createTerminalSessionSlotRegistry();

  function deleteSession(sessionId: string) {
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
    session.outputChunks.push(session.pendingPush.join(""));
    session.pendingPush.length = 0;
    session.pushScheduled = false;
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
    if (args.deliveryMode === "push") {
      session.flushPushOutput();
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
      outputChunks: [],
      pendingPush: [],
      pushScheduled: false,
      deliveryMode: args.deliveryMode ?? "poll",
      closing: false,
      closed,
      close: () => {
        if (session.closing) {
          return;
        }
        session.closing = true;
        const closablePty = ptyProcess as pty.IPty & { destroy?: () => void };
        if (typeof closablePty.destroy === "function") {
          closablePty.destroy();
          return;
        }
        ptyProcess.kill();
      },
      flushPushOutput: () => {
        session.pushScheduled = false;
        if (session.closing || session.pendingPush.length === 0) {
          return;
        }
        const output = session.pendingPush.join("");
        session.pendingPush.length = 0;
        emitEvent("terminal.output", { sessionId, output });
      },
      markClosed: resolveClosed,
    };

    sessions.set(sessionId, session);
    if (args.slotKey) {
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

    ptyProcess.onData(
      createBufferedDataHandler((data) => {
        if (session.closing) {
          return;
        }
        const filtered = interceptOscColor(data);
        if (!filtered) {
          return;
        }
        if (session.deliveryMode === "push") {
          session.pendingPush.push(filtered);
          if (!session.pushScheduled) {
            session.pushScheduled = true;
            setImmediate(session.flushPushOutput);
          }
          return;
        }
        session.outputChunks.push(filtered);
      }),
    );

    ptyProcess.onExit(({ exitCode, signal }) => {
      session.markClosed();
      deleteSession(sessionId);
      emitEvent("terminal.exit", {
        sessionId,
        exitCode: exitCode ?? -1,
        signal,
      });
    });

    return sessionId;
  }

  function createSession(args: TerminalCreateSessionArgs): HostTerminalCreateSessionResult {
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
          stderr: "Claude executable not found. Check Claude CLI installation and auth.",
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
        stderr: "Codex executable not found. Check Codex CLI installation or the configured binary path.",
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
    const output = session.outputChunks.join("");
    session.outputChunks.length = 0;
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
    session.pty.resize(Math.max(1, args.cols), Math.max(1, args.rows));
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
      session.outputChunks.push(args.output);
    }
    return { ok: true };
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

  return {
    createSession,
    createCliSession,
    writeSession,
    readSession,
    setSessionDeliveryMode,
    resizeSession,
    closeSession,
    bufferSessionOutput,
    cleanupAll,
  };
}
