// packages/desktop/src/renderer/lib/mc-summary.ts
import type { Distribution } from "@decision-forge/core";
import { sampleDistribution } from "./mc-client-samplers";
import { percentileFromSorted } from "./mc-percentile";

export interface McSummary { p10: number; p50: number; p90: number; mean: number; definedAt: string }

/** Range summary of a single input distribution (NOT a formula run). */
export function computeMcSummary(d: Distribution, n = 2000): McSummary {
  const samples = sampleDistribution(d, n).sort((a, b) => a - b);
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    p10: percentileFromSorted(samples, 10),
    p50: percentileFromSorted(samples, 50),
    p90: percentileFromSorted(samples, 90),
    mean,
    definedAt: new Date().toISOString()
  };
}
