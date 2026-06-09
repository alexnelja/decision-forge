import "reactflow/dist/style.css";

import { useMemo, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
} from "reactflow";

import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import { layoutPositions } from "./layout";
import type { Analysis } from "./useAnalysis";

interface LayeredViewProps {
  map: DependencyMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddEdge: (from: string, to: string) => void;
  analysis: Analysis;
}

/** Build neighbour set (direct in + out) for ego-highlight. */
function directNeighbours(
  map: DependencyMap,
  nodeId: string
): Set<string> {
  const neighbours = new Set<string>();
  for (const e of map.edges) {
    if (e.from === nodeId) neighbours.add(e.to);
    if (e.to === nodeId) neighbours.add(e.from);
  }
  return neighbours;
}

/** Convert DependencyMap to react-flow nodes + edges with dagre layout + structural styling. */
function buildFlowGraph(
  map: DependencyMap,
  analysis: Analysis,
  selectedId: string | null,
  hoveredId: string | null
): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutPositions(map.nodes, map.edges);
  const { cycleNodeIds, cycleEdgeIds, graphInput } = analysis;
  const rootSet = new Set(analysis.roots);
  const leafSet = new Set(analysis.leaves);

  // Downstream / upstream of selected (for blast-radius highlight)
  const downstream = selectedId ? reachDownstream(graphInput, selectedId) : new Set<string>();
  const upstream = selectedId ? reachUpstream(graphInput, selectedId) : new Set<string>();

  // Ego-highlight neighbours when hovering (no selection active)
  const hoverNeighbours = hoveredId && !selectedId
    ? directNeighbours(map, hoveredId)
    : null;

  const nodeIds = new Set(map.nodes.map((n) => n.id));

  // Build nodes
  const nodes: Node[] = map.nodes.map((n) => {
    const isCycle = cycleNodeIds.has(n.id);
    const isRoot = rootSet.has(n.id);
    const isLeaf = leafSet.has(n.id);
    const isSelected = n.id === selectedId;
    const isDownstream = selectedId ? downstream.has(n.id) : false;
    const isUpstream = selectedId ? upstream.has(n.id) : false;

    // Opacity rules:
    // - Selection mode: selected + downstream + upstream = full; rest = dimmed
    // - Hover mode: hovered + neighbours = full; rest = dimmed
    // - No selection/hover: all full
    let opacity = 1;
    if (selectedId) {
      if (!isSelected && !isDownstream && !isUpstream) opacity = 0.2;
    } else if (hoverNeighbours && hoveredId) {
      if (n.id !== hoveredId && !hoverNeighbours.has(n.id)) opacity = 0.25;
    }

    // Border / ring color
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
      id: n.id,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.label },
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
  });

  // Build edges
  const edges: Edge[] = map.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => {
      const isCycleEdge = cycleEdgeIds.has(e.id);
      const color = isCycleEdge ? "var(--sec-nego)" : "var(--ink-dim)";

      // Dim edge if both endpoints are dimmed
      let edgeOpacity = 1;
      if (selectedId) {
        const fromActive = e.from === selectedId || downstream.has(e.from) || upstream.has(e.from);
        const toActive = e.to === selectedId || downstream.has(e.to) || upstream.has(e.to);
        if (!fromActive && !toActive) edgeOpacity = 0.1;
      } else if (hoverNeighbours && hoveredId) {
        const fromActive = e.from === hoveredId || hoverNeighbours.has(e.from);
        const toActive = e.to === hoveredId || hoverNeighbours.has(e.to);
        if (!fromActive && !toActive) edgeOpacity = 0.1;
      }

      return {
        id: e.id,
        source: e.from,
        target: e.to,
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: {
          stroke: color,
          strokeWidth: isCycleEdge ? 2 : 1.5,
          opacity: edgeOpacity,
          transition: "opacity 0.15s ease",
        },
      };
    });

  return { nodes, edges };
}

export function LayeredView({
  map,
  selectedId,
  onSelect,
  onAddEdge,
  analysis,
}: LayeredViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Full graph memoised: recompute when map or analysis or selection/hover changes.
  const { nodes, edges } = useMemo(
    () => buildFlowGraph(map, analysis, selectedId, hoveredId),
    [map, analysis, selectedId, hoveredId]
  );

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

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_evt, node) => {
    setHoveredId(node.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null);
  }, []);

  const showHairballNotice = map.nodes.length > 20 && !selectedId;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "480px", position: "relative" }}>
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
      >
        <Background color="var(--paper-rule)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
