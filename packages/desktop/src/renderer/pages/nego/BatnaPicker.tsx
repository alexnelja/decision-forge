import { useEffect, useMemo, useState } from "react";
import type { BatnaMCRef } from "@decision-forge/core";
import { useLatestMCVariables } from "../../lib/mc-store";
import { variablePercentile } from "../../lib/mc-percentile";

type BatnaValue = number | BatnaMCRef;

interface Props {
  value: BatnaValue;
  onChange: (next: BatnaValue) => void;
  label?: string;
}

const PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;

function isMCRef(v: BatnaValue): v is BatnaMCRef {
  return typeof v === "object" && v !== null && "refMCVar" in v;
}

export function BatnaPicker({ value, onChange, label = "BATNA" }: Props) {
  const variables = useLatestMCVariables();

  const [mode, setMode] = useState<"scalar" | "linked">(
    isMCRef(value) ? "linked" : "scalar"
  );

  const [linkedVar, setLinkedVar] = useState<string>(
    isMCRef(value) ? value.refMCVar : variables[0]?.name ?? ""
  );
  const [linkedPct, setLinkedPct] = useState<number>(
    isMCRef(value) ? value.percentile : 50
  );
  const [scalarDraft, setScalarDraft] = useState<number>(
    typeof value === "number" ? value : 0
  );

  // Reconcile local linked state when the value prop changes externally
  useEffect(() => {
    if (isMCRef(value)) {
      setLinkedVar(value.refMCVar);
      setLinkedPct(value.percentile);
    } else {
      setScalarDraft(value);
    }
  }, [value]);

  const goLinked = () => {
    setMode("linked");
    if (variables.length === 0) return; // empty state — no emit
    const v = linkedVar || variables[0].name;
    setLinkedVar(v);
    onChange({ refMCVar: v, percentile: linkedPct });
  };

  const goScalar = () => {
    setMode("scalar");
    onChange(scalarDraft);
  };

  const changeVar = (name: string) => {
    setLinkedVar(name);
    onChange({ refMCVar: name, percentile: linkedPct });
  };

  const changePct = (p: number) => {
    setLinkedPct(p);
    onChange({ refMCVar: linkedVar, percentile: p });
  };

  const changeScalar = (n: number) => {
    setScalarDraft(n);
    onChange(n);
  };

  const preview = useMemo(() => {
    if (mode !== "linked") return null;
    const v = variables.find((x) => x.name === linkedVar);
    if (!v) return null;
    return variablePercentile(v, linkedPct);
  }, [mode, variables, linkedVar, linkedPct]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="eyebrow" htmlFor="batna-input">
          {label}
        </label>
        {mode === "linked" ? (
          <button
            type="button"
            onClick={goScalar}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim hover:text-ink"
          >
            Static
          </button>
        ) : (
          <button
            type="button"
            onClick={goLinked}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim hover:text-ink"
          >
            Link to MC
          </button>
        )}
      </div>

      {mode === "scalar" && (
        <input
          id="batna-input"
          aria-label={label}
          type="number"
          value={scalarDraft}
          onChange={(e) => changeScalar(parseFloat(e.target.value) || 0)}
          className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[16px] tabular-nums text-ink focus:border-ink focus:outline-none"
        />
      )}

      {mode === "linked" && variables.length === 0 && (
        <p className="meta italic text-ink-dim">
          Run a Monte Carlo simulation first to link a BATNA to a variable.
        </p>
      )}

      {mode === "linked" && variables.length > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <label
              htmlFor="batna-mc-var"
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim"
            >
              Variable
            </label>
            <select
              id="batna-mc-var"
              aria-label="Variable"
              value={linkedVar}
              onChange={(e) => changeVar(e.target.value)}
              className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[14px] text-ink focus:border-ink focus:outline-none"
            >
              {variables.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="batna-mc-pct"
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim"
            >
              Percentile
            </label>
            <select
              id="batna-mc-pct"
              aria-label="Percentile"
              value={linkedPct}
              onChange={(e) => changePct(parseInt(e.target.value, 10))}
              className="border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[14px] tabular-nums text-ink focus:border-ink focus:outline-none"
            >
              {PERCENTILES.map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
          </div>
          {preview !== null && (
            <p
              className="col-span-2 meta italic text-ink-dim"
              data-testid="batna-preview"
            >
              ≈ {preview.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
