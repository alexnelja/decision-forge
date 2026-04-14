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
    // SimulationPanel controls formula + iterations locally; sync up before the real call
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
        <div className="space-y-6">
          {result && (
            <div>
              <div className="eyebrow mb-2">Log to journal</div>
              <LogForecastButton
                result={result}
                formula={formula}
              />
            </div>
          )}
          <div>
            <div className="eyebrow mb-2">Of note</div>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-dim">
              "The map is not the territory. A good simulation is the map that admits it."
            </p>
          </div>
          <div className="rule" />
          <div>
            <div className="eyebrow mb-2">Telemetry</div>
            <dl className="mt-1 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <dt className="text-ink-dim">trials</dt>
                <dd className="text-ink">{iterations.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">variables</dt>
                <dd className="text-ink">{variables.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">resolved</dt>
                <dd className="text-ink">{result ? "✓" : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(280px,340px)_1fr] gap-8">
        <div className="space-y-4">
          <div className="eyebrow">I. Inputs</div>
          {variables.map((v, i) => (
            <VariableCard
              key={i}
              variable={v}
              onChange={(u) => updateVariable(i, u)}
              onRemove={() => removeVariable(i)}
            />
          ))}
          <button
            type="button"
            onClick={addVariable}
            className="w-full border border-dashed border-ink-dim/40 bg-transparent px-4 py-2 font-mono text-[11px] text-ink-dim hover:border-ink hover:text-ink"
          >
            + Add variable
          </button>
        </div>
        <div className="space-y-6">
          <div className="eyebrow">II. Engine</div>
          <SimulationPanel config={config} onRun={handleRun} />
        </div>
      </div>
    </ModuleFrame>
  );
}
