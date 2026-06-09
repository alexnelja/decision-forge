import "reactflow/dist/style.css";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from "reactflow";

import type { DependencyMap } from "@decision-forge/core";
import { layoutPositions } from "./layout";

interface LayeredViewProps {
  map: DependencyMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddEdge: (from: string, to: string) => void;
}

/** Convert DependencyMap to react-flow nodes + edges with dagre layout. */
function toFlowGraph(map: DependencyMap): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutPositions(map.nodes, map.edges);

  const nodes: Node[] = map.nodes.map((n) => ({
    id: n.id,
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { label: n.label },
    style: {
      background: "var(--paper-raised)",
      color: "var(--ink)",
      border: "1px solid var(--paper-rule)",
      borderRadius: "4px",
      fontSize: "13px",
      fontFamily: "var(--font-display, inherit)",
      padding: "6px 12px",
    },
  }));

  // Defensive: drop edges referencing a since-deleted node so they don't break render.
  const nodeIds = new Set(map.nodes.map((n) => n.id));
  const edges: Edge[] = map.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--ink-dim)" },
      style: { stroke: "var(--ink-dim)", strokeWidth: 1.5 },
    }));

  return { nodes, edges };
}

export function LayeredView({
  map,
  selectedId,
  onSelect,
  onAddEdge,
}: LayeredViewProps) {
  // Memoize so dagre layout doesn't recompute on unrelated re-renders.
  const { nodes, edges } = useMemo(() => toFlowGraph(map), [map]);

  // Apply selection highlight (cheap; only recomputed when nodes/selection change).
  const styledNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.id === selectedId
          ? {
              ...n,
              style: {
                ...n.style,
                border: "1px solid var(--sec-depmap)",
                boxShadow: "0 0 0 2px var(--sec-depmap)",
              },
            }
          : n
      ),
    [nodes, selectedId]
  );

  function handleConnect(connection: Connection) {
    if (connection.source && connection.target) {
      onAddEdge(connection.source, connection.target);
    }
  }

  function handleNodeClick(_evt: React.MouseEvent, node: Node) {
    onSelect(node.id);
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "480px" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
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
