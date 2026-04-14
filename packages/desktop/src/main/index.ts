import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { startSidecar, defaultEnginePaths, Sidecar } from "./sidecar.js";
import { registerScenarioIpc } from "./scenarios.js";
import { registerForecastIpc } from "./forecast.js";
import { registerMcIpc } from "./mc.js";
import { registerNegoIpc } from "./nego.js";
import {
  getAnthropicKey,
  setAnthropicKey,
  clearAnthropicKey,
  hasAnthropicKey
} from "./keychain.js";

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

  // Pass Anthropic key into the sidecar env at spawn time so /nego/* can call the real API
  const anthropicKey = await getAnthropicKey();
  const extraEnv: Record<string, string> = {};
  if (anthropicKey) extraEnv.ANTHROPIC_API_KEY = anthropicKey;

  sidecar = await startSidecar({ engineDir, pythonExecutable, port: PORT, env: extraEnv });
  registerScenarioIpc();
  registerForecastIpc(sidecar.baseUrl);
  registerMcIpc(sidecar.baseUrl);
  registerNegoIpc(sidecar.baseUrl);

  // Keychain IPC
  ipcMain.handle("keychain:get", () => getAnthropicKey());
  ipcMain.handle("keychain:set", (_e, key) => setAnthropicKey(key));
  ipcMain.handle("keychain:clear", () => clearAnthropicKey());
  ipcMain.handle("keychain:has", () => hasAnthropicKey());

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
