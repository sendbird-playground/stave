import { ipcMain } from "electron";
import {
  getStaveMcpServerStatus,
  rotateStaveMcpToken,
  updateStaveMcpServerConfig,
} from "../stave-mcp-server";
import { LocalMcpConfigUpdateArgsSchema } from "./schemas";

export function registerLocalMcpHandlers() {
  ipcMain.handle("local-mcp:get-status", async () => {
    try {
      const status = await getStaveMcpServerStatus();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to load local MCP status.",
      };
    }
  });

  ipcMain.handle("local-mcp:update-config", async (_event, args: unknown) => {
    const parsedArgs = LocalMcpConfigUpdateArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return { ok: false, status: null, message: "Invalid local MCP config." };
    }
    try {
      const status = await updateStaveMcpServerConfig(parsedArgs.data);
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to update local MCP config.",
      };
    }
  });

  ipcMain.handle("local-mcp:rotate-token", async () => {
    try {
      const status = await rotateStaveMcpToken();
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        status: null,
        message: error instanceof Error ? error.message : "Failed to rotate local MCP token.",
      };
    }
  });
}
