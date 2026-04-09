import { ipcMain, webContents } from "electron";
import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import {
  CliSessionCreateSessionArgsSchema,
  TerminalCreateSessionArgsSchema,
} from "./schemas";
import {
  buildClaudeEnv,
  resolveClaudeExecutablePath,
} from "../../providers/claude-sdk-runtime";
import {
  buildCodexEnv,
  resolveCodexExecutablePath,
} from "../../providers/codex-sdk-runtime";
import {
  deleteTerminalSession,
  getTerminalSession,
  getTerminalSessionIdForSlotKey,
  setTerminalSession,
} from "../state";
import type { TerminalSession } from "../types";
import { resolveCommandCwd, runCommand } from "../utils/command";
import type { StreamTurnArgs } from "../../providers/types";

/**
 * Buffers PTY output to prevent sending incomplete escape sequences.
 * Holds back partial CSI sequences (e.g. "\x1b", "\x1b[", "\x1b[0;3")
 * and OSC sequences (e.g. "\x1b]10;?" awaiting ST terminator) until
 * the next data chunk completes them.
 * Adapted from Coder Mux's createBufferedDataHandler pattern.
 */
function createBufferedDataHandler(onData: (data: string) => void) {
  let buffer = "";
  return (data: string) => {
    buffer += data;
    let sendUpTo = buffer.length;

    // --- Lone ESC at end ---
    if (buffer.endsWith("\x1b")) {
      sendUpTo = buffer.length - 1;
    }
    // --- Partial CSI: ESC [ ---
    else if (buffer.endsWith("\x1b[")) {
      sendUpTo = buffer.length - 2;
    }
    // --- Partial CSI parameter bytes: ESC [ 0-9 ; ---
    else {
      const csiTail = buffer.match(/\x1b\[[0-9;]*$/);
      if (csiTail) {
        sendUpTo = buffer.length - csiTail[0].length;
      }
    }

    // --- Partial OSC: ESC ] ... (awaiting BEL or ST terminator) ---
    // OSC sequences end with BEL (\x07) or ST (\x1b\\).
    // If we see an unclosed OSC at the tail, hold it back.
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

/**
 * Intercepts OSC 10 (foreground color query) and OSC 11 (background color query)
 * from TUI applications and responds with the app's theme colors.
 * This ensures TUI apps (vim, htop, etc.) receive correct theme-aware colors
 * instead of terminal defaults.
 *
 * OSC 10 ; ? ST  →  query foreground color
 * OSC 11 ; ? ST  →  query background color
 * Response format: OSC {10|11} ; rgb:{rr}/{gg}/{bb} ST
 */
function createOscColorInterceptor(args: {
  writeToPty: (data: string) => void;
  foreground: string;
  background: string;
}) {
  // Convert #RRGGBB to rgb:RR/GG/BB (X11 color format)
  function hexToX11(hex: string): string {
    const h = hex.replace("#", "");
    const r = h.substring(0, 2);
    const g = h.substring(2, 4);
    const b = h.substring(4, 6);
    return `rgb:${r}/${g}/${b}`;
  }

  const fgX11 = hexToX11(args.foreground);
  const bgX11 = hexToX11(args.background);

  return (data: string): string => {
    // Match OSC 10;? or OSC 11;? queries (terminated by BEL or ST)
    return data.replace(
      /\x1b\](10|11);?\?(?:\x07|\x1b\\)/g,
      (_match, code: string) => {
        const color = code === "10" ? fgX11 : bgX11;
        // Respond to PTY with the color value
        args.writeToPty(`\x1b]${code};${color}\x1b\\`);
        // Strip the query from the output stream (don't render it)
        return "";
      },
    );
  };
}

/** Default terminal theme colors (dark theme). */
const DEFAULT_TERMINAL_FOREGROUND = "#d4d4d4";
const DEFAULT_TERMINAL_BACKGROUND = "#1e1e1e";

function buildTerminalSessionSlotKey(args: {
  workspaceId: string;
  surface: "terminal" | "cli";
  tabId: string;
}) {
  return `${args.surface}:${args.workspaceId}:${args.tabId}`;
}

function bufferPendingPushOutput(session: TerminalSession) {
  if (session.pendingPush.length === 0) {
    return;
  }

  session.outputChunks.push(session.pendingPush.join(""));
  session.pendingPush.length = 0;
  session.pushScheduled = false;
}

function reuseExistingTerminalSession(args: {
  slotKey: string;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
}) {
  const sessionId = getTerminalSessionIdForSlotKey(args.slotKey);
  if (!sessionId) {
    return null;
  }

  const session = getTerminalSession(sessionId);
  if (!session || session.closing) {
    deleteTerminalSession(sessionId);
    return null;
  }

  const nextDeliveryMode = args.deliveryMode ?? session.deliveryMode;
  session.deliveryMode = nextDeliveryMode;
  if (nextDeliveryMode === "push") {
    session.ownerWebContentsId = args.ownerWebContentsId ?? null;
    session.flushPushOutput();
  } else {
    session.ownerWebContentsId = null;
    bufferPendingPushOutput(session);
  }

  return sessionId;
}

function createPtySession(args: {
  command: string;
  commandArgs?: string[];
  env: Record<string, string>;
  cwd: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
  themeColors?: { foreground?: string; background?: string };
  slotKey?: string;
}) {
  const cols = args.cols ?? 80;
  const rows = args.rows ?? 24;

  const ptyProcess = pty.spawn(args.command, args.commandArgs ?? [], {
    name: "xterm-256color",
    cols,
    rows,
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
  const session = {
    pty: ptyProcess,
    outputChunks: [] as string[],
    pendingPush: [] as string[],
    pushScheduled: false,
    deliveryMode: args.deliveryMode ?? "poll",
    ownerWebContentsId: args.ownerWebContentsId ?? null,
    closing: false,
    closed,
    close: () => {
      if (session.closing) {
        return;
      }
      session.closing = true;
      session.ownerWebContentsId = null;
      const closablePty = ptyProcess as pty.IPty & {
        destroy?: () => void;
      };
      if (typeof closablePty.destroy === "function") {
        closablePty.destroy();
        return;
      }
      ptyProcess.kill();
    },
    flushPushOutput: () => {
      flushPushOutput();
    },
    markClosed: resolveClosed,
  };
  setTerminalSession(sessionId, session, args.slotKey);

  function flushPushOutput() {
    session.pushScheduled = false;
    if (session.closing || session.pendingPush.length === 0) {
      return;
    }
    if (session.ownerWebContentsId === null) {
      return;
    }
    const owner = webContents.fromId(session.ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      // Fall back to poll buffer
      session.outputChunks.push(...session.pendingPush);
      session.pendingPush.length = 0;
      return;
    }
    const output = session.pendingPush.join("");
    session.pendingPush.length = 0;
    owner.send("terminal:session-output", { sessionId, output });
  }

  // OSC 10/11 color query interceptor: respond to TUI apps with theme colors
  const interceptOscColor = createOscColorInterceptor({
    writeToPty: (response) => {
      if (!session.closing) {
        ptyProcess.write(response);
      }
    },
    foreground: args.themeColors?.foreground ?? DEFAULT_TERMINAL_FOREGROUND,
    background: args.themeColors?.background ?? DEFAULT_TERMINAL_BACKGROUND,
  });

  ptyProcess.onData(createBufferedDataHandler((data) => {
    if (session.closing) {
      return;
    }
    // Intercept OSC color queries before delivering to renderer
    const filtered = interceptOscColor(data);
    if (!filtered) {
      return;
    }
    if (
      session.deliveryMode === "push" &&
      session.ownerWebContentsId !== null
    ) {
      session.pendingPush.push(filtered);
      if (!session.pushScheduled) {
        session.pushScheduled = true;
        setImmediate(flushPushOutput);
      }
      return;
    }
    session.outputChunks.push(filtered);
  }));
  ptyProcess.onExit(({ exitCode, signal }) => {
    // Notify the renderer about process termination before cleanup.
    if (session.ownerWebContentsId !== null) {
      const owner = webContents.fromId(session.ownerWebContentsId);
      if (owner && !owner.isDestroyed()) {
        owner.send("terminal:session-exit", {
          sessionId,
          exitCode,
          signal,
        });
      }
    }
    session.markClosed();
    deleteTerminalSession(sessionId);
  });

  return sessionId;
}

function createTerminalSession(args: {
  workspaceId: string;
  workspacePath: string;
  taskId: string | null;
  terminalTabId: string;
  shell?: string;
  cwd: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
}) {
  const shellExe = args.shell?.trim() || process.env.SHELL || "/bin/bash";
  const slotKey = buildTerminalSessionSlotKey({
    workspaceId: args.workspaceId,
    surface: "terminal",
    tabId: args.terminalTabId,
  });
  const existingSessionId = reuseExistingTerminalSession({
    slotKey,
    deliveryMode: args.deliveryMode,
    ownerWebContentsId:
      args.deliveryMode === "push" ? args.ownerWebContentsId ?? null : null,
  });
  if (existingSessionId) {
    return existingSessionId;
  }

  return createPtySession({
    command: shellExe,
    cwd: args.cwd || args.workspacePath,
    cols: args.cols,
    rows: args.rows,
    deliveryMode: args.deliveryMode,
    ownerWebContentsId: args.ownerWebContentsId,
    slotKey,
    env: {
      ...(process.env as Record<string, string>),
      STAVE_WORKSPACE_PATH: args.workspacePath,
      STAVE_TASK_ID: args.taskId ?? "",
    },
  });
}

function createCliSession(args: {
  workspaceId: string;
  workspacePath: string;
  cliSessionTabId: string;
  taskId: string | null;
  taskTitle: string | null;
  providerId: "claude-code" | "codex";
  cwd: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const slotKey = buildTerminalSessionSlotKey({
    workspaceId: args.workspaceId,
    surface: "cli",
    tabId: args.cliSessionTabId,
  });
  const existingSessionId = reuseExistingTerminalSession({
    slotKey,
    deliveryMode: args.deliveryMode,
    ownerWebContentsId:
      args.deliveryMode === "push" ? args.ownerWebContentsId ?? null : null,
  });
  if (existingSessionId) {
    return { ok: true, sessionId: existingSessionId };
  }

  if (args.providerId === "claude-code") {
    const executablePath = resolveClaudeExecutablePath({
      explicitPath: args.runtimeOptions?.claudeBinaryPath,
    });
    if (!executablePath) {
      return { ok: false, stderr: "Claude executable not found. Check Claude CLI installation and auth." };
    }
    const env = buildClaudeEnv({ executablePath });
    return {
      ok: true,
      sessionId: createPtySession({
        command: executablePath,
        cwd: args.cwd || args.workspacePath,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
        ownerWebContentsId: args.ownerWebContentsId,
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

  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!executablePath) {
    return { ok: false, stderr: "Codex executable not found. Check Codex CLI installation or the configured binary path." };
  }
  const env = buildCodexEnv({ executablePath });
  return {
    ok: true,
    sessionId: createPtySession({
      command: executablePath,
      cwd: args.cwd || args.workspacePath,
      cols: args.cols,
      rows: args.rows,
      deliveryMode: args.deliveryMode,
      ownerWebContentsId: args.ownerWebContentsId,
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

export function registerTerminalHandlers() {
  ipcMain.handle("terminal:run-command", async (_event, args: { command: string; cwd?: string }) => {
    return runCommand({ command: args.command, cwd: args.cwd });
  });

  ipcMain.handle("terminal:create-session", (event, args) => {
    const parsed = TerminalCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: parsed.error.flatten().formErrors.join("\n") };
    }
    const request = parsed.data;
    const sessionId = createTerminalSession({
      workspaceId: request.workspaceId,
      workspacePath: request.workspacePath,
      taskId: request.taskId,
      terminalTabId: request.terminalTabId,
      cwd: request.cwd,
      shell: request.shell,
      cols: request.cols,
      rows: request.rows,
      deliveryMode: request.deliveryMode,
      ownerWebContentsId:
        request.deliveryMode === "push" ? event.sender.id : null,
    });
    return { ok: true, sessionId };
  });

  ipcMain.handle("terminal:create-cli-session", (event, args) => {
    const parsed = CliSessionCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: parsed.error.flatten().formErrors.join("\n") };
    }
    const request = parsed.data;
    return createCliSession({
      workspaceId: request.workspaceId,
      workspacePath: request.workspacePath,
      cliSessionTabId: request.cliSessionTabId,
      taskId: request.taskId,
      taskTitle: request.taskTitle,
      providerId: request.providerId,
      cwd: request.cwd,
      cols: request.cols,
      rows: request.rows,
      deliveryMode: request.deliveryMode,
      runtimeOptions: request.runtimeOptions,
      ownerWebContentsId:
        request.deliveryMode === "push" ? event.sender.id : null,
    });
  });

  ipcMain.handle("terminal:write-session", (_event, args: { sessionId: string; input: string }) => {
    const session = getTerminalSession(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.pty.write(args.input);
    return { ok: true };
  });

  ipcMain.handle("terminal:read-session", (_event, args: { sessionId: string }) => {
    const session = getTerminalSession(args.sessionId);
    if (!session) {
      return { ok: false, output: "", stderr: "Terminal session not found." };
    }
    bufferPendingPushOutput(session);
    const output = session.outputChunks.join("");
    session.outputChunks.length = 0;
    return { ok: true, output, stderr: "" };
  });

  ipcMain.handle("terminal:set-session-delivery-mode", (_event, args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }) => {
    const session = getTerminalSession(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.deliveryMode = args.deliveryMode;
    return { ok: true, stderr: "" };
  });

  ipcMain.handle("terminal:resize-session", (_event, args: { sessionId: string; cols: number; rows: number }) => {
    const session = getTerminalSession(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.pty.resize(Math.max(1, args.cols), Math.max(1, args.rows));
    return { ok: true };
  });

  ipcMain.handle("terminal:close-session", (_event, args: { sessionId: string }) => {
    const session = getTerminalSession(args.sessionId);
    if (!session) {
      return { ok: false, stderr: "Terminal session not found." };
    }
    session.close();
    deleteTerminalSession(args.sessionId);
    return { ok: true, stderr: "" };
  });
}
