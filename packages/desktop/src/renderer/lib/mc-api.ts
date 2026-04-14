import type { MCConfig, MCRunResult } from "@decision-forge/core";

export const mcApi = {
  run: (config: MCConfig) => window.api.mc.run(config) as Promise<MCRunResult>
};
