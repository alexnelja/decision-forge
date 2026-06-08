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
  const [probability, setProbability] = useState(10);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const suggestedProb = useMemo(() => {
    if (!result) return 0.1;
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
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPopover}
        className="group flex w-full items-center justify-between border border-ink-faint bg-paper-raised/40 px-4 py-3 font-display text-[14px] text-ink transition-all hover:border-ink hover:bg-ink hover:text-paper"
        style={{ fontVariationSettings: '"opsz" 16, "wght" 380', letterSpacing: "-0.005em" }}
      >
        <span className="italic">Log P90 as forecast</span>
        <span
          className="font-mono text-[11px] text-ink-dim transition-transform group-hover:translate-x-1 group-hover:text-paper"
          style={{ letterSpacing: "0.18em" }}
        >
          →
        </span>
      </button>

      {toast && (
        <div
          className="mt-3 flex items-center gap-2 fade-up"
          style={{ animationDuration: "400ms" }}
        >
          <span className="stamp" style={{ color: "var(--sec-forecast)" }}>
            Logged
          </span>
          <span className="meta">→ § III Forecast</span>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-6">
          {/* Backdrop — captures clicks outside */}
          <div
            className="absolute inset-0 bg-paper/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Perforated slip — centered modal, clamped to the viewport so it
              never spills off the narrow marginalia column's right edge. */}
          <div
            role="dialog"
            aria-modal="true"
            className="slip relative z-10 max-h-[calc(100vh-3rem)] w-[360px] max-w-[calc(100vw-3rem)] space-y-5 overflow-auto px-6 py-7 fade-up"
            style={{ animationDuration: "350ms" }}
          >
            <div className="absolute right-6 top-3 flex items-baseline gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-ink-dim">
              <span>Slip</span>
              <span className="text-ink-faint">№</span>
              <span className="tabular-nums">{new Date().toISOString().slice(2, 10).replace(/-/g, "")}</span>
            </div>

            <div className="pt-2">
              <div className="eyebrow mb-2">Log forecast from run</div>
              <h3
                className="font-display text-[20px] italic leading-tight text-ink"
                style={{ fontVariationSettings: '"opsz" 28, "wght" 380' }}
              >
                A wager, committed.
              </h3>
            </div>

            <div className="rule" style={{ background: "var(--sec-mc)", opacity: 0.4 }} />

            <div>
              <label htmlFor="mc-log-threshold" className="eyebrow mb-1 block">
                Threshold
              </label>
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
                className="w-full border-0 border-b border-ink-faint bg-transparent px-0 pb-1 font-mono text-[14px] tabular-nums text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="mc-log-question" className="eyebrow mb-1 block">
                Question
              </label>
              <textarea
                id="mc-log-question"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={3}
                className="w-full resize-none border-0 border-b border-ink-faint bg-transparent px-0 pb-1 font-display italic text-[15px] leading-snug text-ink focus:border-ink focus:outline-none"
                style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="mc-log-prob" className="eyebrow mb-1 block">
                  Probability
                </label>
                <div className="flex items-baseline gap-1">
                  <input
                    id="mc-log-prob"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={probability}
                    onChange={(e) => setProbability(parseFloat(e.target.value) || 0)}
                    className="w-full border-0 border-b border-ink-faint bg-transparent px-0 pb-1 font-display text-[28px] leading-none tabular-nums text-ink focus:border-ink focus:outline-none"
                    style={{ fontVariationSettings: '"opsz" 40, "wght" 320' }}
                  />
                  <span className="font-mono text-[11px] text-ink-dim">%</span>
                </div>
                <div className="meta mt-1">
                  empirical: {(suggestedProb * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <label htmlFor="mc-log-resolve" className="eyebrow mb-1 block">
                  Resolve by
                </label>
                <input
                  id="mc-log-resolve"
                  type="date"
                  value={resolveByDate}
                  onChange={(e) => setResolveByDate(e.target.value)}
                  className="w-full border-0 border-b border-ink-faint bg-transparent px-0 pb-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-5 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={busy || !questionText.trim()}
                className="border border-ink bg-ink px-5 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper"
              >
                {busy ? "…" : "Commit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
