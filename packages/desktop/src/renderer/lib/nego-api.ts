import type { NegoConfig, NegoAction, NegoSessionState } from "@decision-forge/core";

type NegoDebrief = {
  outcome: string;
  dealTerms: Record<string, number | string> | null;
  utilities: Record<string, { label: string; utility: number; batna: number }>;
  nashRef: { equalGainTarget: number } | null;
  rounds: number;
  transcript: Array<{
    at: string;
    action: NegoAction;
    speech?: string;
  }>;
};

export const negoApi = {
  start: (config: NegoConfig, mcSamples?: Record<string, number>) =>
    window.api.nego.start(config, mcSamples) as Promise<NegoSessionState>,
  list: () => window.api.nego.list(),
  state: (id: string) => window.api.nego.state(id) as Promise<NegoSessionState>,
  action: (id: string, action: NegoAction) =>
    window.api.nego.action(id, action) as Promise<NegoSessionState>,
  debrief: (id: string) => window.api.nego.debrief(id) as Promise<NegoDebrief>
};

export const keychainApi = {
  get: () => window.api.keychain.get(),
  set: (key: string) => window.api.keychain.set(key),
  clear: () => window.api.keychain.clear(),
  has: () => window.api.keychain.has()
};

export type { NegoDebrief };
