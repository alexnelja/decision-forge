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
      // FastAPI formats {"detail": "..."}; try to pull the human message out.
      let reason = body.slice(0, 400);
      try {
        const parsed = JSON.parse(body) as { detail?: string };
        if (parsed.detail) reason = parsed.detail;
      } catch {
        // keep text
      }
      throw new Error(reason);
    }
    return r.json() as Promise<T>;
  }

  start(config: NegoConfig, mcSamples?: Record<string, number>) {
    const body: { config: NegoConfig; mc_samples?: Record<string, number> } = {
      config
    };
    if (mcSamples && Object.keys(mcSamples).length > 0) {
      body.mc_samples = mcSamples;
    }
    return this.req<NegoSessionState>("/nego/start", {
      method: "POST",
      body: JSON.stringify(body)
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
  configure(apiKey: string | null) {
    return this.req<{ driver: string | null }>("/nego/configure", {
      method: "POST",
      body: JSON.stringify({ apiKey })
    });
  }
  nhealth() {
    return this.req<{ driver: string | null }>("/nego/health");
  }
}

let client: NegoClient | null = null;

export function getNegoClient(): NegoClient | null {
  return client;
}

export function registerNegoIpc(baseUrl: string): void {
  client = new NegoClient(baseUrl);
  ipcMain.handle("nego:start", (_e, config, mcSamples) =>
    client!.start(config, mcSamples)
  );
  ipcMain.handle("nego:list", () => client!.listSessions());
  ipcMain.handle("nego:state", (_e, id) => client!.state(id));
  ipcMain.handle("nego:action", (_e, id, action) => client!.action(id, action));
  ipcMain.handle("nego:debrief", (_e, id) => client!.debrief(id));
  ipcMain.handle("nego:health", () => client!.nhealth());
}
