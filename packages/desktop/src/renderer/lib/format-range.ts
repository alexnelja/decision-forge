/**
 * formatRange — shared number formatter for MC range chips and readout suffixes.
 * Uses Intl.NumberFormat with maximumSignificantDigits: 3 so large and small
 * values are both readable (e.g. 1,430 and 14.3 both → 3 significant digits).
 */
const _fmt = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });

export function formatRange(n: number): string {
  return _fmt.format(n);
}

/**
 * formatRangeTriple — returns the canonical "p10 · p50 · p90" display string
 * used in canvas chips, inspector summaries, and readout rows.
 */
export function formatRangeTriple(summary: { p10: number; p50: number; p90: number }): string {
  return `${formatRange(summary.p10)} · ${formatRange(summary.p50)} · ${formatRange(summary.p90)}`;
}
