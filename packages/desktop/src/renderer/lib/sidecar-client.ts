declare global {
  interface Window {
    api: {
      sidecarUrl: () => string;
      scenarios: {
        list: () => Promise<Array<{ id: string; name: string }>>;
        load: (id: string) => Promise<unknown>;
        save: (scenario: unknown) => Promise<void>;
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
