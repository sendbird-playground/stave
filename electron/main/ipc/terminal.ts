import { ipcMain, webContents } from "electron";
import {
  CliSessionCreateSessionArgsSchema,
  TerminalAttachSessionArgsSchema,
  TerminalCreateSessionArgsSchema,
  TerminalDetachSessionArgsSchema,
  TerminalGetSlotStateArgsSchema,
} from "./schemas";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";
import { runCommand } from "../utils/command";

const terminalOwnerWebContentsIdBySessionId = new Map<string, number>();
let terminalEventBridgeRegistered = false;

function registerTerminalEventBridge() {
  if (terminalEventBridgeRegistered) {
    return;
  }
  terminalEventBridgeRegistered = true;

  onHostServiceEvent("terminal.output", (payload) => {
    const ownerWebContentsId = terminalOwnerWebContentsIdBySessionId.get(
      payload.sessionId,
    );
    if (ownerWebContentsId == null) {
      return;
    }

    const owner = webContents.fromId(ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      terminalOwnerWebContentsIdBySessionId.delete(payload.sessionId);
      void invokeHostService("terminal.buffer-session-output", {
        sessionId: payload.sessionId,
        output: payload.output,
      })
        .then(() =>
          invokeHostService("terminal.set-session-delivery-mode", {
            sessionId: payload.sessionId,
            deliveryMode: "poll",
          }),
        )
        .catch((error) => {
          console.error(
            "[terminal] failed to fall back to poll delivery",
            error,
          );
        });
      return;
    }

    owner.send("terminal:session-output", payload);
  });

  onHostServiceEvent("terminal.exit", (payload) => {
    const ownerWebContentsId = terminalOwnerWebContentsIdBySessionId.get(
      payload.sessionId,
    );
    terminalOwnerWebContentsIdBySessionId.delete(payload.sessionId);
    if (ownerWebContentsId == null) {
      return;
    }

    const owner = webContents.fromId(ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      return;
    }
    owner.send("terminal:session-exit", payload);
  });
}

function syncTerminalSessionOwner(args: {
  sessionId?: string;
  deliveryMode?: "poll" | "push";
  ownerWebContentsId?: number | null;
}) {
  if (!args.sessionId) {
    return;
  }
  if (args.deliveryMode === "push" && args.ownerWebContentsId != null) {
    terminalOwnerWebContentsIdBySessionId.set(
      args.sessionId,
      args.ownerWebContentsId,
    );
    return;
  }
  terminalOwnerWebContentsIdBySessionId.delete(args.sessionId);
}

export function registerTerminalHandlers() {
  registerTerminalEventBridge();

  ipcMain.handle(
    "terminal:run-command",
    async (_event, args: { command: string; cwd?: string }) =>
      runCommand({ command: args.command, cwd: args.cwd }),
  );

  ipcMain.handle("terminal:create-session", async (event, args) => {
    const parsed = TerminalCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.create-session",
      parsed.data,
    );
    syncTerminalSessionOwner({
      sessionId: result.sessionId,
      deliveryMode: parsed.data.deliveryMode,
      ownerWebContentsId:
        parsed.data.deliveryMode === "push" ? event.sender.id : null,
    });
    return result;
  });

  ipcMain.handle("terminal:create-cli-session", async (event, args) => {
    const parsed = CliSessionCreateSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.create-cli-session",
      parsed.data,
    );
    syncTerminalSessionOwner({
      sessionId: result.sessionId,
      deliveryMode: parsed.data.deliveryMode,
      ownerWebContentsId:
        parsed.data.deliveryMode === "push" ? event.sender.id : null,
    });
    return result;
  });

  ipcMain.handle(
    "terminal:write-session",
    (_event, args: { sessionId: string; input: string }) =>
      invokeHostService("terminal.write-session", args),
  );

  ipcMain.handle(
    "terminal:read-session",
    (_event, args: { sessionId: string }) =>
      invokeHostService("terminal.read-session", args),
  );

  ipcMain.handle(
    "terminal:set-session-delivery-mode",
    async (
      event,
      args: { sessionId: string; deliveryMode: "poll" | "push" },
    ) => {
      const result = await invokeHostService(
        "terminal.set-session-delivery-mode",
        args,
      );
      if (result.ok) {
        syncTerminalSessionOwner({
          sessionId: args.sessionId,
          deliveryMode: args.deliveryMode,
          ownerWebContentsId:
            args.deliveryMode === "push" ? event.sender.id : null,
        });
      }
      return result;
    },
  );

  ipcMain.handle(
    "terminal:resize-session",
    (_event, args: { sessionId: string; cols: number; rows: number }) =>
      invokeHostService("terminal.resize-session", args),
  );

  ipcMain.handle(
    "terminal:close-session",
    async (_event, args: { sessionId: string }) => {
      terminalOwnerWebContentsIdBySessionId.delete(args.sessionId);
      return invokeHostService("terminal.close-session", args);
    },
  );

  ipcMain.handle("terminal:attach-session", async (event, args) => {
    const parsed = TerminalAttachSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.attach-session",
      parsed.data,
    );
    if (result.ok) {
      syncTerminalSessionOwner({
        sessionId: parsed.data.sessionId,
        deliveryMode: parsed.data.deliveryMode,
        ownerWebContentsId:
          parsed.data.deliveryMode === "push" ? event.sender.id : null,
      });
    }
    return result;
  });

  ipcMain.handle("terminal:detach-session", async (_event, args) => {
    const parsed = TerminalDetachSessionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    const result = await invokeHostService(
      "terminal.detach-session",
      parsed.data,
    );
    if (result.ok) {
      terminalOwnerWebContentsIdBySessionId.delete(parsed.data.sessionId);
    }
    return result;
  });

  ipcMain.handle("terminal:get-slot-state", async (_event, args) => {
    const parsed = TerminalGetSlotStateArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        state: "idle" as const,
      };
    }

    return invokeHostService("terminal.get-slot-state", parsed.data);
  });

  ipcMain.handle(
    "terminal:close-sessions-by-slot-prefix",
    async (_event, args: { prefix: string }) => {
      if (!args.prefix || args.prefix.length > 600) {
        return { ok: true, closedCount: 0 };
      }
      return invokeHostService("terminal.close-sessions-by-slot-prefix", args);
    },
  );
}
