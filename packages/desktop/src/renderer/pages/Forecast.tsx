import { ModuleFrame } from "../components/ModuleFrame";

export default function Forecast() {
  return (
    <ModuleFrame
      section="§ III"
      kicker="Calibration"
      title="Forecast Journal"
      accent="var(--sec-forecast)"
      lede="A ledger of your predictions at the moment they still cost something to make. The Brier score, in time, tells you whether your confidence was earned or borrowed."
      marginalia={
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Arriving in</div>
            <div className="font-display text-[18px] text-ink" style={{ fontVariationSettings: '"opsz" 18, "wght" 400' }}>
              Plan II
            </div>
            <div className="meta mt-1">SQLite · Brier score</div>
          </div>
          <div className="rule" />
          <div>
            <div className="eyebrow mb-2">Calibration</div>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-dim">
              A well-calibrated forecaster says "70%" on the days where, counted, 70% of things happen.
            </p>
          </div>
          <div className="rule" />
          <div>
            <div className="eyebrow mb-2">Entries to date</div>
            <div className="mt-1 font-mono text-[26px] text-ink tabular-nums">0</div>
          </div>
        </div>
      }
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-t border-b border-paper-rule">
            <th className="text-left eyebrow py-3 w-[56px]">№</th>
            <th className="text-left eyebrow py-3">Claim</th>
            <th className="text-right eyebrow py-3 w-[100px]">p</th>
            <th className="text-right eyebrow py-3 w-[120px]">Resolves</th>
            <th className="text-right eyebrow py-3 w-[100px]">Brier</th>
          </tr>
        </thead>
        <tbody className="font-display">
          {[
            ["—", "First entry arrives with Plan 2.", "—", "—", "—"],
            ["—", "The journal will page itself in chronological folio.", "—", "—", "—"],
            ["—", "Scores will resolve on their own dates — not yours.", "—", "—", "—"]
          ].map(([n, claim, p, r, b], i) => (
            <tr key={i} className="border-b border-paper-rule">
              <td className="py-4 font-mono text-[12px] text-ink-faint align-top">{n}</td>
              <td className="py-4 text-[15px] text-ink-dim align-top max-w-[52ch]" style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}>{claim}</td>
              <td className="py-4 text-right font-mono text-[12px] text-ink-faint align-top tabular-nums">{p}</td>
              <td className="py-4 text-right font-mono text-[12px] text-ink-faint align-top">{r}</td>
              <td className="py-4 text-right font-mono text-[12px] text-ink-faint align-top tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 p-6 border border-paper-rule" style={{ background: "var(--paper-raised)" }}>
        <div className="flex items-center gap-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--sec-forecast)" }} />
          <span className="eyebrow">Coming in Plan 2</span>
        </div>
        <p className="mt-3 font-display text-[17px] text-ink-dim" style={{ fontVariationSettings: '"opsz" 18, "wght" 350' }}>
          The ledger is ruled; no entries yet recorded.
        </p>
      </div>
    </ModuleFrame>
  );
}
