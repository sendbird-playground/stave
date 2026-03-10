import { app, Menu } from "electron";
import { registerHandlers } from "./main/ipc";
import { configurePersistenceUserDataPath } from "./main/runtime-profile";
import { resetMainProcessState } from "./main/state";
import { createMainWindow } from "./main/window";

configurePersistenceUserDataPath(app);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  createMainWindow();
});

app.on("before-quit", () => {
  resetMainProcessState();
});
