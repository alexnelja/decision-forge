import type { MCVariable } from "@decision-forge/core";
import { sampleDistribution } from "./mc-client-samplers";

export function percentileFromSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function variablePercentile(
  variable: MCVariable,
  percentile: number,
  n = 2000
): number {
  const samples = sampleDistribution(variable.distribution, n);
  if (samples.length === 0) return 0;
  samples.sort((a, b) => a - b);
  return percentileFromSorted(samples, percentile);
}
