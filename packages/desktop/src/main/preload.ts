import { contextBridge, ipcRenderer } from "electron";

type ScenarioApi = {
  list: () => Promise<Array<{ id: string; name: string }>>;
  load: (id: string) => Promise<unknown>;
  save: (scenario: unknown) => Promise<void>;
};

const scenarios: ScenarioApi = {
  list: () => ipcRenderer.invoke("scenarios:list"),
  load: (id) => ipcRenderer.invoke("scenarios:load", id),
  save: (scenario) => ipcRenderer.invoke("scenarios:save", scenario)
};

contextBridge.exposeInMainWorld("api", {
  sidecarUrl: () => (process.env.SIDECAR_URL ?? "http://127.0.0.1:8765"),
  scenarios
});
