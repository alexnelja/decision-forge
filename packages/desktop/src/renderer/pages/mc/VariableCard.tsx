import { useId, useMemo } from "react";
import type { Distribution, MCVariable } from "@decision-forge/core";
import { histogramPath, sampleDistribution } from "../../lib/mc-client-samplers";

const KINDS: Array<{ key: Distribution["kind"]; label: string }> = [
  { key: "normal", label: "N" },
  { key: "lognormal", label: "LN" },
  { key: "triangular", label: "T" },
  { key: "uniform", label: "U" }
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
    default:
      return { kind: "normal", mean: 0, sd: 1 };
  }
}

function ParamInputs({
  distribution,
  onChange,
  idPrefix
}: {
  distribution: Distribution;
  onChange: (d: Distribution) => void;
  idPrefix: string;
}) {
  const fieldClass =
    "w-full rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[11px] text-ink focus:border-ink focus:outline-none";
  const labelClass = "eyebrow mb-1 block";

  switch (distribution.kind) {
    case "normal":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${idPrefix}-mean`} className={labelClass}>Mean</label>
            <input
              id={`${idPrefix}-mean`}
              type="number"
              step="any"
              className={fieldClass}
              value={distribution.mean}
              onChange={(e) =>
                onChange({ ...distribution, mean: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-sd`} className={labelClass}>SD</label>
            <input
              id={`${idPrefix}-sd`}
              type="number"
              step="any"
              min={0.0001}
              className={fieldClass}
              value={distribution.sd}
              onChange={(e) =>
                onChange({ ...distribution, sd: parseFloat(e.target.value) || 0.0001 })
              }
            />
          </div>
        </div>
      );
    case "lognormal":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Mean (log)</label>
            <input
              type="number"
              step="any"
              className={fieldClass}
              value={distribution.meanlog}
              onChange={(e) =>
                onChange({ ...distribution, meanlog: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className={labelClass}>SD (log)</label>
            <input
              type="number"
              step="any"
              min={0.0001}
              className={fieldClass}
              value={distribution.sdlog}
              onChange={(e) =>
                onChange({ ...distribution, sdlog: parseFloat(e.target.value) || 0.0001 })
              }
            />
          </div>
        </div>
      );
    case "triangular":
      return (
        <div className="grid grid-cols-3 gap-2">
          {(["min", "mode", "max"] as const).map((field) => (
            <div key={field}>
              <label className={labelClass}>{field[0].toUpperCase() + field.slice(1)}</label>
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={distribution[field]}
                onChange={(e) =>
                  onChange({
                    ...distribution,
                    [field]: parseFloat(e.target.value) || 0
                  } as Distribution)
                }
              />
            </div>
          ))}
        </div>
      );
    case "uniform":
      return (
        <div className="grid grid-cols-2 gap-2">
          {(["min", "max"] as const).map((field) => (
            <div key={field}>
              <label className={labelClass}>{field[0].toUpperCase() + field.slice(1)}</label>
              <input
                type="number"
                step="any"
                className={fieldClass}
                value={distribution[field]}
                onChange={(e) =>
                  onChange({
                    ...distribution,
                    [field]: parseFloat(e.target.value) || 0
                  } as Distribution)
                }
              />
            </div>
          ))}
        </div>
      );
    default:
      return <p className="meta">Distribution kind not editable in Plan 3.</p>;
  }
}

export function VariableCard({
  variable,
  onChange,
  onRemove
}: {
  variable: MCVariable;
  onChange: (v: MCVariable) => void;
  onRemove: () => void;
}) {
  const idPrefix = useId();
  const histPath = useMemo(() => {
    const samples = sampleDistribution(variable.distribution, 1000);
    return histogramPath(samples, 100, 50, 20);
  }, [variable.distribution]);

  return (
    <div className="border border-ink-dim/15 bg-paper p-4">
      <div className="flex items-start justify-between gap-2">
        <input
          value={variable.name}
          onChange={(e) => onChange({ ...variable, name: e.target.value })}
          className="flex-1 bg-transparent font-display text-[20px] text-ink focus:outline-none"
          style={{ fontVariationSettings: '"opsz" 20, "wght" 500' }}
        />
        <button
          type="button"
          aria-label="Remove variable"
          onClick={onRemove}
          className="font-mono text-[11px] text-ink-dim hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex gap-1">
        {KINDS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...variable, distribution: defaultDistribution(key) })}
            className={`rounded-none border px-2 py-0.5 font-mono text-[10px] ${
              variable.distribution.kind === key
                ? "border-ink bg-ink text-paper"
                : "border-ink-dim/20 text-ink-dim hover:border-ink-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <ParamInputs
          distribution={variable.distribution}
          onChange={(d) => onChange({ ...variable, distribution: d })}
          idPrefix={idPrefix}
        />
      </div>

      <svg viewBox="0 0 100 50" className="mt-4 h-12 w-full">
        <path d={histPath} fill="var(--sec-mc, #c4d82e)" fillOpacity={0.25} stroke="var(--sec-mc, #c4d82e)" strokeWidth={0.5} />
      </svg>
    </div>
  );
}
