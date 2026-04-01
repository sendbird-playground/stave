import { ipcMain } from "electron";
import {
  SyncOriginMainArgsSchema,
  ToolingStatusArgsSchema,
} from "./schemas";
import {
  getToolingStatusSnapshot,
  inspectWorkspaceSyncStatus,
  syncWorkspaceWithOriginMain,
} from "../utils/tooling-status";

export function registerToolingHandlers() {
  ipcMain.handle("tooling:get-status", async (_event, args: unknown) => {
    const parsed = ToolingStatusArgsSchema.safeParse(args);
    if (!parsed.success) {
      return getToolingStatusSnapshot();
    }
    return getToolingStatusSnapshot(parsed.data);
  });

  ipcMain.handle("tooling:sync-origin-main", async (_event, args: unknown) => {
    const parsed = SyncOriginMainArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        summary: "Invalid sync request.",
        detail: "The request did not match the expected workspace sync shape.",
        workspace: await inspectWorkspaceSyncStatus(),
      };
    }
    return syncWorkspaceWithOriginMain(parsed.data);
  });
}
