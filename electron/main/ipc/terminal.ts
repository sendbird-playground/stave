import { ipcMain, webContents } from "electron";
import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import { TerminalCreateSessionArgsSchema } from "./schemas";
import { deleteTerminalSession, getTerminalSession, setTerminalSession } from "../state";
import { resolveCommandCwd, runCommand } from "../utils/command";

function createTerminalSession(args: {
  workspacePath: string;
  taskId: string | null;
  shell?: string;
  cwd: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
}) {
  const shellExe = args.shell?.trim() || process.env.SHELL || "/bin/bash";
  const cols = args.cols ?? 80;
  const rows = args.rows ?? 24;

  const ptyProcess = pty.spawn(shellExe, [], {
    name: "xterm-color",
    cols,
    rows,
    cwd: resolveCommandCwd({ cwd: args.cwd || args.workspacePath }),
    env: {
      ...(process.env as Record<string, string>),
      STAVE_WORKSPACE_PATH: args.workspacePath,
      STAVE_TASK_ID: args.taskId ?? "",
    },
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
    output: "",
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
    markClosed: resolveClosed,
  };
  setTerminalSession(sessionId, session);

  ptyProcess.onData((data) => {
    if (session.closing) {
      return;
    }
    if (
      session.deliveryMode === "push" &&
      session.ownerWebContentsId !== null
    ) {
      const owner = webContents.fromId(session.ownerWebContentsId);
      if (owner && !owner.isDestroyed()) {
        owner.send("terminal:session-output", { sessionId, output: data });
        return;
      }
    }
    session.output += data;
  });
  ptyProcess.onExit(() => {
    session.markClosed();
    deleteTerminalSession(sessionId);
  });

  return sessionId;
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
      workspacePath: request.workspacePath,
      taskId: request.taskId,
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
    const output = session.output;
    session.output = "";
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
