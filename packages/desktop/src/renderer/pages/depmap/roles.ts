/**
 * roles.ts — shared role definitions for the Decision Map.
 *
 * Extracted so NodeInspector's radio row and ContextMenu's role submenu
 * use the same options list without duplication.
 */

export type NodeRole = "objective" | "lever" | "uncertainty" | "factor";

export interface RoleOption {
  value: NodeRole;
  /** Short label shown in menus / radio rows. */
  label: string;
  /** Unicode glyph displayed on nodes and in the ReadoutPanel. */
  glyph: string;
  /** Plain-language explanation shown in inspector, menu tooltips, and readout legend. */
  description: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: "factor",      label: "Factor (default)", glyph: "",  description: "A thing that matters in this decision (default)." },
  { value: "objective",   label: "◎ Objective",      glyph: "◎", description: "The outcome you're deciding for — what success means." },
  { value: "lever",       label: "◆ Lever",           glyph: "◆", description: "Something you can directly act on or change." },
  { value: "uncertainty", label: "? Uncertainty",     glyph: "?", description: "An unknown that will resolve over time — watch or hedge." },
];

/**
 * Glyph for a role — single source of truth for node bodies (FactorNode),
 * the ReadoutPanel section headers and any future surfaces.
 * Returns undefined for "factor"/absent (factors carry no glyph).
 */
export function roleGlyph(role: NodeRole | undefined): string | undefined {
  if (!role) return undefined;
  return ROLE_OPTIONS.find((o) => o.value === role)?.glyph || undefined;
}
