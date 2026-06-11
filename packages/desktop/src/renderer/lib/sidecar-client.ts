import type {
  CalibrationReport,
  NegoConfig,
  NegoAction,
  NegoSessionState
} from "@decision-forge/core";

declare global {
  interface Window {
    api: {
      sidecarUrl: () => string;
      scenarios: {
        list: () => Promise<Array<{ id: string; name: string }>>;
        load: (id: string) => Promise<unknown>;
        save: (scenario: unknown) => Promise<void>;
      };
      forecast: {
        ask: (body: unknown) => Promise<{ ok: true }>;
        predict: (p: unknown) => Promise<{ ok: true }>;
        resolve: (r: unknown) => Promise<{ ok: true }>;
        list: () => Promise<Array<Record<string, unknown>>>;
        calibration: () => Promise<CalibrationReport>;
      };
      mc: {
        run: (config: unknown) => Promise<{
          samples: number[];
          stats: Record<string, number>;
          iterations: number;
        }>;
      };
      nego: {
        start: (config: NegoConfig) => Promise<NegoSessionState>;
        list: () => Promise<Array<Record<string, unknown>>>;
        state: (sessionId: string) => Promise<NegoSessionState>;
        action: (sessionId: string, action: NegoAction) => Promise<NegoSessionState>;
        debrief: (sessionId: string) => Promise<Record<string, unknown>>;
      };
      keychain: {
        get: () => Promise<string | null>;
        set: (key: string) => Promise<void>;
        clear: () => Promise<void>;
        has: () => Promise<boolean>;
      };
      maps: {
        list: () => Promise<Array<{ id: string; name: string }>>;
        load: (id: string) => Promise<unknown>;
        save: (map: unknown) => Promise<void>;
        delete: (id: string) => Promise<void>;
      };
    };
  }
}

export function sidecarUrl(): string {
  return typeof window !== "undefined" && window.api
    ? window.api.sidecarUrl()
    : "http://127.0.0.1:8765";
}

export async function getHealth(): Promise<{ status: string; version: string }> {
  const resp = await fetch(`${sidecarUrl()}/health`);
  if (!resp.ok) throw new Error(`sidecar unhealthy: ${resp.status}`);
  return resp.json();
}
