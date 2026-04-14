import { z } from "zod";

const finite = z.number().finite();
const positive = finite.refine((x) => x > 0, { message: "must be > 0" });

export const NormalDistributionSchema = z.object({
  kind: z.literal("normal"),
  mean: finite,
  sd: positive
});

export const LognormalDistributionSchema = z.object({
  kind: z.literal("lognormal"),
  meanlog: finite,
  sdlog: positive
});

export const TriangularDistributionSchema = z
  .object({
    kind: z.literal("triangular"),
    min: finite,
    mode: finite,
    max: finite
  })
  .refine((d) => d.min <= d.mode && d.mode <= d.max, {
    message: "triangular requires min <= mode <= max"
  });

export const UniformDistributionSchema = z
  .object({
    kind: z.literal("uniform"),
    min: finite,
    max: finite
  })
  .refine((d) => d.min < d.max, { message: "uniform requires min < max" });

export const PertDistributionSchema = z
  .object({
    kind: z.literal("pert"),
    min: finite,
    mode: finite,
    max: finite,
    lambda: positive.optional()
  })
  .refine((d) => d.min <= d.mode && d.mode <= d.max, {
    message: "pert requires min <= mode <= max"
  });

export const EmpiricalDistributionSchema = z.object({
  kind: z.literal("empirical"),
  samples: z.array(finite).min(1)
});

export const DistributionSchema = z.union([
  NormalDistributionSchema,
  LognormalDistributionSchema,
  TriangularDistributionSchema,
  UniformDistributionSchema,
  PertDistributionSchema,
  EmpiricalDistributionSchema
]);
export type Distribution = z.infer<typeof DistributionSchema>;

export const MCVariableSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, {
    message: "variable name must be a valid identifier"
  }),
  distribution: DistributionSchema,
  correlations: z.record(z.number().min(-1).max(1)).optional()
});
export type MCVariable = z.infer<typeof MCVariableSchema>;

export const MCConfigSchema = z.object({
  variables: z.array(MCVariableSchema).min(1),
  formula: z.string().min(1),
  iterations: z.number().int().min(100).max(1_000_000).default(10_000),
  seed: z.number().int().optional()
});
export type MCConfig = z.infer<typeof MCConfigSchema>;

export const MCStatsSchema = z.object({
  mean: z.number(),
  sd: z.number(),
  min: z.number(),
  max: z.number(),
  p5: z.number(),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number()
});
export type MCStats = z.infer<typeof MCStatsSchema>;

export const MCSensitivityRowSchema = z.object({
  name: z.string(),
  index: z.number(),
  normalised: z.number()
});
export type MCSensitivityRow = z.infer<typeof MCSensitivityRowSchema>;

export const MCRunResultSchema = z.object({
  samples: z.array(z.number()),
  stats: MCStatsSchema,
  iterations: z.number().int().positive(),
  sensitivity: z.array(MCSensitivityRowSchema).optional()
});
export type MCRunResult = z.infer<typeof MCRunResultSchema>;
