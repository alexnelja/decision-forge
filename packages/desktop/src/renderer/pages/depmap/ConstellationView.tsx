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

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import ForceGraph3D from "react-force-graph-3d";
// three-spritetext: small dep (same author as react-force-graph), provides
// a three.js Sprite subclass that renders text labels in 3D space.
// jsdom cannot import this — it is only evaluated at runtime when the user
// clicks [3D], which happens outside the unit test environment.
import SpriteText from "three-spritetext";
import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import type { Analysis } from "./useAnalysis";
import {
  PLUS_HEX,
  MINUS_HEX,
  NEUTRAL_HEX,
} from "./edge-style";

// --- colour palette (mirrors CSS custom-props palette) ----------------------
const COLOR_ROOT    = "#c4d82e"; // citron  — root nodes (drivers with no drivers above them)
const COLOR_LEAF    = "#6fa88a"; // sage    — leaf nodes (outcomes with nothing they drive)
const COLOR_CYCLE   = "#e8582b"; // vermilion — nodes in a cycle
const COLOR_DEFAULT = "#8f7ae6"; // iris    — everything else
const COLOR_DIM     = "rgba(143,122,230,0.18)"; // dimmed link colour
const BG_COLOR      = "#0d0c0a"; // almost-black background

// --ink raw value (#f1ece0) — used for 3D sprite text colour.
// three.js materials cannot resolve CSS custom properties, so we use the raw
// hex. Keep in sync with index.css (--ink: #f1ece0).
const INK_COLOR = "#f1ece0";

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
  // Measure the container so ForceGraph3D gets explicit w/h (prevents overflow).
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 600,
    height: 480,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setDims({ width: el.clientWidth, height: el.clientHeight });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Build edge sign lookup: edgeId → sign
  const edgeSignMap = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const e of map.edges) {
      // key: "from::to" because react-force-graph-3d resolves link source/target to objects
      m.set(`${e.from}::${e.to}`, e.sign);
    }
    return m;
  }, [map.edges]);

  // Note: assumption-edge dashing is not implemented in 3D — see comment above.
  // edgeConfMap is not needed since linkLineDash is absent from the 3D type API.

  const graphData = useMemo(() => ({
    nodes: map.nodes.map((n) => ({ id: n.id, name: n.label })),
    links: map.edges.map((e) => ({ source: e.from, target: e.to, id: e.id })),
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

  /**
   * nodeThreeObject: returns a SpriteText label positioned below the sphere.
   * nodeThreeObjectExtend={true} keeps the existing sphere in addition to this
   * extra object.
   *
   * textHeight ≈ 4 gives readable but compact labels at the default camera distance.
   * material.depthWrite = false prevents z-fighting with sphere surfaces.
   * --ink (#f1ece0) matches the cream foreground colour used throughout the UI.
   *
   * SpriteText extends three.js Sprite (which extends Object3D) — position and
   * material are inherited but absent from the hand-written SpriteText .d.ts;
   * cast through `unknown` to avoid type errors while keeping runtime correct.
   */
  const nodeThreeObject = useCallback((node: { id?: string | number; name?: string }) => {
    const label = String(node.name ?? node.id ?? "");
    const sprite = new SpriteText(label);
    sprite.textHeight = 4;
    sprite.color = INK_COLOR;
    // SpriteText uses offsetY (its own API) for vertical offset relative to the
    // attachment point. Negative value moves the label downward.
    sprite.offsetY = -8;
    // Prevent z-fighting with sphere surfaces. SpriteText inherits `material`
    // from three.js Sprite/Object3D; cast is safe at runtime.
    const mat = (sprite as unknown as { material?: { depthWrite?: boolean } }).material;
    if (mat) mat.depthWrite = false;
    return sprite;
  }, []);

  /** Link colour: sign polarity + fade links not connected to selected neighbourhood.
   *
   * three.js materials cannot resolve CSS custom properties (e.g. "var(--plus)")
   * so we use the raw hex constants exported from edge-style.ts.
   * See the comment in edge-style.ts about this exact usage.
   */
  const linkColor = useCallback((link: { source?: unknown; target?: unknown }) => {
    const src = typeof link.source === "object" && link.source !== null
      ? String((link.source as { id?: unknown }).id ?? "")
      : String(link.source ?? "");
    const tgt = typeof link.target === "object" && link.target !== null
      ? String((link.target as { id?: unknown }).id ?? "")
      : String(link.target ?? "");

    // Dim links outside the selected neighbourhood
    if (selectedId && downstream && upstream) {
      const srcActive = src === selectedId || downstream.has(src) || upstream.has(src);
      const tgtActive = tgt === selectedId || downstream.has(tgt) || upstream.has(tgt);
      if (!srcActive && !tgtActive) return COLOR_DIM;
    }

    // Sign polarity: use raw hex (three.js can't read CSS vars)
    const sign = edgeSignMap.get(`${src}::${tgt}`);
    if (sign === "+") return PLUS_HEX;
    if (sign === "-") return MINUS_HEX;
    return NEUTRAL_HEX;
  }, [selectedId, downstream, upstream, edgeSignMap]);

  // Note: react-force-graph-3d uses three.js tube geometry for links, which
  // does NOT support CSS-style dash arrays (linkLineDash is absent from the
  // ForceGraph3D type definitions and from the underlying three.js line rendering
  // path). Assumption-edge dashing is therefore not implemented in the 3D view.
  // The 2D LayeredView retains dashed assumption edges via react-flow SVG edges.
  // A future implementation could use `linkMaterial` + LineDashedMaterial, but
  // that requires computing dash offsets per-frame — deferred.

  const handleNodeClick = useCallback((node: { id?: string | number }) => {
    const id = String(node.id ?? "");
    if (id) onSelect(id);
  }, [onSelect]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: "480px", background: BG_COLOR }}
    >
      <ForceGraph3D
        graphData={graphData}
        backgroundColor={BG_COLOR}
        width={dims.width || undefined}
        height={dims.height || undefined}
        nodeId="id"
        nodeLabel="name"
        nodeColor={nodeColor}
        nodeOpacity={nodeOpacity}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={true}
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
