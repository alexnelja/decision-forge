/**
 * formatRange — shared number formatter for MC range chips and readout suffixes.
 * Uses Intl.NumberFormat with maximumSignificantDigits: 3 so large and small
 * values are both readable (e.g. 1,430 and 14.3 both → 3 significant digits).
 */
const _fmt = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });

export function formatRange(n: number): string {
  return _fmt.format(n);
}
