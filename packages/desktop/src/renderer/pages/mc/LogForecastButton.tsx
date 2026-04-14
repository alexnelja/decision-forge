import { useMemo, useState } from "react";
import type { MCRunResult, Question, Prediction } from "@decision-forge/core";
import { forecastApi, isoNow } from "../../lib/forecast-api";

type AskImpl = (question: Question, prediction: Prediction) => Promise<{ ok: true }>;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function percentileOf(samples: number[], value: number): number {
  if (samples.length === 0) return 0;
  const count = samples.filter((v) => v <= value).length;
  return Math.max(0, Math.min(1, count / samples.length));
}

export function LogForecastButton({
  result,
  formula,
  askImpl = (q, p) => forecastApi.ask(q, p),
  onLogged
}: {
  result: MCRunResult | null;
  formula: string;
  askImpl?: AskImpl;
  onLogged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(result?.stats.p90 ?? 0);
  const [questionText, setQuestionText] = useState("");
  const [resolveByDate, setResolveByDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [probability, setProbability] = useState(10);  // % — P90 default is 10%
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const suggestedProb = useMemo(() => {
    if (!result) return 0.1;
    // P(outcome > threshold) = 1 - percentile_of(threshold)
    return 1 - percentileOf(result.samples, threshold);
  }, [result, threshold]);

  if (!result) return null;

  function openPopover() {
    const t = result!.stats.p90;
    setThreshold(t);
    setQuestionText(`Will \`${formula}\` exceed ${fmt(t)}?`);
    setProbability(Math.round((1 - percentileOf(result!.samples, t)) * 100));
    setOpen(true);
  }

  async function commit() {
    if (busy) return;
    setBusy(true);
    try {
      const qid = crypto.randomUUID();
      const pid = crypto.randomUUID();
      const now = isoNow();
      await askImpl(
        {
          id: qid,
          text: questionText.trim(),
          createdAt: now,
          resolveBy: `${resolveByDate}T23:59:59Z`,
          tags: ["monte-carlo"]
        },
        {
          id: pid,
          questionId: qid,
          probability: Math.max(0, Math.min(1, probability / 100)),
          madeAt: now,
          rationale: `Derived from MC run: P(exceed ${fmt(threshold)}) = ${(suggestedProb * 100).toFixed(1)}%`
        }
      );
      setToast("Logged to § III — Forecast");
      setOpen(false);
      onLogged?.();
      setTimeout(() => setToast(null), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPopover}
        className="border border-ink-dim/30 bg-transparent px-3 py-2 font-display text-[13px] text-ink hover:border-ink"
        style={{ fontVariationSettings: '"opsz" 13, "wght" 400' }}
      >
        Log P90 as forecast →
      </button>

      {toast && (
        <p className="meta mt-2 font-mono text-[11px] text-ink">{toast}</p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute right-0 top-full z-20 mt-2 w-[340px] space-y-3 border border-ink-dim/20 bg-paper p-4 shadow-lg"
        >
          <div>
            <label htmlFor="mc-log-threshold" className="eyebrow mb-1 block">Threshold</label>
            <input
              id="mc-log-threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => {
                const t = parseFloat(e.target.value) || 0;
                setThreshold(t);
                setQuestionText(`Will \`${formula}\` exceed ${fmt(t)}?`);
                setProbability(Math.round((1 - percentileOf(result!.samples, t)) * 100));
              }}
              className="w-full rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="mc-log-question" className="eyebrow mb-1 block">Question</label>
            <textarea
              id="mc-log-question"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[11px] text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label htmlFor="mc-log-prob" className="eyebrow mb-1 block">Probability (%)</label>
              <input
                id="mc-log-prob"
                type="number"
                min={0}
                max={100}
                step={1}
                value={probability}
                onChange={(e) => setProbability(parseFloat(e.target.value) || 0)}
                className="w-full rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="mc-log-resolve" className="eyebrow mb-1 block">Resolve by</label>
              <input
                id="mc-log-resolve"
                type="date"
                value={resolveByDate}
                onChange={(e) => setResolveByDate(e.target.value)}
                className="rounded-none border border-ink-dim/20 bg-transparent px-2 py-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 font-mono text-[11px] text-ink-dim hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={busy || !questionText.trim()}
              className="border border-ink bg-ink px-3 py-1 font-mono text-[11px] text-paper disabled:opacity-50"
            >
              {busy ? "…" : "Commit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
