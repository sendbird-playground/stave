import { BrowserWindow } from "electron";
import path from "node:path";

export function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: false,
    titleBarStyle: "hidden",
    title: "Stave",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.webContents.on("before-input-event", (event, input) => {
    const isF12 = input.key === "F12" && input.type === "keyDown";
    const isInspectorChord = input.type === "keyDown"
      && input.key.toLowerCase() === "i"
      && input.shift
      && (input.control || input.meta);
    if (!isF12 && !isInspectorChord) {
      return;
    }
    event.preventDefault();
    window.webContents.toggleDevTools();
  });
}
