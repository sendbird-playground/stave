import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { resetMainProcessState } from "./main/state";
import { startStaveMcpServer, stopStaveMcpServer } from "./main/stave-mcp-server";
import { createMainWindow } from "./main/window";

configurePersistenceUserDataPath(app);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  createMainWindow();
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
