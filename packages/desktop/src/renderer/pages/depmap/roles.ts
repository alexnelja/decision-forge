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
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: "factor",      label: "Factor (default)", glyph: "" },
  { value: "objective",   label: "◎ Objective",      glyph: "◎" },
  { value: "lever",       label: "◆ Lever",           glyph: "◆" },
  { value: "uncertainty", label: "? Uncertainty",     glyph: "?" },
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
