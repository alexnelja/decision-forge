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

type McApi = {
  run: (config: unknown) => Promise<{
    samples: number[];
    stats: Record<string, number>;
    iterations: number;
  }>;
};

type NegoApi = {
  start: (config: unknown) => Promise<unknown>;
  list: () => Promise<Array<Record<string, unknown>>>;
  state: (sessionId: string) => Promise<unknown>;
  action: (sessionId: string, action: unknown) => Promise<unknown>;
  debrief: (sessionId: string) => Promise<unknown>;
};

type KeychainApi = {
  get: () => Promise<string | null>;
  set: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  has: () => Promise<boolean>;
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

const mc: McApi = {
  run: (config) => ipcRenderer.invoke("mc:run", config)
};

const nego: NegoApi = {
  start: (config) => ipcRenderer.invoke("nego:start", config),
  list: () => ipcRenderer.invoke("nego:list"),
  state: (id) => ipcRenderer.invoke("nego:state", id),
  action: (id, action) => ipcRenderer.invoke("nego:action", id, action),
  debrief: (id) => ipcRenderer.invoke("nego:debrief", id)
};

const keychain: KeychainApi = {
  get: () => ipcRenderer.invoke("keychain:get"),
  set: (key) => ipcRenderer.invoke("keychain:set", key),
  clear: () => ipcRenderer.invoke("keychain:clear"),
  has: () => ipcRenderer.invoke("keychain:has")
};

contextBridge.exposeInMainWorld("api", {
  sidecarUrl: () => (process.env.SIDECAR_URL ?? "http://127.0.0.1:8765"),
  scenarios,
  forecast,
  mc,
  nego,
  keychain
});
