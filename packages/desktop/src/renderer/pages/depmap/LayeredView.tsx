import "reactflow/dist/style.css";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type NodeDragHandler,
} from "reactflow";

import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import { layoutPositions } from "./layout";
import type { Analysis } from "./useAnalysis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayeredViewProps {
  map: DependencyMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddEdge: (from: string, to: string) => void;
  analysis: Analysis;
  onUpdateNodePosition: (id: string, pos: { x: number; y: number }) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onRelayout: (positions: Map<string, { x: number; y: number }>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build neighbour set (direct in + out) for ego-highlight. */
function directNeighbours(map: DependencyMap, nodeId: string): Set<string> {
  const neighbours = new Set<string>();
  for (const e of map.edges) {
    if (e.from === nodeId) neighbours.add(e.to);
    if (e.to === nodeId) neighbours.add(e.from);
  }
  return neighbours;
}

/**
 * Compute a string that captures the STRUCTURAL identity of the map —
 * sorted node-ids + sorted edge-ids.  Used as a useEffect dependency so
 * the position-sync fires only when topology changes (add/delete/load),
 * NOT when selection or hover changes.
 */
function structuralKey(map: DependencyMap): string {
  const nodeIds = map.nodes.map((n) => n.id).sort().join(",");
  const edgeIds = map.edges.map((e) => e.id).sort().join("|");
  return `${nodeIds}::${edgeIds}`;
}

// ---------------------------------------------------------------------------
// Inner component (needs to be inside ReactFlowProvider to use useReactFlow)
// ---------------------------------------------------------------------------

function LayeredViewInner({
  map,
  selectedId,
  onSelect,
  onAddEdge,
  analysis,
  onUpdateNodePosition,
  onDeleteNode,
  onDeleteEdge,
  onRelayout,
}: LayeredViewProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  // Track the last structural key so we can skip the structural sync when only
  // style/selection changed.
  const prevStructKey = useRef<string>("");

  // ── Effect 1: STRUCTURAL SYNC ───────────────────────────────────────────
  // Fires when topology (node/edge set) changes.  Responsible for:
  //   - initialising positions (saved → existing RF position → dagre)
  //   - building edge objects
  //   - calling fitView after a fresh load or tidy
  // This effect NEVER touches styles — it sets the minimal node object so that
  // the style effect below can paint over it without losing position data.
  const structKey = structuralKey(map);
  useEffect(() => {
    if (structKey === prevStructKey.current) return; // topology unchanged
    prevStructKey.current = structKey;

    const dagrePositions = layoutPositions(map.nodes, map.edges);

    setRfNodes((currentRfNodes) => {
      // Build an id → current RF node lookup so we can preserve dragged positions.
      const currentById = new Map<string, Node>(
        currentRfNodes.map((n) => [n.id, n])
      );

      return map.nodes.map((mapNode) => {
        // Priority: saved position in schema > current RF position (drag) > dagre
        const pos =
          mapNode.position ??
          currentById.get(mapNode.id)?.position ??
          dagrePositions.get(mapNode.id) ??
          { x: 0, y: 0 };

        return {
          id: mapNode.id,
          position: pos,
          data: { label: mapNode.label },
          // Minimal style — will be overwritten by the style effect below,
          // but we supply defaults so nodes are visible immediately.
          style: {
            background: "var(--paper-raised)",
            color: "var(--ink)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "var(--font-display, inherit)",
            padding: "6px 12px",
          },
        };
      });
    });

    const nodeIds = new Set(map.nodes.map((n) => n.id));
    setRfEdges(
      map.edges
        .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
        .map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--ink-dim)",
          },
          style: {
            stroke: "var(--ink-dim)",
            strokeWidth: 1.5,
          },
        }))
    );

    // Fit view after a topology change (load or add/delete nodes).
    // Small timeout lets RF finish painting the new nodes before measuring.
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [structKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: STYLE SYNC ────────────────────────────────────────────────
  // Fires when visual state changes (selection, hover, analysis).
  // Uses functional updaters so it NEVER clobbers positions.
  useEffect(() => {
    const { cycleNodeIds, cycleEdgeIds, graphInput } = analysis;
    const rootSet = new Set(analysis.roots);
    const leafSet = new Set(analysis.leaves);

    const downstream = selectedId
      ? reachDownstream(graphInput, selectedId)
      : new Set<string>();
    const upstream = selectedId
      ? reachUpstream(graphInput, selectedId)
      : new Set<string>();

    const hoverNeighbours =
      hoveredId && !selectedId ? directNeighbours(map, hoveredId) : null;

    setRfNodes((nds) =>
      nds.map((n) => {
        const id = n.id;
        const isCycle = cycleNodeIds.has(id);
        const isRoot = rootSet.has(id);
        const isLeaf = leafSet.has(id);
        const isSelected = id === selectedId;
        const isDownstream = selectedId ? downstream.has(id) : false;
        const isUpstream = selectedId ? upstream.has(id) : false;

        let opacity = 1;
        if (selectedId) {
          if (!isSelected && !isDownstream && !isUpstream) opacity = 0.2;
        } else if (hoverNeighbours && hoveredId) {
          if (id !== hoveredId && !hoverNeighbours.has(id)) opacity = 0.25;
        }

        let borderColor = "var(--paper-rule)";
        let boxShadow = "none";
        if (isCycle) {
          borderColor = "var(--sec-nego)";
          boxShadow = "0 0 0 1.5px var(--sec-nego)";
        } else if (isSelected) {
          borderColor = "var(--sec-depmap)";
          boxShadow = "0 0 0 2px var(--sec-depmap)";
        } else if (isDownstream) {
          borderColor = "var(--sec-depmap)";
          boxShadow = "0 0 0 1px var(--sec-depmap)";
        } else if (isUpstream) {
          borderColor = "var(--ink-dim)";
        } else if (isRoot) {
          borderColor = "var(--sec-mc)";
          boxShadow = "0 0 0 2px var(--sec-mc)";
        } else if (isLeaf) {
          borderColor = "var(--sec-forecast)";
          boxShadow = "0 0 0 2px var(--sec-forecast)";
        }

        return {
          ...n,
          data: { label: map.nodes.find((mn) => mn.id === id)?.label ?? n.data.label },
          style: {
            background: "var(--paper-raised)",
            color: "var(--ink)",
            border: `1px solid ${borderColor}`,
            boxShadow,
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "var(--font-display, inherit)",
            padding: "6px 12px",
            opacity,
            transition: "opacity 0.15s ease, box-shadow 0.15s ease",
          },
        };
      })
    );

    setRfEdges((eds) =>
      eds.map((e) => {
        const isCycleEdge = cycleEdgeIds.has(e.id);
        const color = isCycleEdge ? "var(--sec-nego)" : "var(--ink-dim)";

        let edgeOpacity = 1;
        if (selectedId) {
          const fromActive =
            e.source === selectedId ||
            downstream.has(e.source) ||
            upstream.has(e.source);
          const toActive =
            e.target === selectedId ||
            downstream.has(e.target) ||
            upstream.has(e.target);
          if (!fromActive && !toActive) edgeOpacity = 0.1;
        } else if (hoverNeighbours && hoveredId) {
          const fromActive =
            e.source === hoveredId || hoverNeighbours.has(e.source);
          const toActive =
            e.target === hoveredId || hoverNeighbours.has(e.target);
          if (!fromActive && !toActive) edgeOpacity = 0.1;
        }

        return {
          ...e,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: {
            stroke: color,
            strokeWidth: isCycleEdge ? 2 : 1.5,
            opacity: edgeOpacity,
            transition: "opacity 0.15s ease",
          },
        };
      })
    );
  }, [analysis, selectedId, hoveredId, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onAddEdge(connection.source, connection.target);
      }
    },
    [onAddEdge]
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      onSelect(node.id);
    },
    [onSelect]
  );

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_evt, node) => {
      onUpdateNodePosition(node.id, node.position);
    },
    [onUpdateNodePosition]
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleted.forEach((n) => onDeleteNode(n.id));
    },
    [onDeleteNode]
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((e) => onDeleteEdge(e.id));
    },
    [onDeleteEdge]
  );

  const handleNodeMouseEnter: NodeMouseHandler = useCallback(
    (_evt, node) => {
      setHoveredId(node.id);
    },
    []
  );

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handleTidy = useCallback(() => {
    const positions = layoutPositions(map.nodes, map.edges);
    setRfNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      })
    );
    onRelayout(positions);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [map.nodes, map.edges, onRelayout, setRfNodes, fitView]);

  const showHairballNotice = map.nodes.length > 20 && !selectedId;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "480px",
        position: "relative",
      }}
    >
      {showHairballNotice && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            right: 0,
            zIndex: 10,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              background: "var(--paper-raised)",
              border: "1px solid var(--paper-rule)",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              color: "var(--ink-dim)",
            }}
          >
            Getting dense — select a node to focus
          </span>
        </div>
      )}

      {/* Tidy button — explicit dagre relayout, does NOT fire on every render */}
      <button
        onClick={handleTidy}
        title="Re-run auto-layout (Tidy)"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          background: "var(--paper-raised)",
          color: "var(--ink-dim)",
          border: "1px solid var(--paper-rule)",
          borderRadius: "4px",
          padding: "3px 8px",
          fontSize: "11px",
          cursor: "pointer",
          fontFamily: "var(--font-display, inherit)",
        }}
      >
        Tidy
      </button>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode="Backspace"
      >
        <Background color="var(--paper-rule)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component: wraps inner in ReactFlowProvider so useReactFlow works
// ---------------------------------------------------------------------------

export function LayeredView(props: LayeredViewProps) {
  return (
    <ReactFlowProvider>
      <LayeredViewInner {...props} />
    </ReactFlowProvider>
  );
}
