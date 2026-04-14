import { ipcMain } from "electron";
import type {
  Question, Prediction, Resolution, CalibrationReport
} from "@decision-forge/core";

export class ForecastClient {
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
      throw new Error(`forecast ${path} ${r.status}: ${body.slice(0, 200)}`);
    }
    return r.json() as Promise<T>;
  }

  ask(body: { question: Question; prediction: Prediction }) {
    return this.req<{ ok: true }>("/forecast/question", {
      method: "POST", body: JSON.stringify(body)
    });
  }
  predict(p: Prediction) {
    return this.req<{ ok: true }>("/forecast/predict", {
      method: "POST", body: JSON.stringify(p)
    });
  }
  resolve(r: Resolution) {
    return this.req<{ ok: true }>("/forecast/resolve", {
      method: "POST", body: JSON.stringify(r)
    });
  }
  list() {
    return this.req<Array<Record<string, unknown>>>("/forecast/questions");
  }
  calibration() {
    return this.req<CalibrationReport>("/forecast/calibration");
  }
}

let client: ForecastClient | null = null;

export function registerForecastIpc(baseUrl: string): void {
  client = new ForecastClient(baseUrl);
  ipcMain.handle("forecast:ask", (_e, body) => client!.ask(body));
  ipcMain.handle("forecast:predict", (_e, p) => client!.predict(p));
  ipcMain.handle("forecast:resolve", (_e, r) => client!.resolve(r));
  ipcMain.handle("forecast:list", () => client!.list());
  ipcMain.handle("forecast:calibration", () => client!.calibration());
}
