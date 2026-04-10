// ---------------------------------------------------------------------------
// Workspace Scripts – IPC Handlers
// ---------------------------------------------------------------------------

import { ipcMain, webContents } from "electron";
import { getScriptEntry } from "../../../src/lib/workspace-scripts/config";
import type { ScriptKind } from "../../../src/lib/workspace-scripts/types";
import { WORKSPACE_SCRIPTS_IPC } from "../../../src/lib/workspace-scripts/constants";
import {
  WorkspaceScriptsGetConfigArgsSchema,
  WorkspaceScriptsGetStatusArgsSchema,
  WorkspaceScriptsRunEntryArgsSchema,
  WorkspaceScriptsRunHookArgsSchema,
  WorkspaceScriptsStopAllArgsSchema,
  WorkspaceScriptsStopEntryArgsSchema,
} from "./schemas";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";
import { resolveScriptsForWorkspace } from "../workspace-scripts";

let workspaceScriptEventBridgeRegistered = false;

function broadcastWorkspaceScriptEvent(payload: unknown) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== "window") {
      continue;
    }
    wc.send(WORKSPACE_SCRIPTS_IPC.EVENT, payload);
  }
}

function registerWorkspaceScriptEventBridge() {
  if (workspaceScriptEventBridgeRegistered) {
    return;
  }
  workspaceScriptEventBridgeRegistered = true;
  onHostServiceEvent("workspace-scripts.event", (payload) => {
    broadcastWorkspaceScriptEvent(payload);
  });
}

export function registerWorkspaceScriptHandlers() {
  registerWorkspaceScriptEventBridge();

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.GET_CONFIG,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsGetConfigArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message, config: null };
      }
      try {
        const config = await resolveScriptsForWorkspace(parsed.data);
        return { ok: true, config };
      } catch (error) {
        return { ok: false, error: String(error), config: null };
      }
    },
  );

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.GET_STATUS,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsGetStatusArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message, statuses: [] };
      }
      try {
        const result = await invokeHostService("workspace-scripts.get-status", {
          workspaceId: parsed.data.workspaceId,
        });
        return { ok: true, statuses: result.statuses };
      } catch (error) {
        return { ok: false, error: String(error), statuses: [] };
      }
    },
  );

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.RUN_ENTRY,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsRunEntryArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message };
      }

      try {
        const config = await resolveScriptsForWorkspace({
          projectPath: parsed.data.projectPath,
          workspacePath: parsed.data.workspacePath,
        });
        const scriptEntry = getScriptEntry(config, {
          scriptId: parsed.data.scriptId,
          kind: parsed.data.scriptKind as ScriptKind,
        });
        if (!scriptEntry) {
          return { ok: false, error: "Script entry not found." };
        }

        return await invokeHostService("workspace-scripts.run-entry", {
          workspaceId: parsed.data.workspaceId,
          scriptEntry,
          projectPath: parsed.data.projectPath,
          workspacePath: parsed.data.workspacePath,
          workspaceName: parsed.data.workspaceName,
          branch: parsed.data.branch,
        });
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.STOP_ENTRY,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsStopEntryArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message };
      }
      try {
        await invokeHostService("workspace-scripts.stop-entry", parsed.data);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.RUN_HOOK,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsRunHookArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message, summary: null };
      }

      try {
        const config = await resolveScriptsForWorkspace({
          projectPath: parsed.data.projectPath,
          workspacePath: parsed.data.workspacePath,
        });
        if (!config) {
          return {
            ok: true,
            summary: {
              trigger: parsed.data.trigger,
              totalEntries: 0,
              executedEntries: 0,
              failures: [],
            },
          };
        }

        const result = await invokeHostService("workspace-scripts.run-hook", {
          workspaceId: parsed.data.workspaceId,
          trigger: parsed.data.trigger,
          config,
          projectPath: parsed.data.projectPath,
          workspacePath: parsed.data.workspacePath,
          workspaceName: parsed.data.workspaceName,
          branch: parsed.data.branch,
          hookContext: {
            taskId: parsed.data.taskId,
            taskTitle: parsed.data.taskTitle,
            turnId: parsed.data.turnId,
          },
        });
        return { ok: result.summary.failures.length === 0, summary: result.summary };
      } catch (error) {
        return { ok: false, error: String(error), summary: null };
      }
    },
  );

  ipcMain.handle(
    WORKSPACE_SCRIPTS_IPC.STOP_ALL,
    async (_event, rawArgs: unknown) => {
      const parsed = WorkspaceScriptsStopAllArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.message };
      }
      try {
        await invokeHostService("workspace-scripts.stop-all", parsed.data);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
  );
}
