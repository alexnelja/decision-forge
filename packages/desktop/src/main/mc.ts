import { ipcMain } from "electron";
import type { MCConfig, MCRunResult } from "@decision-forge/core";

export class McClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async run(config: MCConfig): Promise<MCRunResult> {
    const r = await this.fetchImpl(`${this.baseUrl}/mc/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`mc/run ${r.status}: ${body.slice(0, 200)}`);
    }
    return r.json() as Promise<MCRunResult>;
  }
}

let client: McClient | null = null;

export function registerMcIpc(baseUrl: string): void {
  client = new McClient(baseUrl);
  ipcMain.handle("mc:run", (_e, config) => client!.run(config));
}
