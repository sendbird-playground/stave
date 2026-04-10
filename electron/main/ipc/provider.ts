import { ipcMain, webContents } from "electron";
import {
  invokeHostService,
  onHostServiceEvent,
} from "../host-service-client";
import {
  ApprovalResponseArgsSchema,
  ClaudeRuntimeActionArgsSchema,
  CheckAvailabilityArgsSchema,
  ConnectedToolStatusArgsSchema,
  CleanupTaskArgsSchema,
  ProviderCommandCatalogArgsSchema,
  StreamReadArgsSchema,
  StreamTurnArgsSchema,
  SuggestCommitMessageArgsSchema,
  SuggestPRDescriptionArgsSchema,
  SuggestTaskNameArgsSchema,
  UserInputResponseArgsSchema,
} from "./schemas";

function formatSchemaIssuePath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "(root)";
  }
  return path.map((segment) => String(segment)).join(".");
}

function formatSchemaFailureMessage(args: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
  fallback: string;
}) {
  const summary = args.issues
    .slice(0, 3)
    .map((issue) => `${formatSchemaIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  return summary.length > 0
    ? `IPC schema rejected provider request. ${summary}`
    : args.fallback;
}

const providerOwnerWebContentsIdByStreamId = new Map<string, number>();
let providerEventBridgeRegistered = false;

function rememberProviderStreamOwner(args: {
  streamId?: string;
  ownerWebContentsId?: number | null;
}) {
  if (!args.streamId) {
    return;
  }
  if (args.ownerWebContentsId == null) {
    providerOwnerWebContentsIdByStreamId.delete(args.streamId);
    return;
  }
  providerOwnerWebContentsIdByStreamId.set(args.streamId, args.ownerWebContentsId);
}

function registerProviderEventBridge() {
  if (providerEventBridgeRegistered) {
    return;
  }
  providerEventBridgeRegistered = true;

  onHostServiceEvent("provider.stream-event", (payload) => {
    const ownerWebContentsId = providerOwnerWebContentsIdByStreamId.get(
      payload.streamId,
    );
    if (payload.done) {
      providerOwnerWebContentsIdByStreamId.delete(payload.streamId);
    }
    if (ownerWebContentsId == null) {
      return;
    }

    const owner = webContents.fromId(ownerWebContentsId);
    if (!owner || owner.isDestroyed()) {
      providerOwnerWebContentsIdByStreamId.delete(payload.streamId);
      return;
    }

    owner.send("provider:stream-event", payload);
  });
}

export function registerProviderHandlers() {
  registerProviderEventBridge();

  ipcMain.handle("provider:stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return [
        {
          type: "error",
          message: formatSchemaFailureMessage({
            issues: parsedArgs.error.issues,
            fallback: "IPC schema rejected provider request.",
          }),
          recoverable: false,
        },
        { type: "done" },
      ];
    }
    return invokeHostService("provider.stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:start-stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }
    return invokeHostService("provider.start-stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:start-push-turn", async (event, args: unknown) => {
    const parsedArgs = StreamTurnArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        streamId: "",
        turnId: null,
        message: formatSchemaFailureMessage({
          issues: parsedArgs.error.issues,
          fallback: "IPC schema rejected provider request.",
        }),
      };
    }

    const result = await invokeHostService("provider.start-push-turn", parsedArgs.data);
    if (result.ok) {
      rememberProviderStreamOwner({
        streamId: result.streamId,
        ownerWebContentsId: event.sender.id,
      });
    }
    return result;
  });

  ipcMain.handle("provider:read-stream-turn", async (_event, args: unknown) => {
    const parsedArgs = StreamReadArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        events: [],
        cursor: 0,
        done: true,
        message: "Invalid stream read request.",
      };
    }
    return invokeHostService("provider.read-stream-turn", parsedArgs.data);
  });

  ipcMain.handle("provider:abort-turn", (_event, args: unknown) => {
    const turnId = (args as { turnId?: unknown })?.turnId;
    if (typeof turnId !== "string" || turnId.trim().length === 0) {
      return { ok: false, message: "Invalid provider abort request." };
    }
    return invokeHostService("provider.abort-turn", { turnId });
  });

  ipcMain.handle("provider:cleanup-task", (_event, args: unknown) => {
    const parsedArgs = CleanupTaskArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid task cleanup request." };
    }
    return invokeHostService("provider.cleanup-task", {
      taskId: parsedArgs.data.taskId,
    });
  });

  ipcMain.handle("provider:respond-approval", (_event, args: unknown) => {
    const parsedArgs = ApprovalResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid approval response request." };
    }
    return invokeHostService("provider.respond-approval", parsedArgs.data);
  });

  ipcMain.handle("provider:respond-user-input", (_event, args: unknown) => {
    const parsedArgs = UserInputResponseArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, message: "Invalid user-input response request." };
    }
    return invokeHostService("provider.respond-user-input", parsedArgs.data);
  });

  ipcMain.handle("provider:check-availability", (_event, args: unknown) => {
    const parsedArgs = CheckAvailabilityArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        available: false,
        detail: "Invalid provider availability request.",
      };
    }
    return invokeHostService("provider.check-availability", parsedArgs.data);
  });

  ipcMain.handle("provider:get-command-catalog", (_event, args: unknown) => {
    const parsedArgs = ProviderCommandCatalogArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        supported: false,
        commands: [],
        detail: "Invalid provider command catalog request.",
      };
    }
    return invokeHostService("provider.get-command-catalog", {
      providerId: parsedArgs.data.providerId,
      cwd: parsedArgs.data.cwd,
      runtimeOptions: parsedArgs.data.runtimeOptions,
    });
  });

  ipcMain.handle("provider:get-connected-tool-status", (_event, args: unknown) => {
    const parsedArgs = ConnectedToolStatusArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        providerId: "stave" as const,
        detail: "Invalid connected-tool status request.",
        tools: [],
      };
    }
    return invokeHostService("provider.get-connected-tool-status", parsedArgs.data);
  });

  ipcMain.handle("provider:get-claude-context-usage", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude context usage request.",
      };
    }
    return invokeHostService("provider.get-claude-context-usage", parsedArgs.data);
  });

  ipcMain.handle("provider:reload-claude-plugins", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Claude plugin reload request.",
      };
    }
    return invokeHostService("provider.reload-claude-plugins", parsedArgs.data);
  });

  ipcMain.handle("provider:get-codex-mcp-status", (_event, args: unknown) => {
    const parsedArgs = ClaudeRuntimeActionArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        detail: "Invalid Codex MCP status request.",
        servers: [],
      };
    }
    return invokeHostService("provider.get-codex-mcp-status", parsedArgs.data);
  });

  ipcMain.handle("provider:suggest-task-name", (_event, args: unknown) => {
    const parsed = SuggestTaskNameArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-task-name", parsed.data);
  });

  ipcMain.handle("provider:suggest-commit-message", (_event, args: unknown) => {
    const parsed = SuggestCommitMessageArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-commit-message", parsed.data);
  });

  ipcMain.handle("provider:suggest-pr-description", (_event, args: unknown) => {
    const parsed = SuggestPRDescriptionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false };
    }
    return invokeHostService("provider.suggest-pr-description", parsed.data);
  });
}
