import { z } from "zod";
import { MCConfigSchema } from "./mc-config.js";
import { NegoConfigSchema } from "./nego-config.js";
import { ForecastLinkSchema } from "./forecast.js";

export const ScenarioRunSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  timestamp: z.string().datetime(),
  module: z.enum(["mc", "negotiation"]),
  config: z.unknown(),
  result: z.unknown(),
  notes: z.string()
});
export type ScenarioRun = z.infer<typeof ScenarioRunSchema>;

export const ScenarioSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  created: z.string().datetime(),
  tags: z.array(z.string()),
  description: z.string(),
  modules: z.object({
    monteCarlo: MCConfigSchema.optional(),
    negotiation: NegoConfigSchema.optional(),
    forecast: ForecastLinkSchema.optional()
  }),
  runs: z.array(ScenarioRunSchema)
});
export type Scenario = z.infer<typeof ScenarioSchema>;
