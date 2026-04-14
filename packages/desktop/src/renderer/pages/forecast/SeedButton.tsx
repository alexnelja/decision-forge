import { useState } from "react";
import { forecastApi, isoNow } from "../../lib/forecast-api";

/**
 * Ten hand-written predictions with mixed outcomes. Mixes high and low
 * confidence, right and wrong. Brier lands around ~0.15 — a recognisable
 * starting calibration that isn't suspiciously perfect.
 */
const SAMPLES: Array<{
  text: string;
  tags: string[];
  probability: number;
  outcome: 0 | 1;
  rationale?: string;
}> = [
  { text: "Will Brent crude close above $80/bbl on 2026-06-30?", tags: ["commodities", "energy"], probability: 0.65, outcome: 1, rationale: "OPEC+ cuts holding; demand steady." },
  { text: "Will ZAR strengthen below 17.50/USD by 2026-09-30?", tags: ["fx", "sa"], probability: 0.35, outcome: 0, rationale: "SARB cuts priced in." },
  { text: "Will the BSEC deal close by 2026-07-31?", tags: ["minemarket", "deal"], probability: 0.8, outcome: 1, rationale: "LOI signed; legal close imminent." },
  { text: "Will manganese FOB Port Elizabeth exceed $4/dmtu in Q3 2026?", tags: ["minerals", "mn"], probability: 0.55, outcome: 0, rationale: "China restocking lighter than expected." },
  { text: "Will Cloudskraal rooibos yield > 2,400 kg/ha at 2026 harvest?", tags: ["cloudskraal", "rooibos"], probability: 0.4, outcome: 1, rationale: "Good winter rains at Garsland." },
  { text: "Will the Fed cut rates by July 2026?", tags: ["macro", "fed"], probability: 0.75, outcome: 1 },
  { text: "Will iron ore 62% fall below $90/t by 2026-08-31?", tags: ["minerals", "fe"], probability: 0.3, outcome: 0 },
  { text: "Will a Cape Town drought warning be issued in Q1 2026?", tags: ["cloudskraal", "weather"], probability: 0.25, outcome: 0 },
  { text: "Will copper pass $11k/t by year-end 2026?", tags: ["commodities", "cu"], probability: 0.6, outcome: 0, rationale: "Supply disruptions priced in too aggressively." },
  { text: "Will the rand/pound cross stay in [22.0, 24.0] through Q2 2026?", tags: ["fx", "gbp"], probability: 0.7, outcome: 1 }
];

export function SeedButton({ onSeeded }: { onSeeded: () => void }) {
  const [busy, setBusy] = useState(false);

  async function seed() {
    if (busy) return;
    setBusy(true);
    try {
      const now = new Date();
      // Back-date the creation so samples appear as if journaled over months
      for (let i = 0; i < SAMPLES.length; i++) {
        const s = SAMPLES[i];
        const created = new Date(now);
        created.setDate(created.getDate() - (SAMPLES.length - i) * 14);
        const resolveBy = new Date(created);
        resolveBy.setDate(resolveBy.getDate() + 30);
        const resolved = new Date(resolveBy);
        resolved.setDate(resolved.getDate() + 2);

        const createdIso = created.toISOString().replace(/\.\d+Z$/, "Z");
        const resolveByIso = resolveBy.toISOString().replace(/\.\d+Z$/, "Z");
        const resolvedIso = resolved.toISOString().replace(/\.\d+Z$/, "Z");

        const qid = crypto.randomUUID();
        await forecastApi.ask(
          {
            id: qid,
            text: s.text,
            createdAt: createdIso,
            resolveBy: resolveByIso,
            tags: s.tags
          },
          {
            id: crypto.randomUUID(),
            questionId: qid,
            probability: s.probability,
            madeAt: createdIso,
            rationale: s.rationale
          }
        );
        await forecastApi.resolve({
          questionId: qid,
          outcome: s.outcome,
          resolvedAt: resolvedIso
        });
      }
      onSeeded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={seed}
      disabled={busy}
      className="w-full py-2 border border-paper-rule eyebrow text-ink-dim hover:border-section-forecast hover:text-section-forecast transition-colors disabled:opacity-40"
    >
      {busy ? "Seeding…" : "Seed 10 samples"}
    </button>
  );
}
