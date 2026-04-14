import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { startSidecar, defaultEnginePaths, Sidecar } from "./sidecar.js";
import { registerScenarioIpc } from "./scenarios.js";

const PORT = 8765;
let sidecar: Sidecar | null = null;

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  process.env.SIDECAR_URL = sidecar?.baseUrl ?? `http://127.0.0.1:${PORT}`;
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const { engineDir, pythonExecutable } = defaultEnginePaths(repoRoot);
  sidecar = await startSidecar({ engineDir, pythonExecutable, port: PORT });
  registerScenarioIpc();
  ipcMain.handle("sidecar:url", () => sidecar?.baseUrl ?? "");
  await createWindow();
});

app.on("window-all-closed", async () => {
  await sidecar?.stop();
  sidecar = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await sidecar?.stop();
  sidecar = null;
});
