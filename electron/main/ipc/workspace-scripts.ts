// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – IPC Handlers
// ---------------------------------------------------------------------------

import { ipcMain } from "electron";
import {
  WorkspaceScriptsGetConfigArgsSchema,
  WorkspaceScriptsRunPhaseArgsSchema,
  WorkspaceScriptsStopPhaseArgsSchema,
  WorkspaceScriptsGetStatusArgsSchema,
} from "./schemas";
import {
  resolveScriptsForWorkspace,
  runFinitePhase,
  runLongRunningPhase,
  stopPhase,
  getAllPhaseStatuses,
} from "../workspace-scripts";
import { getPhaseCommands } from "../../../src/lib/workspace-scripts/config";
import type { ScriptPhase } from "../../../src/lib/workspace-scripts/types";

const TEARDOWN_TIMEOUT_MS = 30_000;

export function registerWorkspaceScriptsHandlers() {
  // ---- Get resolved config ------------------------------------------------
  ipcMain.handle("workspace-scripts:get-config", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceScriptsGetConfigArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message, config: null };
    }
    const { projectPath, workspacePath } = parsed.data;

    try {
      const config = await resolveScriptsForWorkspace({ projectPath, workspacePath });
      return { ok: true, config };
    } catch (err) {
      return { ok: false, error: String(err), config: null };
    }
  });

  // ---- Run a phase --------------------------------------------------------
  ipcMain.handle("workspace-scripts:run-phase", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceScriptsRunPhaseArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    const { workspaceId, phase, projectPath, workspacePath, workspaceName, branch } = parsed.data;

    try {
      const config = await resolveScriptsForWorkspace({ projectPath, workspacePath });
      const commands = getPhaseCommands(config, phase as ScriptPhase);

      if (commands.length === 0) {
        return { ok: true, message: "No commands configured for this phase." };
      }

      if (phase === "run") {
        return await runLongRunningPhase({
          workspaceId,
          projectPath,
          workspacePath,
          workspaceName,
          branch,
          commands,
        });
      }

      // setup or teardown — finite execution
      return await runFinitePhase({
        workspaceId,
        phase: phase as ScriptPhase,
        projectPath,
        workspacePath,
        workspaceName,
        branch,
        commands,
        timeoutMs: phase === "teardown" ? TEARDOWN_TIMEOUT_MS : undefined,
      });
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- Stop a phase -------------------------------------------------------
  ipcMain.handle("workspace-scripts:stop-phase", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceScriptsStopPhaseArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }

    try {
      await stopPhase(parsed.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- Get status ---------------------------------------------------------
  ipcMain.handle("workspace-scripts:get-status", async (_event, rawArgs: unknown) => {
    const parsed = WorkspaceScriptsGetStatusArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }

    return {
      ok: true,
      statuses: getAllPhaseStatuses({ workspaceId: parsed.data.workspaceId }),
    };
  });
}
