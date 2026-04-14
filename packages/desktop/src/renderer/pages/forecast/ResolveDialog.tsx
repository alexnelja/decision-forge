import { useState } from "react";
import { forecastApi, isoNow } from "../../lib/forecast-api";
import type { QuestionRow } from "../../lib/forecast-api";

export function ResolveDialog({
  question,
  onClose,
  onResolved
}: {
  question: QuestionRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit(outcome: 0 | 1) {
    if (busy) return;
    setBusy(true);
    try {
      await forecastApi.resolve({
        questionId: question.id,
        outcome,
        resolvedAt: isoNow(),
        notes: notes.trim() || undefined
      });
      onResolved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Resolve question"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-xl w-full mx-6 p-8 border border-paper-rule bg-paper-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow mb-4" style={{ color: "var(--sec-forecast)" }}>
          Resolve
        </div>
        <p
          className="font-display text-[22px] leading-[1.25] text-ink mb-2"
          style={{ fontVariationSettings: '"opsz" 28, "wght" 380' }}
        >
          {question.text}
        </p>
        <div className="meta mb-8">
          Predicted:{" "}
          <span className="text-ink">
            {question.latestProbability !== null
              ? `${Math.round(question.latestProbability * 100)}%`
              : "—"}
          </span>
          {"  ·  "}
          Resolves: <span className="text-ink">{question.resolveBy.slice(0, 10)}</span>
        </div>

        <label className="eyebrow block mb-1">Notes (optional)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-transparent border-b border-paper-rule outline-none font-display text-[13px] text-ink py-1 mb-6 resize-none"
        />

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => commit(1)}
            className="py-3 border eyebrow disabled:opacity-40 hover:bg-section-forecast/10 transition-colors"
            style={{ borderColor: "var(--sec-forecast)", color: "var(--sec-forecast)" }}
          >
            It happened
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => commit(0)}
            className="py-3 border border-ink-faint eyebrow text-ink-dim hover:bg-ink-mute disabled:opacity-40 transition-colors"
          >
            It didn't
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-1 eyebrow text-ink-faint hover:text-ink-dim"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
