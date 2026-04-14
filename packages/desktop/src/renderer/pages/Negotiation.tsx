import { ModuleFrame } from "../components/ModuleFrame";

export default function Negotiation() {
  return (
    <ModuleFrame
      section="§ II"
      kicker="Rehearsal"
      title="Negotiation Dojo"
      accent="var(--sec-nego)"
      lede="A training partner for the conversation you cannot afford to rehearse on a real counterparty. Scenarios, transcripts, and the coach who reads them back to you."
      marginalia={
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Arriving in</div>
            <div className="font-display text-[18px] text-ink" style={{ fontVariationSettings: '"opsz" 18, "wght" 400' }}>
              Plan IV
            </div>
            <div className="meta mt-1">Anthropic via keytar</div>
          </div>
          <div className="rule" />
          <div>
            <div className="eyebrow mb-2">Ground rules</div>
            <ul className="mt-1 font-mono text-[11px] leading-[1.7] text-ink-dim space-y-1">
              <li>→ one scenario at a time</li>
              <li>→ transcripts stay local</li>
              <li>→ coach reads last turn</li>
            </ul>
          </div>
        </div>
      }
    >
      <blockquote
        className="border-l-2 pl-6 py-2"
        style={{ borderColor: "var(--sec-nego)" }}
      >
        <p
          className="font-display italic text-[28px] leading-[1.25] text-ink"
          style={{ fontVariationSettings: '"opsz" 48, "SOFT" 60, "wght" 360' }}
        >
          "The skill of negotiation is not in the words you say,
          but in the sentences you leave unfinished."
        </p>
        <footer className="mt-3 eyebrow">from the editor's notebook</footer>
      </blockquote>

      <div className="grid grid-cols-3 gap-6 mt-12">
        {[
          { n: "01", label: "Brief", body: "Who you are, who they are, what they want, what you want, what you won't give." },
          { n: "02", label: "Round", body: "Exchange turns with a counterparty tuned to the scenario. The coach watches." },
          { n: "03", label: "Read-back", body: "The coach annotates the transcript: where you leaked, where you held, where you fumbled the ask." }
        ].map((s) => (
          <div key={s.n} className="border-t border-paper-rule pt-4">
            <div className="font-mono text-[11px] text-ink-faint mb-2">{s.n}</div>
            <div className="eyebrow mb-2" style={{ color: "var(--sec-nego)" }}>{s.label}</div>
            <p className="font-display text-[14px] leading-[1.55] text-ink/85" style={{ fontVariationSettings: '"opsz" 16' }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 p-6 border border-paper-rule" style={{ background: "var(--paper-raised)" }}>
        <div className="flex items-center gap-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--sec-nego)" }} />
          <span className="eyebrow">Coming in Plan 4</span>
        </div>
        <p className="mt-3 font-display text-[17px] text-ink-dim" style={{ fontVariationSettings: '"opsz" 18, "wght" 350' }}>
          The dojo is swept; the mats are laid; the partner is not yet installed.
        </p>
      </div>
    </ModuleFrame>
  );
}
