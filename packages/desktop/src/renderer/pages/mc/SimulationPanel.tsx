import { useMemo, useState } from "react";
import type { MCConfig, MCRunResult } from "@decision-forge/core";

function buildHistogramBars(samples: number[], width: number, height: number, bins = 40) {
  if (samples.length === 0) return { bars: [], lo: 0, hi: 1 };
  const sorted = [...samples].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (hi === lo) return { bars: [], lo, hi };
  const binWidth = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of samples) {
    const idx = Math.min(bins - 1, Math.floor((v - lo) / binWidth));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);
  const xStep = width / bins;
  const bars = counts.map((c, i) => ({
    x: i * xStep,
    w: xStep - 1,
    h: (c / maxCount) * (height - 4),
    y: height - (c / maxCount) * (height - 4)
  }));
  return { bars, lo, hi };
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function SimulationPanel({
  config,
  onRun
}: {
  config: MCConfig;
  onRun: (cfg: MCConfig) => Promise<MCRunResult>;
}) {
  const [formula, setFormula] = useState(config.formula);
  const [iterations, setIterations] = useState(config.iterations);
  const [result, setResult] = useState<MCRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(0);

  const hist = useMemo(
    () => buildHistogramBars(result?.samples ?? [], 300, 100, 40),
    [result]
  );

  async function handleRun() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const cfg: MCConfig = { ...config, formula, iterations };
      const r = await onRun(cfg);
      setResult(r);
      setThreshold(r.stats.p50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const aboveThreshold = useMemo(() => {
    if (!result) return null;
    const count = result.samples.filter((v) => v > threshold).length;
    return count / result.samples.length;
  }, [result, threshold]);

  const { bars, lo, hi } = hist;
  const thresholdX =
    hi === lo ? 0 : ((threshold - lo) / (hi - lo)) * 300;

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="mc-formula" className="eyebrow mb-2 block">Outcome formula</label>
        <textarea
          id="mc-formula"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-none border border-ink-dim/20 bg-transparent p-3 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
        />
      </div>

      <div className="flex items-end gap-4">
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          className="border border-ink bg-ink px-5 py-3 font-display text-[16px] text-paper hover:bg-paper hover:text-ink disabled:opacity-50"
          style={{ fontVariationSettings: '"opsz" 16, "wght" 500' }}
        >
          {busy ? "Running…" : "Run"}
        </button>
        <div>
          <label htmlFor="mc-iter" className="eyebrow mb-1 block">Iterations</label>
          <input
            id="mc-iter"
            type="number"
            min={100}
            max={1_000_000}
            step={100}
            value={iterations}
            onChange={(e) => setIterations(parseInt(e.target.value, 10) || 10_000)}
            className="w-28 rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="font-mono text-[11px] text-[#c05d4a]">{error}</p>}

      {result && (
        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div>
            <svg viewBox="0 0 300 110" className="outcome-histogram h-40 w-full">
              {bars.map((b, i) => (
                <rect
                  key={i}
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill="var(--sec-mc, #c4d82e)"
                  fillOpacity={0.35}
                />
              ))}
              <line
                x1={thresholdX}
                x2={thresholdX}
                y1={0}
                y2={100}
                stroke="var(--ink, #1a1a1a)"
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
              <text x={thresholdX + 4} y={12} className="font-mono" fontSize={10} fill="var(--ink, #1a1a1a)">
                {fmt(threshold)}
              </text>
            </svg>
            <div className="mt-2">
              <input
                type="range"
                min={lo}
                max={hi}
                step={(hi - lo) / 200 || 1}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
                aria-label="Threshold"
              />
              <p className="meta mt-1 font-mono">
                P(outcome &gt; {fmt(threshold)}) = {aboveThreshold === null ? "—" : `${(aboveThreshold * 100).toFixed(1)}%`}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono text-[12px]">
            {(["mean", "sd", "p5", "p50", "p95"] as const).map((k) => (
              <span key={k} className="contents">
                <dt className="eyebrow">{k.toUpperCase()}</dt>
                <dd className="text-ink">{fmt(result.stats[k])}</dd>
              </span>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
