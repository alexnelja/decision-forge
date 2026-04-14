import { useMemo, useState, useEffect } from "react";
import type { MCConfig, MCRunResult } from "@decision-forge/core";

type HistBar = { x: number; w: number; y: number; h: number };

function buildHistogram(
  samples: number[],
  width: number,
  height: number,
  bins = 40
): { bars: HistBar[]; lo: number; hi: number } {
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

function BigStat({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={`mt-1 font-display text-[32px] leading-none ${
          accent ? "text-ink" : "text-ink"
        } tabular-nums`}
        style={{
          fontVariationSettings: '"opsz" 72, "SOFT" 20, "wght" 300',
          letterSpacing: "-0.02em",
          fontFeatureSettings: '"tnum", "lnum"'
        }}
      >
        {value}
      </div>
    </div>
  );
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
  const [runCount, setRunCount] = useState(0);

  // keep formula in sync with parent config
  useEffect(() => setFormula(config.formula), [config.formula]);

  const hist = useMemo(
    () => buildHistogram(result?.samples ?? [], 600, 180, 48),
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
      setRunCount((c) => c + 1);
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
  const axisFor = (value: number) =>
    hi === lo ? 0 : ((value - lo) / (hi - lo)) * 600;
  const thresholdX = axisFor(threshold);

  return (
    <div className="space-y-8">
      {/* Formula — displayed like a theorem */}
      <div className="relative">
        <div className="eyebrow mb-3">Outcome ≡</div>
        <textarea
          id="mc-formula"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          rows={2}
          spellCheck={false}
          aria-label="Outcome formula"
          className="w-full resize-none border-0 border-b border-ink-faint bg-transparent px-0 py-2 font-display italic text-[28px] leading-tight text-ink focus:border-ink focus:outline-none"
          style={{
            fontVariationSettings: '"opsz" 48, "wght" 360',
            letterSpacing: "-0.015em"
          }}
        />
      </div>

      {/* Run button + iterations */}
      <div className="flex items-end justify-between gap-6">
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          aria-label="Run"
          className={`relative border px-10 py-5 font-display text-[18px] leading-none tracking-[0.32em] transition-all ${
            busy
              ? "border-ink-faint bg-transparent text-ink-dim"
              : "border-ink bg-ink text-paper hover:bg-paper hover:text-ink"
          } ${result ? "" : "ink-pulse"}`}
          style={{ fontVariationSettings: '"opsz" 20, "wght" 500' }}
        >
          <span className={busy ? "running" : ""}>{busy ? "RUNNING" : "RUN"}</span>
          {!busy && (
            <span
              className="absolute -bottom-5 left-0 text-[10px] tracking-[0.3em] text-ink-dim"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              ⏎ {iterations.toLocaleString()} iters
            </span>
          )}
        </button>
        <div className="text-right">
          <label htmlFor="mc-iter" className="eyebrow mb-1 block text-right">Iterations</label>
          <input
            id="mc-iter"
            type="number"
            min={100}
            max={1_000_000}
            step={100}
            value={iterations}
            onChange={(e) => setIterations(parseInt(e.target.value, 10) || 10_000)}
            className="w-36 border-0 border-b border-ink-faint bg-transparent px-0 pb-1 text-right font-mono text-[14px] tabular-nums text-ink focus:border-ink focus:outline-none"
          />
          {runCount > 0 && (
            <div className="meta mt-1">
              run № {runCount.toString().padStart(3, "0")}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="border-l-2 border-[#e8582b] bg-[#e8582b]/5 py-2 pl-3 font-mono text-[12px] text-[#e8582b]">
          {error}
        </p>
      )}

      {result && (
        <>
          {/* The histogram — centerpiece */}
          <figure className="pt-4">
            <figcaption className="mb-3 flex items-baseline justify-between">
              <span className="eyebrow">Distribution of outcome</span>
              <span className="meta">
                n = {result.iterations.toLocaleString()}
              </span>
            </figcaption>
            <svg
              key={runCount}
              viewBox="0 0 600 210"
              className="outcome-histogram h-[240px] w-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--sec-mc)" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="var(--sec-mc)" stopOpacity="0.15" />
                </linearGradient>
              </defs>

              {/* Horizontal gridlines */}
              {[0.25, 0.5, 0.75].map((f, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={600}
                  y1={180 * f}
                  y2={180 * f}
                  stroke="var(--rule)"
                  strokeWidth="0.5"
                  strokeDasharray="2 4"
                />
              ))}
              {/* Baseline */}
              <line x1={0} x2={600} y1={180} y2={180} stroke="var(--ink-faint)" strokeWidth="0.75" />

              {/* Bars — staggered reveal */}
              {bars.map((b, i) => (
                <rect
                  key={`${runCount}-${i}`}
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill="url(#barGrad)"
                  className="bar-rise"
                  style={{ animationDelay: `${i * 6}ms` }}
                />
              ))}

              {/* Percentile markers */}
              {(["p5", "p50", "p95"] as const).map((key, i) => {
                const x = axisFor(result.stats[key]);
                return (
                  <g key={key} className="line-draw" style={{ animationDelay: `${380 + i * 80}ms` }}>
                    <line
                      x1={x}
                      x2={x}
                      y1={6}
                      y2={180}
                      stroke="var(--ink-dim)"
                      strokeWidth="0.5"
                      strokeDasharray="1.5 3"
                    />
                    <text
                      x={x}
                      y={4}
                      textAnchor="middle"
                      fontSize="8"
                      fill="var(--ink-dim)"
                      className="font-mono"
                      style={{ letterSpacing: "0.12em" }}
                    >
                      {key.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {/* Threshold line — solid, section accent */}
              <g>
                <line
                  x1={thresholdX}
                  x2={thresholdX}
                  y1={10}
                  y2={180}
                  stroke="var(--sec-mc)"
                  strokeWidth="1.2"
                />
                <rect
                  x={thresholdX - 26}
                  y={186}
                  width={52}
                  height={18}
                  fill="var(--paper)"
                  stroke="var(--sec-mc)"
                  strokeWidth="0.8"
                />
                <text
                  x={thresholdX}
                  y={199}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--ink)"
                  className="font-mono tabular-nums"
                >
                  {fmt(threshold)}
                </text>
              </g>

              {/* Axis tick labels */}
              <text x={0} y={210} fontSize="9" fill="var(--ink-dim)" className="font-mono">
                {fmt(lo)}
              </text>
              <text x={600} y={210} textAnchor="end" fontSize="9" fill="var(--ink-dim)" className="font-mono">
                {fmt(hi)}
              </text>
            </svg>

            {/* Threshold slider + readout */}
            <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-8">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="mc-threshold" className="eyebrow">Threshold</label>
                  <span className="meta tabular-nums">≥ {fmt(threshold)}</span>
                </div>
                <input
                  id="mc-threshold"
                  type="range"
                  min={lo}
                  max={hi}
                  step={(hi - lo) / 400 || 1}
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[color:var(--sec-mc)]"
                  aria-label="Threshold"
                />
              </div>
              <div className="text-right">
                <div className="eyebrow text-right">P(outcome &gt; X)</div>
                <div
                  className="numeral mt-1 text-[46px] text-ink"
                  style={{ color: "var(--sec-mc)" }}
                >
                  {aboveThreshold === null ? "—" : `${(aboveThreshold * 100).toFixed(1)}`}
                  <span className="ml-1 font-mono text-[14px] align-top text-ink-dim">%</span>
                </div>
              </div>
            </div>
          </figure>

          {/* Stats strip — magazine-sidebar */}
          <div className="grid grid-cols-5 gap-6 border-t border-paper-rule pt-6">
            <BigStat label="Mean" value={fmt(result.stats.mean)} accent />
            <BigStat label="SD" value={fmt(result.stats.sd)} />
            <BigStat label="P5" value={fmt(result.stats.p5)} />
            <BigStat label="P50" value={fmt(result.stats.p50)} accent />
            <BigStat label="P95" value={fmt(result.stats.p95)} />
          </div>

          {/* Sensitivity — what drives the variance */}
          {result.sensitivity && result.sensitivity.length > 0 && (
            <div className="border-t border-paper-rule pt-6">
              <div className="mb-4 flex items-baseline justify-between">
                <div className="eyebrow">Sensitivity</div>
                <span className="meta italic">first-order rank-correlation²</span>
              </div>
              <div className="space-y-3">
                {result.sensitivity.map((row) => {
                  const pct = row.normalised * 100;
                  return (
                    <div key={row.name} className="grid grid-cols-[140px_1fr_60px] items-center gap-4">
                      <div className="font-display italic text-[15px] text-ink" style={{ fontVariationSettings: '"opsz" 18, "wght" 380' }}>
                        {row.name}
                      </div>
                      <div className="h-2 bg-paper-rule">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: "var(--sec-mc)"
                          }}
                        />
                      </div>
                      <div className="text-right font-mono text-[12px] tabular-nums text-ink-dim">
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
