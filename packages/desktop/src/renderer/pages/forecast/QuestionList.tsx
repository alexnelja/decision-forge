import type { QuestionRow } from "../../lib/forecast-api";

function brierOf(q: QuestionRow): number | null {
  if (!q.resolved || q.latestProbability === null || q.outcome === null) return null;
  return (q.latestProbability - q.outcome) ** 2;
}

function brierColor(b: number): string {
  if (b < 0.05) return "var(--sec-forecast)";
  if (b < 0.2) return "var(--ink)";
  return "var(--sec-nego)";
}

export function QuestionList({
  rows,
  onResolve
}: {
  rows: QuestionRow[];
  onResolve: (q: QuestionRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center">
        <p
          className="font-display text-[17px] text-ink-dim"
          style={{ fontVariationSettings: '"opsz" 18, "wght" 350' }}
        >
          The ledger is ruled; no entries yet recorded.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-t border-b border-paper-rule">
          <th className="text-left eyebrow py-3 w-[48px]">№</th>
          <th className="text-left eyebrow py-3">Claim</th>
          <th className="text-right eyebrow py-3 w-[70px]">p</th>
          <th className="text-right eyebrow py-3 w-[110px]">Resolves</th>
          <th className="text-right eyebrow py-3 w-[90px]">Brier</th>
          <th className="text-right eyebrow py-3 w-[110px]"></th>
        </tr>
      </thead>
      <tbody className="font-display">
        {rows.map((q, i) => {
          const b = brierOf(q);
          return (
            <tr key={q.id} className="border-b border-paper-rule align-top">
              <td className="py-4 font-mono text-[12px] text-ink-faint tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </td>
              <td className="py-4 pr-6 text-[15px] max-w-[52ch]" style={{ fontVariationSettings: '"opsz" 16, "wght" 400' }}>
                <div className={q.resolved ? "text-ink-dim" : "text-ink"}>{q.text}</div>
                {q.tags.length > 0 && (
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {q.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] px-1.5 py-0.5 border border-paper-rule text-ink-dim rounded-sm"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-4 text-right font-mono text-[12px] text-ink tabular-nums">
                {q.latestProbability !== null
                  ? `${Math.round(q.latestProbability * 100)}%`
                  : "—"}
              </td>
              <td className="py-4 text-right font-mono text-[11px] text-ink-dim">
                {q.resolveBy.slice(0, 10)}
              </td>
              <td
                className="py-4 text-right font-mono text-[12px] tabular-nums"
                style={{ color: b !== null ? brierColor(b) : "var(--ink-faint)" }}
              >
                {b !== null ? b.toFixed(3) : "—"}
              </td>
              <td className="py-4 text-right">
                {q.resolved ? (
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: q.outcome === 1 ? "var(--sec-forecast)" : "var(--ink-faint)" }}
                  >
                    {q.outcome === 1 ? "✓ HAPPENED" : "✗ DIDN'T"}
                  </span>
                ) : (
                  <button
                    onClick={() => onResolve(q)}
                    className="eyebrow py-1 px-2 border border-paper-rule hover:border-section-forecast hover:text-section-forecast transition-colors"
                  >
                    Resolve
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
