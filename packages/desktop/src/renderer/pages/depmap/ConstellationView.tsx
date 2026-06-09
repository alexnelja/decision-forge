/**
 * ConstellationView — 3D force-graph overview of the dependency map.
 *
 * Lazy-loaded (react-force-graph-3d pulls three.js ~600 kB): this file must
 * only be imported via React.lazy() so three stays in its own split chunk.
 *
 * WebGL does not work in jsdom — do NOT unit-test this component directly.
 * The Suspense branch in DependencyMap is never triggered in jsdom tests, so
 * lazy-importing it is safe.
 */

import { useMemo, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import type { Analysis } from "./useAnalysis";

// --- colour palette (mirrors CSS custom-props palette) ----------------------
const COLOR_ROOT   = "#c4d82e"; // citron  — root nodes (drivers with no drivers above them)
const COLOR_LEAF   = "#6fa88a"; // sage    — leaf nodes (outcomes with nothing they drive)
const COLOR_CYCLE  = "#e8582b"; // vermilion — nodes in a cycle
const COLOR_DEFAULT = "#8f7ae6"; // iris    — everything else
const COLOR_DIM    = "rgba(143,122,230,0.18)"; // dimmed link colour
const COLOR_LINK   = "rgba(200,196,220,0.85)"; // default link colour — raised so lines are visible
const BG_COLOR     = "#0d0c0a"; // almost-black background

// ---------------------------------------------------------------------------

interface ConstellationViewProps {
  map: DependencyMap;
  analysis: Analysis;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ConstellationView({
  map,
  analysis,
  selectedId,
  onSelect,
}: ConstellationViewProps) {
  const { cycleNodeIds, graphInput } = analysis;
  const rootSet = useMemo(() => new Set(analysis.roots), [analysis.roots]);
  const leafSet = useMemo(() => new Set(analysis.leaves), [analysis.leaves]);

  // Reachability sets for depth-fade when a node is selected.
  const { downstream, upstream } = useMemo(() => {
    if (!selectedId) return { downstream: null, upstream: null };
    return {
      downstream: reachDownstream(graphInput, selectedId),
      upstream: reachUpstream(graphInput, selectedId),
    };
  }, [selectedId, graphInput]);

  const graphData = useMemo(() => ({
    nodes: map.nodes.map((n) => ({ id: n.id, name: n.label })),
    links: map.edges.map((e) => ({ source: e.from, target: e.to })),
  }), [map.nodes, map.edges]);

  /** Node colour: role-based, dimmed when a different node is selected and
   *  this one is not in the blast-radius. */
  const nodeColor = useCallback((node: { id?: string | number }) => {
    const id = String(node.id ?? "");
    if (cycleNodeIds.has(id)) return COLOR_CYCLE;
    if (rootSet.has(id))     return COLOR_ROOT;
    if (leafSet.has(id))     return COLOR_LEAF;
    return COLOR_DEFAULT;
  }, [cycleNodeIds, rootSet, leafSet]);

  /** Node opacity: dim non-neighbours when something is selected. */
  const nodeOpacity = useMemo(() => {
    if (!selectedId || !downstream || !upstream) return 0.9;
    // We can't pass per-node opacity via nodeOpacity (it's scalar) so we encode
    // it through nodeColor alpha. But react-force-graph-3d's nodeColor takes a
    // hex/string and the 3D sphere material ignores the alpha channel.
    // Instead, we achieve depth-fade through linkColor and note in comments that
    // full per-node alpha requires a custom nodeThreeObject — deferred to v1.1.
    return 0.9;
  }, [selectedId, downstream, upstream]);

  /** Link colour: fade links not connected to the selected node's neighbourhood. */
  const linkColor = useCallback((link: { source?: unknown; target?: unknown }) => {
    if (!selectedId || !downstream || !upstream) return COLOR_LINK;
    const src = typeof link.source === "object" && link.source !== null
      ? String((link.source as { id?: unknown }).id ?? "")
      : String(link.source ?? "");
    const tgt = typeof link.target === "object" && link.target !== null
      ? String((link.target as { id?: unknown }).id ?? "")
      : String(link.target ?? "");
    const srcActive = src === selectedId || downstream.has(src) || upstream.has(src);
    const tgtActive = tgt === selectedId || downstream.has(tgt) || upstream.has(tgt);
    if (!srcActive && !tgtActive) return COLOR_DIM;
    return COLOR_LINK;
  }, [selectedId, downstream, upstream]);

  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    const id = String(node.id ?? "");
    if (id) onSelect(id);
  }, [onSelect]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "480px", background: BG_COLOR }}>
      <ForceGraph3D
        graphData={graphData}
        backgroundColor={BG_COLOR}
        nodeId="id"
        nodeLabel="name"
        nodeColor={nodeColor}
        nodeOpacity={nodeOpacity}
        linkColor={linkColor}
        linkWidth={1}
        linkOpacity={0.55}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        showNavInfo={false}
      />
    </div>
  );
}
