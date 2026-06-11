import { useId, useMemo } from "react";
import type { Distribution, MCVariable } from "@decision-forge/core";
import { sampleDistribution } from "../../lib/mc-client-samplers";

const KINDS: Array<{ key: Distribution["kind"]; label: string; long: string }> = [
  { key: "normal", label: "N", long: "Normal" },
  { key: "lognormal", label: "LN", long: "Log-normal" },
  { key: "triangular", label: "T", long: "Triangular" },
  { key: "uniform", label: "U", long: "Uniform" },
  { key: "pert", label: "P", long: "PERT" },
  { key: "empirical", label: "E", long: "Empirical" }
];

function defaultDistribution(kind: Distribution["kind"]): Distribution {
  switch (kind) {
    case "normal":
      return { kind: "normal", mean: 0, sd: 1 };
    case "lognormal":
      return { kind: "lognormal", meanlog: 0, sdlog: 0.5 };
    case "triangular":
      return { kind: "triangular", min: 0, mode: 1, max: 2 };
    case "uniform":
      return { kind: "uniform", min: 0, max: 1 };
    case "pert":
      return { kind: "pert", min: 0, mode: 1, max: 2 };
    case "empirical":
      return { kind: "empirical", samples: [0, 1, 2, 3] };
    default:
      return { kind: "normal", mean: 0, sd: 1 };
  }
}

function kindLong(kind: Distribution["kind"]): string {
  return KINDS.find((k) => k.key === kind)?.long ?? kind;
}

/* ————————————————————————————————————————————
 * Ledger input — underlined baseline, no box
 * ———————————————————————————————————————————— */
function LedgerInput({
  id,
  label,
  value,
  min,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      <input
        id={id}
        type="number"
        step="any"
        min={min}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent border-0 border-b border-ink-faint px-0 pb-1 font-mono text-[13px] text-ink focus:border-ink focus:outline-none tabular-nums"
        style={{ fontFeatureSettings: '"tnum", "zero"' }}
      />
    </label>
  );
}

function ParamFields({
  distribution,
  onChange,
  idPrefix
}: {
  distribution: Distribution;
  onChange: (d: Distribution) => void;
  idPrefix: string;
}) {
  switch (distribution.kind) {
    case "normal":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <LedgerInput
            id={`${idPrefix}-mean`}
            label="μ  Mean"
            value={distribution.mean}
            onChange={(n) => onChange({ ...distribution, mean: n })}
          />
          <LedgerInput
            id={`${idPrefix}-sd`}
            label="σ  SD"
            value={distribution.sd}
            min={0.0001}
            onChange={(n) => onChange({ ...distribution, sd: n || 0.0001 })}
          />
        </div>
      );
    case "lognormal":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <LedgerInput
            id={`${idPrefix}-meanlog`}
            label="μ  Mean (log)"
            value={distribution.meanlog}
            onChange={(n) => onChange({ ...distribution, meanlog: n })}
          />
          <LedgerInput
            id={`${idPrefix}-sdlog`}
            label="σ  SD (log)"
            value={distribution.sdlog}
            min={0.0001}
            onChange={(n) => onChange({ ...distribution, sdlog: n || 0.0001 })}
          />
        </div>
      );
    case "triangular":
      return (
        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          <LedgerInput
            id={`${idPrefix}-min`}
            label="a  Min"
            value={distribution.min}
            onChange={(n) => onChange({ ...distribution, min: n })}
          />
          <LedgerInput
            id={`${idPrefix}-mode`}
            label="c  Mode"
            value={distribution.mode}
            onChange={(n) => onChange({ ...distribution, mode: n })}
          />
          <LedgerInput
            id={`${idPrefix}-max`}
            label="b  Max"
            value={distribution.max}
            onChange={(n) => onChange({ ...distribution, max: n })}
          />
        </div>
      );
    case "uniform":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <LedgerInput
            id={`${idPrefix}-min`}
            label="a  Min"
            value={distribution.min}
            onChange={(n) => onChange({ ...distribution, min: n })}
          />
          <LedgerInput
            id={`${idPrefix}-max`}
            label="b  Max"
            value={distribution.max}
            onChange={(n) => onChange({ ...distribution, max: n })}
          />
        </div>
      );
    case "pert":
      return (
        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          <LedgerInput
            id={`${idPrefix}-pmin`}
            label="Min"
            value={distribution.min}
            onChange={(n) => onChange({ ...distribution, min: n })}
          />
          <LedgerInput
            id={`${idPrefix}-pmode`}
            label="Likely"
            value={distribution.mode}
            onChange={(n) => onChange({ ...distribution, mode: n })}
          />
          <LedgerInput
            id={`${idPrefix}-pmax`}
            label="Max"
            value={distribution.max}
            onChange={(n) => onChange({ ...distribution, max: n })}
          />
        </div>
      );
    case "empirical":
      return (
        <div>
          <label htmlFor={`${idPrefix}-samples`} className="eyebrow mb-1 block">
            Samples (comma-separated)
          </label>
          <textarea
            id={`${idPrefix}-samples`}
            value={distribution.samples.join(", ")}
            onChange={(e) => {
              const parsed = e.target.value
                .split(",")
                .map((s) => parseFloat(s.trim()))
                .filter((n) => Number.isFinite(n));
              onChange({
                ...distribution,
                samples: parsed.length > 0 ? parsed : distribution.samples
              });
            }}
            rows={2}
            className="w-full resize-none border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
          />
        </div>
      );
    default:
      return <p className="meta">Distribution kind not editable.</p>;
  }
}

/* ————————————————————————————————————————————
 * Annotated probability curve — path + area + tick marks
 * Draws over a 200x66 viewbox for sharper detail than the old 100x50.
 * ———————————————————————————————————————————— */
function ProbabilityCurve({
  distribution,
  accent
}: {
  distribution: Distribution;
  accent: string;
}) {
  const { pathFill, pathStroke, mode, lo, hi } = useMemo(() => {
    const raw = sampleDistribution(distribution, 2000);
    if (raw.length === 0) return { pathFill: "", pathStroke: "", mode: 100, lo: 0, hi: 1 };
    const sorted = [...raw].sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    if (hi === lo) {
      return { pathFill: "", pathStroke: "", mode: 100, lo, hi };
    }
    // Kernel-ish smoothing: accumulate into 40 bins then smooth
    const bins = 60;
    const width = (hi - lo) / bins;
    const counts = new Array<number>(bins).fill(0);
    for (const v of raw) {
      const idx = Math.min(bins - 1, Math.floor((v - lo) / width));
      counts[idx]++;
    }
    // 3-wide moving average
    const smooth = counts.map((_, i) => {
      const a = counts[Math.max(0, i - 1)];
      const b = counts[i];
      const c = counts[Math.min(bins - 1, i + 1)];
      return (a + b + c) / 3;
    });
    const maxC = Math.max(...smooth) || 1;
    const W = 200;
    const H = 54; // leave room for baseline labels
    const BASE = 60;
    let fill = `M 0 ${BASE}`;
    let stroke = "";
    smooth.forEach((c, i) => {
      const x = (i / (bins - 1)) * W;
      const y = BASE - (c / maxC) * H;
      fill += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      stroke += (i === 0 ? "M " : " L ") + `${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    fill += ` L ${W} ${BASE} Z`;
    // Mode x: index of max
    const modeIdx = smooth.indexOf(maxC);
    const modeX = (modeIdx / (bins - 1)) * W;
    return { pathFill: fill, pathStroke: stroke, mode: modeX, lo, hi };
  }, [distribution]);

  const fmt = (n: number) =>
    Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);

  return (
    <svg viewBox="0 0 200 78" className="mt-5 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`curveFill-${accent.replace(/[^\w]/g, "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Faint baseline grid */}
      <line x1="0" y1="60" x2="200" y2="60" stroke="var(--rule)" strokeWidth="0.5" />
      {/* Mode guide */}
      <line
        x1={mode}
        x2={mode}
        y1={6}
        y2={60}
        stroke={accent}
        strokeOpacity="0.35"
        strokeWidth="0.5"
        strokeDasharray="1.5 2"
      />
      {/* Area */}
      <path d={pathFill} fill={`url(#curveFill-${accent.replace(/[^\w]/g, "")})`} />
      {/* Stroke */}
      <path
        d={pathStroke}
        fill="none"
        stroke={accent}
        strokeWidth="0.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Tick labels */}
      <text x="0" y="75" className="font-mono" fontSize="7" fill="var(--ink-dim)">
        {fmt(lo)}
      </text>
      <text x="200" y="75" className="font-mono" fontSize="7" textAnchor="end" fill="var(--ink-dim)">
        {fmt(hi)}
      </text>
    </svg>
  );
}

export function VariableCard({
  variable,
  onChange,
  onRemove,
  index,
  linkedLabel,
  linkedNote,
  linkedBroken,
  nameLocked
}: {
  variable: MCVariable;
  onChange: (v: MCVariable) => void;
  onRemove: () => void;
  index?: number;
  /** If set, renders the § IV badge line. */
  linkedLabel?: string;
  /** Node note shown as a hint line below the badge. */
  linkedNote?: string;
  /** True when the map file could not be loaded — badge replaced with broken-link note. */
  linkedBroken?: boolean;
  /** When true, the name input is disabled (persisted in map + formulas). */
  nameLocked?: boolean;
}) {
  const idPrefix = useId();
  const accent = "var(--sec-mc, #c4d82e)";
  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  const idx = typeof index === "number" ? roman[index] ?? `${index + 1}` : "";

  return (
    <div className="relative specimen p-5 pb-6">
      {/* Corner index + remove */}
      <div className="absolute left-4 top-3 flex items-baseline gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-ink-dim">
        <span>{idx}</span>
        {idx && <span className="text-ink-faint">·</span>}
        <span>{kindLong(variable.distribution.kind)}</span>
      </div>
      <button
        type="button"
        aria-label="Remove variable"
        onClick={onRemove}
        className="absolute right-3 top-2 h-6 w-6 font-display text-[18px] leading-none text-ink-faint transition-colors hover:text-ink"
      >
        ×
      </button>

      {/* § IV badge line (linked variables only) */}
      {(linkedLabel !== undefined || linkedBroken) && (
        <div className="mt-6 mb-1">
          {linkedBroken ? (
            <span className="font-mono text-[10px] tracking-[0.18em] text-[color:var(--sec-nego,#e8582b)]">
              link broken — now ad-hoc
            </span>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.18em] text-ink-dim">
              § IV · {linkedLabel}
            </span>
          )}
          {linkedNote && !linkedBroken && (
            <p className="mt-0.5 font-mono text-[10px] italic text-ink-faint">{linkedNote}</p>
          )}
        </div>
      )}

      {/* Name — big serif */}
      <div className={(linkedLabel !== undefined || linkedBroken) ? "mt-2" : "mt-6"}>
        <input
          value={variable.name}
          onChange={(e) => !nameLocked && onChange({ ...variable, name: e.target.value })}
          disabled={nameLocked}
          className="w-full bg-transparent font-display text-[28px] leading-none text-ink focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ fontVariationSettings: '"opsz" 44, "SOFT" 20, "wght" 380', letterSpacing: "-0.015em" }}
          spellCheck={false}
        />
      </div>

      {/* Distribution picker — inline italic typographic, with underline on active */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {KINDS.map(({ key, long }) => {
          const active = variable.distribution.kind === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...variable, distribution: defaultDistribution(key) })}
              className={`font-display text-[12px] italic transition-colors ${
                active ? "text-ink" : "text-ink-faint hover:text-ink-dim"
              }`}
              style={{
                fontVariationSettings: '"opsz" 14, "wght" 380',
                textDecoration: active ? "underline" : "none",
                textUnderlineOffset: "3px",
                textDecorationThickness: "1px"
              }}
            >
              {long}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <ParamFields
          distribution={variable.distribution}
          onChange={(d) => onChange({ ...variable, distribution: d })}
          idPrefix={idPrefix}
        />
      </div>

      <ProbabilityCurve distribution={variable.distribution} accent={accent} />
    </div>
  );
}
