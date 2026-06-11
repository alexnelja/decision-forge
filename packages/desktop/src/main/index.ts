import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { startSidecar, defaultEnginePaths, Sidecar } from "./sidecar.js";
import { registerScenarioIpc } from "./scenarios.js";
import { registerForecastIpc } from "./forecast.js";
import { registerMcIpc } from "./mc.js";
import { registerNegoIpc, getNegoClient } from "./nego.js";
import { registerMapsIpc } from "./maps.js";
import {
  getGeminiKey,
  setGeminiKey,
  clearGeminiKey,
  hasGeminiKey
} from "./keychain.js";

const PORT = 8765;
let sidecar: Sidecar | null = null;

async function createWindow(): Promise<void> {
  // When the e2e suite sets DF_E2E_INACTIVE=1 we want the window to render
  // fully (so screenshots and CDP-driven interactions work) without ever
  // stealing OS focus from the developer's active application.
  // The standard pattern: create with show:false, then reveal via
  // showInactive() from the ready-to-show event.  Normal (non-test) launches
  // are byte-for-byte unchanged — the flag is absent so the old path runs.
  const e2eInactive = process.env.DF_E2E_INACTIVE === "1";

  if (e2eInactive && process.platform === "darwin") {
    // Suppress the dock bounce so the icon doesn't flash during test runs.
    app.dock?.hide();
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0a",
    // In inactive mode we control visibility manually via ready-to-show.
    show: !e2eInactive,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (e2eInactive) {
    // Show the window without activating it (no OS focus steal).
    win.once("ready-to-show", () => {
      win.showInactive();
    });
  }

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

  // Pass Gemini key into the sidecar env at spawn time so /nego/* can call the real API
  const geminiKey = await getGeminiKey();
  const extraEnv: Record<string, string> = {};
  if (geminiKey) extraEnv.GEMINI_API_KEY = geminiKey;

  sidecar = await startSidecar({ engineDir, pythonExecutable, port: PORT, env: extraEnv });
  registerScenarioIpc();
  registerMapsIpc();
  registerForecastIpc(sidecar.baseUrl);
  registerMcIpc(sidecar.baseUrl);
  registerNegoIpc(sidecar.baseUrl);

  // If we have a key already, push it to the sidecar so the driver is live even
  // when the env var didn't propagate cleanly.
  if (geminiKey) {
    try {
      await getNegoClient()!.configure(geminiKey);
    } catch (err) {
      console.warn("failed to configure sidecar with keychain key:", err);
    }
  }

  // Keychain IPC — setting also hot-configures the sidecar
  ipcMain.handle("keychain:get", () => getGeminiKey());
  ipcMain.handle("keychain:set", async (_e, key: string) => {
    await setGeminiKey(key);
    try {
      await getNegoClient()?.configure(key);
    } catch (err) {
      console.warn("failed to hot-configure sidecar:", err);
    }
  });
  ipcMain.handle("keychain:clear", async () => {
    await clearGeminiKey();
    try {
      await getNegoClient()?.configure(null);
    } catch {
      // ignore
    }
  });
  ipcMain.handle("keychain:has", () => hasGeminiKey());

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
