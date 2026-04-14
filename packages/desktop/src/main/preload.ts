import { contextBridge, ipcRenderer } from "electron";

type ScenarioApi = {
  list: () => Promise<Array<{ id: string; name: string }>>;
  load: (id: string) => Promise<unknown>;
  save: (scenario: unknown) => Promise<void>;
};

type ForecastApi = {
  ask: (body: unknown) => Promise<{ ok: true }>;
  predict: (p: unknown) => Promise<{ ok: true }>;
  resolve: (r: unknown) => Promise<{ ok: true }>;
  list: () => Promise<Array<Record<string, unknown>>>;
  calibration: () => Promise<unknown>;
};

const scenarios: ScenarioApi = {
  list: () => ipcRenderer.invoke("scenarios:list"),
  load: (id) => ipcRenderer.invoke("scenarios:load", id),
  save: (scenario) => ipcRenderer.invoke("scenarios:save", scenario)
};

const forecast: ForecastApi = {
  ask: (body) => ipcRenderer.invoke("forecast:ask", body),
  predict: (p) => ipcRenderer.invoke("forecast:predict", p),
  resolve: (r) => ipcRenderer.invoke("forecast:resolve", r),
  list: () => ipcRenderer.invoke("forecast:list"),
  calibration: () => ipcRenderer.invoke("forecast:calibration")
};

contextBridge.exposeInMainWorld("api", {
  sidecarUrl: () => (process.env.SIDECAR_URL ?? "http://127.0.0.1:8765"),
  scenarios,
  forecast
});
