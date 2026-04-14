/**
 * Client-side quick samplers for live variable previews. Pure JS, ~1000 samples
 * is plenty for a smooth mini-histogram. We do NOT use these for the real run —
 * that still goes to the Python sidecar.
 */
import type { Distribution } from "@decision-forge/core";

// Box-Muller for normal samples
export function sampleNormal(n: number, mean: number, sd: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(Math.random(), 1e-12);
    const u2 = Math.random();
    const mag = sd * Math.sqrt(-2 * Math.log(u1));
    out.push(mag * Math.cos(2 * Math.PI * u2) + mean);
    if (out.length < n) out.push(mag * Math.sin(2 * Math.PI * u2) + mean);
  }
  return out;
}

export function sampleLognormal(n: number, meanlog: number, sdlog: number): number[] {
  return sampleNormal(n, meanlog, sdlog).map(Math.exp);
}

export function sampleUniform(n: number, min: number, max: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = min + Math.random() * (max - min);
  return out;
}

export function sampleTriangular(n: number, min: number, mode: number, max: number): number[] {
  const out = new Array<number>(n);
  const f = (mode - min) / (max - min);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    out[i] = u < f
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
  return out;
}

// Beta-PERT via two gammas (Marsaglia-Tsang lite; for preview only)
function sampleBeta(n: number, alpha: number, beta: number): number[] {
  // Cheap: draw two gammas via summing exponentials. For preview quality only.
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let gA = 0, gB = 0;
    const ka = Math.max(1, Math.round(alpha));
    const kb = Math.max(1, Math.round(beta));
    for (let k = 0; k < ka; k++) gA -= Math.log(Math.random() || 1e-12);
    for (let k = 0; k < kb; k++) gB -= Math.log(Math.random() || 1e-12);
    out[i] = gA / (gA + gB);
  }
  return out;
}

export function samplePert(n: number, min: number, mode: number, max: number, lam = 4): number[] {
  if (max <= min) return new Array(n).fill(min);
  const span = max - min;
  const alpha = (lam * (mode - min)) / span + 1;
  const beta = lam + 2 - alpha;
  const u = sampleBeta(n, alpha, beta);
  return u.map((v) => min + v * span);
}

export function sampleFromEmpirical(n: number, samples: number[]): number[] {
  if (samples.length === 0) return [];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = samples[Math.floor(Math.random() * samples.length)];
  }
  return out;
}

export function sampleDistribution(dist: Distribution, n = 1000): number[] {
  switch (dist.kind) {
    case "normal":
      return sampleNormal(n, dist.mean, dist.sd);
    case "lognormal":
      return sampleLognormal(n, dist.meanlog, dist.sdlog);
    case "uniform":
      return sampleUniform(n, dist.min, dist.max);
    case "triangular":
      return sampleTriangular(n, dist.min, dist.mode, dist.max);
    case "pert":
      return samplePert(n, dist.min, dist.mode, dist.max, dist.lambda ?? 4);
    case "empirical":
      return sampleFromEmpirical(n, dist.samples);
    default:
      return [];
  }
}

export function histogramPath(
  samples: number[],
  width: number,
  height: number,
  bins = 20
): string {
  if (samples.length === 0) return "";
  const sorted = [...samples].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (hi === lo) {
    return `M 0 ${height} L ${width} ${height}`;
  }
  const binWidth = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of samples) {
    const idx = Math.min(bins - 1, Math.floor((v - lo) / binWidth));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);
  const xStep = width / bins;
  let path = `M 0 ${height}`;
  counts.forEach((c, i) => {
    const x = i * xStep;
    const h = (c / maxCount) * (height - 2);
    path += ` L ${x} ${height - h} L ${x + xStep} ${height - h}`;
  });
  path += ` L ${width} ${height} Z`;
  return path;
}
