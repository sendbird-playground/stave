import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { startHostService, stopHostService } from "./main/host-service-client";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { resetMainProcessState } from "./main/state";
import {
  startStaveMcpServer,
  stopStaveMcpServer,
} from "./main/stave-mcp-server";
import { createMainWindow } from "./main/window";

const persistenceRuntime = configurePersistenceUserDataPath(app);
process.env.STAVE_USER_DATA_PATH = persistenceRuntime.userDataPath;

if (!app.isPackaged) {
  process.env.STAVE_DEV = "1";
}

let quittingAfterCleanup = false;
let beforeQuitCleanupPromise: Promise<void> | null = null;

function runBeforeQuitCleanup() {
  if (beforeQuitCleanupPromise) {
    return beforeQuitCleanupPromise;
  }

  beforeQuitCleanupPromise = (async () => {
    const results = await Promise.allSettled([
      stopStaveMcpServer(),
      stopHostService(),
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
  void startHostService().catch((error) => {
    console.error("[host-service] failed to start", error);
  });
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
