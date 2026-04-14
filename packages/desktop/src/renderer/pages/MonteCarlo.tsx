import { ModuleFrame } from "../components/ModuleFrame";

export default function MonteCarlo() {
  return (
    <ModuleFrame
      section="§ I"
      kicker="Uncertainty"
      title="Monte Carlo"
      accent="var(--sec-mc)"
      lede="Draw a distribution over every input you cannot pin down. Run the scenario ten thousand times. Read the shape of the possible, not the point."
      marginalia={
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Arriving in</div>
            <div className="font-display text-[18px] text-ink" style={{ fontVariationSettings: '"opsz" 18, "wght" 400' }}>
              Plan III
            </div>
            <div className="meta mt-1">Simulation engine</div>
          </div>
          <div className="rule" />
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
              <div className="flex justify-between"><dt className="text-ink-dim">trials</dt><dd className="text-ink">10,000</dd></div>
              <div className="flex justify-between"><dt className="text-ink-dim">seed</dt><dd className="text-ink">—</dd></div>
              <div className="flex justify-between"><dt className="text-ink-dim">runtime</dt><dd className="text-ink">&lt; 1s</dd></div>
            </dl>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-8">
        <div className="border-t border-paper-rule pt-4">
          <div className="eyebrow mb-3">I. Inputs</div>
          <p className="font-display text-[15px] leading-[1.55] text-ink/85" style={{ fontVariationSettings: '"opsz" 16' }}>
            Declare each variable as a range or a distribution — triangular for gut feel, normal for well-measured, lognormal for the long tail.
          </p>
        </div>
        <div className="border-t border-paper-rule pt-4">
          <div className="eyebrow mb-3">II. Engine</div>
          <p className="font-display text-[15px] leading-[1.55] text-ink/85" style={{ fontVariationSettings: '"opsz" 16' }}>
            The Python sidecar draws samples, evaluates the model, and returns the full empirical distribution. No point estimate hides the variance.
          </p>
        </div>
        <div className="border-t border-paper-rule pt-4">
          <div className="eyebrow mb-3">III. Verdict</div>
          <p className="font-display text-[15px] leading-[1.55] text-ink/85" style={{ fontVariationSettings: '"opsz" 16' }}>
            Histograms, percentiles (P5 / P50 / P95), and the fraction of worlds in which the decision regrets itself.
          </p>
        </div>
        <div className="border-t border-paper-rule pt-4">
          <div className="eyebrow mb-3">IV. Provenance</div>
          <p className="font-display text-[15px] leading-[1.55] text-ink/85" style={{ fontVariationSettings: '"opsz" 16' }}>
            Every run pinned to a seed, serialised under <span className="font-mono text-[13px]">~/DecisionForge/</span>, and archivable into the scenario that spawned it.
          </p>
        </div>
      </div>

      <div className="mt-10 p-6 border border-paper-rule" style={{ background: "var(--paper-raised)" }}>
        <div className="flex items-center gap-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--sec-mc)" }} />
          <span className="eyebrow">Coming in Plan 3</span>
        </div>
        <p className="mt-3 font-display text-[17px] text-ink-dim" style={{ fontVariationSettings: '"opsz" 18, "wght" 350' }}>
          This section is set but unwritten. The typesetter holds the matrices.
        </p>
      </div>
    </ModuleFrame>
  );
}
