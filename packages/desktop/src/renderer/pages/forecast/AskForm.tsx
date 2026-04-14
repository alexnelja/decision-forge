import { useState } from "react";
import { forecastApi, isoNow } from "../../lib/forecast-api";

export function AskForm({ onAsked }: { onAsked: () => void }) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [resolveBy, setResolveBy] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [prob, setProb] = useState(50);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const qid = crypto.randomUUID();
      const now = isoNow();
      await forecastApi.ask(
        {
          id: qid,
          text: text.trim(),
          createdAt: now,
          resolveBy: `${resolveBy}T23:59:59Z`,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean)
        },
        {
          id: crypto.randomUUID(),
          questionId: qid,
          probability: prob / 100,
          madeAt: now,
          rationale: rationale.trim() || undefined
        }
      );
      setText("");
      setTags("");
      setRationale("");
      setProb(50);
      onAsked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-b border-paper-rule py-6 mb-10 grid grid-cols-[1fr_240px] gap-8"
    >
      <div className="space-y-4">
        <div>
          <label
            className="eyebrow block mb-2"
            style={{ color: "var(--sec-forecast)" }}
          >
            The claim
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Will …?"
            className="w-full bg-transparent border-b border-paper-rule focus:border-section-forecast outline-none font-display text-[22px] text-ink py-2"
            style={{ fontVariationSettings: '"opsz" 32, "wght" 380' }}
          />
        </div>
        <div className="flex gap-6">
          <div className="flex-1">
            <label className="eyebrow block mb-1">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="mining, fx"
              className="w-full bg-transparent border-b border-paper-rule outline-none font-mono text-[12px] text-ink py-1"
            />
          </div>
          <div>
            <label className="eyebrow block mb-1">Resolves by</label>
            <input
              type="date"
              value={resolveBy}
              onChange={(e) => setResolveBy(e.target.value)}
              className="bg-transparent border-b border-paper-rule outline-none font-mono text-[12px] text-ink py-1"
            />
          </div>
        </div>
        <div>
          <label className="eyebrow block mb-1">Rationale (optional)</label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full bg-transparent border-b border-paper-rule outline-none font-display text-[14px] text-ink-dim py-1 resize-none"
          />
        </div>
      </div>

      <div>
        <label className="eyebrow block mb-2">Probability</label>
        <div
          className="font-display leading-none tabular-nums"
          style={{
            color: "var(--sec-forecast)",
            fontVariationSettings: '"opsz" 144, "wght" 300',
            fontSize: 64
          }}
        >
          {prob}
          <span className="text-[28px] text-ink-dim">%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={prob}
          onChange={(e) => setProb(Number(e.target.value))}
          className="w-full mt-3 accent-section-forecast"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="mt-4 w-full py-2 border border-section-forecast eyebrow disabled:opacity-40 hover:bg-section-forecast/10 transition-colors"
          style={{ color: "var(--sec-forecast)" }}
        >
          {busy ? "Committing…" : "Commit prediction"}
        </button>
      </div>
    </form>
  );
}
