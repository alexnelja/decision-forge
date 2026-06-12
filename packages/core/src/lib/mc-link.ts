// packages/core/src/lib/mc-link.ts
import type { Distribution } from "../schemas/mc-config.js";

/**
 * Names that would break or shadow the py-engine formula evaluator
 * (packages/py-engine/decision_forge/mc/evaluate.py): Python keywords that
 * survive the slug shape, plus the evaluator's _SAFE_GLOBALS entries
 * (math, np, min, max, abs). Suffixed with `_` — still a valid identifier.
 */
const RESERVED = new Set([
  // Python keywords (lowercase forms the slug can produce)
  "lambda", "and", "or", "not", "if", "else", "for", "in", "is",
  "def", "return", "none", "true", "false",
  // evaluator safe globals
  "math", "np", "min", "max", "abs"
]);

/**
 * Derive a § I variable identifier from a node label.
 * Contract: result ALWAYS matches /^[A-Za-z][A-Za-z0-9_]*$/ (MCVariableSchema.name)
 * and is not in `taken`.
 */
export function mcVarName(label: string, taken: ReadonlySet<string>): string {
  let slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")   // non-alphanumerics → _ (collapses runs)
    .replace(/^_+|_+$/g, "");       // trim underscores
  if (!/^[a-z]/.test(slug)) slug = slug ? `v_${slug}` : "v";
  if (RESERVED.has(slug)) slug = `${slug}_`;
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}_${i}`)) i++;
  return `${slug}_${i}`;
}

/** The push action seeds {triangular 0/0/0}; that exact shape means "not yet
 *  configured" — a UX state, not a schema failure. */
export function isUnconfiguredDistribution(d: Distribution): boolean {
  return d.kind === "triangular" && d.min === 0 && d.mode === 0 && d.max === 0;
}
