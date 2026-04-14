import { useState } from "react";
import type { MCConfig, MCRunResult, MCVariable } from "@decision-forge/core";
import { ModuleFrame } from "../components/ModuleFrame";
import { mcApi } from "../lib/mc-api";
import { VariableCard } from "./mc/VariableCard";
import { SimulationPanel } from "./mc/SimulationPanel";
import { LogForecastButton } from "./mc/LogForecastButton";

const DEFAULT_CONFIG: MCConfig = {
  variables: [
    { name: "revenue", distribution: { kind: "normal", mean: 100, sd: 15 } },
    { name: "cost", distribution: { kind: "triangular", min: 40, mode: 50, max: 70 } }
  ],
  formula: "revenue - cost",
  iterations: 10_000
};

export default function MonteCarlo() {
  const [variables, setVariables] = useState<MCVariable[]>(DEFAULT_CONFIG.variables);
  const [formula, setFormula] = useState(DEFAULT_CONFIG.formula);
  const [iterations, setIterations] = useState(DEFAULT_CONFIG.iterations);
  const [result, setResult] = useState<MCRunResult | null>(null);

  const config: MCConfig = { variables, formula, iterations };

  async function handleRun(cfg: MCConfig): Promise<MCRunResult> {
    setFormula(cfg.formula);
    setIterations(cfg.iterations);
    const r = await mcApi.run(cfg);
    setResult(r);
    return r;
  }

  function updateVariable(index: number, updated: MCVariable) {
    setVariables((prev) => prev.map((v, i) => (i === index ? updated : v)));
  }

  function removeVariable(index: number) {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariable() {
    setVariables((prev) => [
      ...prev,
      {
        name: `x${prev.length + 1}`,
        distribution: { kind: "normal", mean: 0, sd: 1 }
      }
    ]);
  }

  return (
    <ModuleFrame
      section="§ I"
      kicker="Uncertainty"
      title="Monte Carlo"
      accent="var(--sec-mc)"
      lede="Draw a distribution over every input you cannot pin down. Run the scenario ten thousand times. Read the shape of the possible, not the point."
      marginalia={
        <div className="space-y-7">
          {result && (
            <div>
              <div className="eyebrow mb-3">Commit to a wager</div>
              <LogForecastButton result={result} formula={formula} />
            </div>
          )}

          {result && <div className="rule" />}

          <div>
            <div className="eyebrow mb-3">Colophon</div>
            <p
              className="font-display italic text-[14px] leading-[1.55] text-ink-dim"
              style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
            >
              "The map is not the territory. A good simulation is the map that
              admits it."
            </p>
          </div>

          <div className="rule" />

          <div>
            <div className="eyebrow mb-3">Telemetry</div>
            <dl className="mt-1 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <dt className="text-ink-dim">trials</dt>
                <dd className="tabular-nums text-ink">
                  {iterations.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">variables</dt>
                <dd className="tabular-nums text-ink">{variables.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">resolved</dt>
                <dd className="text-ink">{result ? "✓" : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="rule" />

          <div>
            <div className="eyebrow mb-3">Deferred</div>
            <ul className="space-y-1.5 font-mono text-[10px] text-ink-faint">
              <li>— 3D particle cloud</li>
              <li>— SSE streaming progress</li>
              <li>— Sobol sensitivity</li>
              <li>— Compare-mode overlay</li>
              <li>— Correlations, PERT, empirical</li>
            </ul>
            <p className="meta mt-2 italic">Plan 3.5</p>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(300px,360px)_1fr] gap-12">
        {/* Inputs column */}
        <div className="space-y-5">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">I. Inputs</div>
            <span
              className="font-mono text-[10px] text-ink-faint tabular-nums"
              style={{ letterSpacing: "0.18em" }}
            >
              {variables.length.toString().padStart(2, "0")}
            </span>
          </div>
          {variables.map((v, i) => (
            <VariableCard
              key={i}
              variable={v}
              onChange={(u) => updateVariable(i, u)}
              onRemove={() => removeVariable(i)}
              index={i}
            />
          ))}
          <button
            type="button"
            onClick={addVariable}
            className="group w-full border border-dashed border-ink-faint/60 bg-transparent px-4 py-4 text-left font-display italic text-[15px] text-ink-dim transition-all hover:border-ink hover:text-ink"
            style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
          >
            <span className="font-mono text-[11px] not-italic tracking-[0.2em] text-ink-faint group-hover:text-ink-dim">
              +
            </span>{" "}
            Append a variable
          </button>
        </div>

        {/* Engine column */}
        <div className="space-y-10">
          <div className="flex items-baseline justify-between border-b border-paper-rule pb-2">
            <div className="eyebrow">II. Engine</div>
            <span className="meta italic">Python sidecar · numpy-vectorised</span>
          </div>
          <SimulationPanel config={config} onRun={handleRun} />
        </div>
      </div>
    </ModuleFrame>
  );
}
