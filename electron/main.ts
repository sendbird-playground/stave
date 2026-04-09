import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { cleanupAllTerminalSessions, resetMainProcessState } from "./main/state";
import { startStaveMcpServer, stopStaveMcpServer } from "./main/stave-mcp-server";
import { createMainWindow } from "./main/window";
import { cleanupAllScriptProcesses } from "./main/workspace-scripts";
import { prewarmClaudeSdk } from "./providers/claude-sdk-runtime";

configurePersistenceUserDataPath(app);

let quittingAfterCleanup = false;
let beforeQuitCleanupPromise: Promise<void> | null = null;

function runBeforeQuitCleanup() {
  if (beforeQuitCleanupPromise) {
    return beforeQuitCleanupPromise;
  }

  beforeQuitCleanupPromise = (async () => {
    const results = await Promise.allSettled([
      stopStaveMcpServer(),
      cleanupAllTerminalSessions(),
      cleanupAllScriptProcesses(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[main] before-quit cleanup failed", result.reason);
      }
    }

    resetMainProcessState();
  })();

  return beforeQuitCleanupPromise;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  createMainWindow();
  prewarmClaudeSdk();
  void startStaveMcpServer().catch((error) => {
    console.error("[stave-mcp] failed to start local MCP server", error);
  });
});

app.on("before-quit", (event) => {
  if (quittingAfterCleanup) {
    return;
  }

  event.preventDefault();
  void runBeforeQuitCleanup().finally(() => {
    quittingAfterCleanup = true;
    app.quit();
  });
});
