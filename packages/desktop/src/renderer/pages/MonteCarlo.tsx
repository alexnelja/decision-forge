import { useEffect, useRef, useState } from "react";
import type { MCConfig, MCRunResult, MCVariable } from "@decision-forge/core";
import type { DependencyMap } from "@decision-forge/core";
import { ModuleFrame } from "../components/ModuleFrame";
import { mcApi } from "../lib/mc-api";
import { setLatestMCVariables } from "../lib/mc-store";
import { useMcLinks } from "../lib/mc-link-store";
import { mapsApi } from "../lib/maps-api";
import { computeMcSummary } from "../lib/mc-summary";
import { VariableCard } from "./mc/VariableCard";
import { SimulationPanel } from "./mc/SimulationPanel";
import { LogForecastButton } from "./mc/LogForecastButton";

const DEFAULT_CONFIG: MCConfig = {
  variables: [
    { name: "revenue", distribution: { kind: "normal", mean: 100, sd: 15 } },
    { name: "cost", distribution: { kind: "triangular", min: 40, mode: 50, max: 70 } }
  ],
  formula: "revenue - cost",
  iterations: 10_000
};

/** Per-link metadata so we know how to write back + what to display.
 *  Only healthy links live here — broken links are promoted to ad-hoc. */
interface LinkedMeta {
  mapId: string;
  nodeId: string;
  label: string;
  note?: string;
}

export default function MonteCarlo() {
  const [variables, setVariables] = useState<MCVariable[]>(DEFAULT_CONFIG.variables);
  const [formula, setFormula] = useState(DEFAULT_CONFIG.formula);
  const [iterations, setIterations] = useState(DEFAULT_CONFIG.iterations);
  const [result, setResult] = useState<MCRunResult | null>(null);

  // Linked variables from § IV (mc-link-store)
  const links = useMcLinks();
  const [linkedVars, setLinkedVars] = useState<MCVariable[]>([]);
  const [linkedMeta, setLinkedMeta] = useState<Map<string, LinkedMeta>>(new Map());
  // Names of ad-hoc variables that USED to be linked (broken-link promotions);
  // drives the one-time "link broken — now ad-hoc" note on their cards.
  const [brokenNames, setBrokenNames] = useState<Set<string>>(new Set());

  // Cache maps by mapId so we don't re-load the same map repeatedly
  const mapCache = useRef<Map<string, DependencyMap | null>>(new Map());

  // Mirrors for queued write-throughs / async load paths (avoid stale closures)
  const linkedMetaRef = useRef(linkedMeta);
  linkedMetaRef.current = linkedMeta;
  const linkedVarsRef = useRef(linkedVars);
  linkedVarsRef.current = linkedVars;
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  // Single promise chain so write-throughs are SERIALIZED: each load sees the
  // previous save, so rapid successive edits never drop earlier patches.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  /** Broken link → genuinely ad-hoc: drop from the linked path, append to the
   *  ad-hoc array (edits stick, feed runs, name editable), flag the note.
   *  Prefers the CURRENT optimistic value over the failing write's payload so
   *  a superseded edit is never resurrected. */
  function promoteToAdHoc(varName: string, fallback: MCVariable) {
    const current =
      linkedVarsRef.current.find((v) => v.name === varName) ?? fallback;
    setLinkedVars((prev) => prev.filter((v) => v.name !== varName));
    setLinkedMeta((prev) => {
      const next = new Map(prev);
      next.delete(varName);
      return next;
    });
    setVariables((prev) =>
      prev.some((v) => v.name === varName) ? prev : [...prev, current]
    );
    setBrokenNames((prev) => new Set(prev).add(varName));
  }

  // Load linked variables from their map files whenever links change
  useEffect(() => {
    if (links.length === 0) {
      setLinkedVars([]);
      setLinkedMeta(new Map());
      return;
    }

    let cancelled = false;

    async function loadLinks() {
      const newVars: MCVariable[] = [];
      const newMeta = new Map<string, LinkedMeta>();
      const promotions: MCVariable[] = [];

      for (const link of links) {
        // Load (or use cached) map
        if (!mapCache.current.has(link.mapId)) {
          const map = await mapsApi.load(link.mapId).catch(() => null);
          mapCache.current.set(link.mapId, map);
        }
        const map = mapCache.current.get(link.mapId) ?? null;
        const node = map?.nodes.find((n) => n.id === link.nodeId);

        if (!map || !node?.mc) {
          // Broken link — map deleted, node gone, or mc removed.
          // Promote to ad-hoc with a placeholder (original unrecoverable).
          promotions.push({
            name: link.varName,
            distribution: { kind: "normal", mean: 0, sd: 1 }
          });
          continue;
        }

        // Key variable AND meta both off node.mc.varName (the persisted truth);
        // link.varName could drift from the map file and silently break the
        // badge + write-through pairing.
        const varName = node.mc.varName;

        // Dedup against existing ad-hoc names (mirrors the promotion branch):
        // a restored link must not coexist with its promoted twin under one
        // name — the ad-hoc variable stays authoritative for this session.
        if (variablesRef.current.some((v) => v.name === varName)) continue;

        newVars.push({ name: varName, distribution: node.mc.distribution });
        newMeta.set(varName, {
          mapId: link.mapId,
          nodeId: link.nodeId,
          label: node.label,
          note: node.note,
        });
      }

      if (!cancelled) {
        setLinkedVars(newVars);
        setLinkedMeta(newMeta);
        if (promotions.length > 0) {
          setVariables((prev) => {
            const existing = new Set(prev.map((v) => v.name));
            const toAdd = promotions.filter((p) => !existing.has(p.name));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });
          setBrokenNames((prev) => {
            const next = new Set(prev);
            for (const p of promotions) next.add(p.name);
            return next;
          });
        }
      }
    }

    // Invalidate the map cache when links change so we re-load fresh data
    mapCache.current.clear();
    void loadLinks();
    return () => { cancelled = true; };
  }, [links]);

  // Merged list: linked first, then ad-hoc
  const allVariables = [...linkedVars, ...variables];

  // Publish merged variables to the shared store so Negotiation can link a BATNA
  useEffect(() => {
    setLatestMCVariables(allVariables);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedVars, variables]);

  const config: MCConfig = { variables: allVariables, formula, iterations };

  async function handleRun(cfg: MCConfig): Promise<MCRunResult> {
    setFormula(cfg.formula);
    setIterations(cfg.iterations);
    const r = await mcApi.run(cfg);
    setResult(r);
    return r;
  }

  // --- Ad-hoc variable handlers (index-based into the ad-hoc array only) ---

  function updateVariable(index: number, updated: MCVariable) {
    setVariables((prev) => prev.map((v, i) => (i === index ? updated : v)));
  }

  function removeVariable(index: number) {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariable() {
    // Deduplicate against all linked varNames (they're persisted and win)
    const linkedNames = new Set(linkedVars.map((v) => v.name));
    setVariables((prev) => {
      // Find a name that doesn't collide with linked vars or existing ad-hoc vars
      const existing = new Set([
        ...linkedNames,
        ...prev.map((v) => v.name)
      ]);
      let candidate = `x${prev.length + 1}`;
      let i = prev.length + 1;
      while (existing.has(candidate)) {
        i++;
        candidate = `x${i}`;
      }
      return [
        ...prev,
        {
          name: candidate,
          distribution: { kind: "normal", mean: 0, sd: 1 }
        }
      ];
    });
  }

  // --- Linked variable write-through handler ---

  function updateLinkedVariable(varName: string, updated: MCVariable) {
    if (!linkedMetaRef.current.has(varName)) return;

    // Optimistic local update FIRST so rapid successive edits compose (the
    // next edit's onChange receives a distribution that includes this one).
    setLinkedVars((prev) =>
      prev.map((v) => (v.name === varName ? updated : v))
    );

    // Serialize write-throughs: each load sees the previous save.
    writeQueue.current = writeQueue.current
      .then(() => doWriteThrough(varName, updated))
      .catch(() => { /* keep the chain alive */ });
  }

  async function doWriteThrough(varName: string, updated: MCVariable) {
    // Re-read meta at execution time — the link may have been promoted to
    // ad-hoc (broken) by an earlier queued write.
    const meta = linkedMetaRef.current.get(varName);
    if (!meta) return;

    try {
      const map = await mapsApi.load(meta.mapId);
      const node = map?.nodes.find((n) => n.id === meta.nodeId);
      if (!map || !node?.mc) {
        // Map deleted (or node/mc gone) mid-session — fall back to ad-hoc,
        // preserving the user's edit. Never silently lost.
        promoteToAdHoc(varName, updated);
        return;
      }

      const newSummary = computeMcSummary(updated.distribution);

      const patchedMap: DependencyMap = {
        ...map,
        nodes: map.nodes.map((n) => {
          if (n.id !== meta.nodeId) return n;
          return {
            ...n,
            mc: {
              ...n.mc!,
              distribution: updated.distribution,
              summary: newSummary,
            },
          };
        }),
        updatedAt: new Date().toISOString(),
      };

      await mapsApi.save(patchedMap);

      // Update cache
      mapCache.current.set(meta.mapId, patchedMap);
    } catch {
      // Load/save failure — fall back to ad-hoc, preserving the user's edit.
      promoteToAdHoc(varName, updated);
    }
  }

  // Collect linked varNames to pass to SimulationPanel for the formula chip
  const linkedVarNames = linkedVars.map((v) => v.name);

  return (
    <ModuleFrame
      section="§ I"
      kicker="Uncertainty"
      title="Monte Carlo"
      accent="var(--sec-mc)"
      lede="Draw a distribution over every input you cannot pin down. Run the scenario ten thousand times. Read the shape of the possible, not the point."
      marginalia={
        <div className="space-y-7">
          {result && (
            <div>
              <div className="eyebrow mb-3">Commit to a wager</div>
              <LogForecastButton result={result} formula={formula} />
            </div>
          )}

          {result && <div className="rule" />}

          <div>
            <div className="eyebrow mb-3">Colophon</div>
            <p
              className="font-display italic text-[14px] leading-[1.55] text-ink-dim"
              style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
            >
              "The map is not the territory. A good simulation is the map that
              admits it."
            </p>
          </div>

          <div className="rule" />

          <div>
            <div className="eyebrow mb-3">Telemetry</div>
            <dl className="mt-1 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <dt className="text-ink-dim">trials</dt>
                <dd className="tabular-nums text-ink">
                  {iterations.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">variables</dt>
                <dd className="tabular-nums text-ink">{allVariables.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">resolved</dt>
                <dd className="text-ink">{result ? "✓" : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="rule" />

          <div>
            <div className="eyebrow mb-3">Deferred</div>
            <ul className="space-y-1.5 font-mono text-[10px] text-ink-faint">
              <li>— 3D particle cloud</li>
              <li>— SSE streaming progress</li>
              <li>— Sobol sensitivity</li>
              <li>— Compare-mode overlay</li>
              <li>— Correlations, PERT, empirical</li>
            </ul>
            <p className="meta mt-2 italic">Plan 3.5</p>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(300px,360px)_1fr] gap-12">
        {/* Inputs column */}
        <div className="space-y-5">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">I. Inputs</div>
            <span
              className="font-mono text-[10px] text-ink-faint tabular-nums"
              style={{ letterSpacing: "0.18em" }}
            >
              {allVariables.length.toString().padStart(2, "0")}
            </span>
          </div>

          {/* Linked variables — separate keyed path, never feed indices to ad-hoc handlers */}
          {linkedVars.map((v) => {
            const meta = linkedMeta.get(v.name);
            return (
              <VariableCard
                key={`linked:${v.name}`}
                variable={v}
                onChange={(updated) => updateLinkedVariable(v.name, updated)}
                onRemove={() => {
                  // unreachable: removable={false} hides the button
                }}
                linkedLabel={meta?.label}
                linkedNote={meta?.note}
                nameLocked
                removable={false}
              />
            );
          })}

          {/* Ad-hoc variables — index-based handlers into the ad-hoc array.
              Promoted broken-link variables render here, fully editable,
              with a one-time "link broken — now ad-hoc" note. */}
          {variables.map((v, i) => (
            <VariableCard
              key={`adhoc:${i}`}
              variable={v}
              onChange={(u) => updateVariable(i, u)}
              onRemove={() => removeVariable(i)}
              index={i}
              linkedBroken={brokenNames.has(v.name)}
            />
          ))}

          <button
            type="button"
            onClick={addVariable}
            className="group w-full border border-dashed border-ink-faint/60 bg-transparent px-4 py-4 text-left font-display italic text-[15px] text-ink-dim transition-all hover:border-ink hover:text-ink"
            style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
          >
            <span className="font-mono text-[11px] not-italic tracking-[0.2em] text-ink-faint group-hover:text-ink-dim">
              +
            </span>{" "}
            Append a variable
          </button>
        </div>

        {/* Engine column */}
        <div className="space-y-10">
          <div className="flex items-baseline justify-between border-b border-paper-rule pb-2">
            <div className="eyebrow">II. Engine</div>
            <span className="meta italic">Python sidecar · numpy-vectorised</span>
          </div>
          <SimulationPanel
            config={config}
            onRun={handleRun}
            linkedVarNames={linkedVarNames}
          />
        </div>
      </div>
    </ModuleFrame>
  );
}
