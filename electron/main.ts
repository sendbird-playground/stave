import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { resetMainProcessState } from "./main/state";
import { startStaveMcpServer, stopStaveMcpServer } from "./main/stave-mcp-server";
import { createMainWindow } from "./main/window";
import { prewarmClaudeSdk } from "./providers/claude-sdk-runtime";

configurePersistenceUserDataPath(app);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  createMainWindow();
  prewarmClaudeSdk();
  void startStaveMcpServer().catch((error) => {
    console.error("[stave-mcp] failed to start local MCP server", error);
  });
});

app.on("before-quit", () => {
  void stopStaveMcpServer().catch((error) => {
    console.error("[stave-mcp] failed to stop local MCP server", error);
  });
  resetMainProcessState();
});
