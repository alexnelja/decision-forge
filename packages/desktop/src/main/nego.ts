import { ipcMain } from "electron";
import type { NegoConfig, NegoAction, NegoSessionState } from "@decision-forge/core";

export class NegoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`nego ${path} ${r.status}: ${body.slice(0, 200)}`);
    }
    return r.json() as Promise<T>;
  }

  start(config: NegoConfig) {
    return this.req<NegoSessionState>("/nego/start", {
      method: "POST",
      body: JSON.stringify({ config })
    });
  }
  listSessions() {
    return this.req<Array<Record<string, unknown>>>("/nego/sessions");
  }
  state(sessionId: string) {
    return this.req<NegoSessionState>(`/nego/state/${sessionId}`);
  }
  action(sessionId: string, action: NegoAction) {
    return this.req<NegoSessionState>(`/nego/action/${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
  }
  debrief(sessionId: string) {
    return this.req<Record<string, unknown>>(`/nego/debrief/${sessionId}`);
  }
}

let client: NegoClient | null = null;

export function registerNegoIpc(baseUrl: string): void {
  client = new NegoClient(baseUrl);
  ipcMain.handle("nego:start", (_e, config) => client!.start(config));
  ipcMain.handle("nego:list", () => client!.listSessions());
  ipcMain.handle("nego:state", (_e, id) => client!.state(id));
  ipcMain.handle("nego:action", (_e, id, action) => client!.action(id, action));
  ipcMain.handle("nego:debrief", (_e, id) => client!.debrief(id));
}
