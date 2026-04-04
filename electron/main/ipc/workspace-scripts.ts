// ---------------------------------------------------------------------------
// Workspace Automations – IPC Handlers
// ---------------------------------------------------------------------------

import { ipcMain } from "electron";
import { getAutomationEntry } from "../../../src/lib/workspace-scripts/config";
import type { AutomationKind } from "../../../src/lib/workspace-scripts/types";
import {
  WorkspaceAutomationsGetConfigArgsSchema,
  WorkspaceAutomationsGetStatusArgsSchema,
  WorkspaceAutomationsRunEntryArgsSchema,
  WorkspaceAutomationsRunHookArgsSchema,
  WorkspaceAutomationsStopAllArgsSchema,
  WorkspaceAutomationsStopEntryArgsSchema,
} from "./schemas";
import {
  getAutomationStatuses,
  resolveAutomationsForWorkspace,
  runAutomationEntry,
  runAutomationHook,
  stopAllWorkspaceAutomationProcesses,
  stopAutomationEntry,
} from "../workspace-scripts";

export function registerWorkspaceAutomationHandlers() {
  ipcMain.handle("workspace-automations:get-config", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsGetConfigArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message, config: null };
    }
    try {
      const config = await resolveAutomationsForWorkspace(parsed.data);
      return { ok: true, config };
    } catch (error) {
      return { ok: false, error: String(error), config: null };
    }
  });

  ipcMain.handle("workspace-automations:get-status", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsGetStatusArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message, statuses: [] };
    }
    return {
      ok: true,
      statuses: getAutomationStatuses({ workspaceId: parsed.data.workspaceId }),
    };
  });

  ipcMain.handle("workspace-automations:run-entry", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsRunEntryArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }

    try {
      const config = await resolveAutomationsForWorkspace({
        projectPath: parsed.data.projectPath,
        workspacePath: parsed.data.workspacePath,
      });
      const automation = getAutomationEntry(config, {
        automationId: parsed.data.automationId,
        kind: parsed.data.automationKind as AutomationKind,
      });
      if (!automation) {
        return { ok: false, error: "Automation entry not found." };
      }
      return await runAutomationEntry({
        workspaceId: parsed.data.workspaceId,
        automation,
        projectPath: parsed.data.projectPath,
        workspacePath: parsed.data.workspacePath,
        workspaceName: parsed.data.workspaceName,
        branch: parsed.data.branch,
      });
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("workspace-automations:stop-entry", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsStopEntryArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    try {
      await stopAutomationEntry(parsed.data);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("workspace-automations:run-hook", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsRunHookArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message, summary: null };
    }
    try {
      const config = await resolveAutomationsForWorkspace({
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
      const summary = await runAutomationHook({
        workspaceId: parsed.data.workspaceId,
        trigger: parsed.data.trigger,
        config,
        projectPath: parsed.data.projectPath,
        workspacePath: parsed.data.workspacePath,
        workspaceName: parsed.data.workspaceName,
        branch: parsed.data.branch,
      });
      return { ok: summary.failures.length === 0, summary };
    } catch (error) {
      return { ok: false, error: String(error), summary: null };
    }
  });

  ipcMain.handle("workspace-automations:stop-all", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceAutomationsStopAllArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    try {
      await stopAllWorkspaceAutomationProcesses(parsed.data);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}
