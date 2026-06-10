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
  type OnConnectStart,
} from "reactflow";

import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import { layoutPositions } from "./layout";
import type { Analysis } from "./useAnalysis";
import { FactorNode, type FactorNodeData } from "./FactorNode";
import { ContextMenu, type ContextMenuProps } from "./ContextMenu";

// ---------------------------------------------------------------------------
// Module-level nodeTypes constant — react-flow warns if this is defined inline
// ---------------------------------------------------------------------------

const nodeTypes = { factor: FactorNode };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayeredViewProps {
  map: DependencyMap;
  selectedId: string | null;
  renamingId?: string | null;
  onSelect: (id: string) => void;
  onAddEdge: (from: string, to: string) => void;
  analysis: Analysis;
  onUpdateNodePosition: (id: string, pos: { x: number; y: number }) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onRelayout: (positions: Map<string, { x: number; y: number }>) => void;
  // Task 5 new props
  onAddNodeAt: (label: string, pos: { x: number; y: number }) => void;
  onAddConnectedNodeAt: (sourceId: string, pos: { x: number; y: number }) => void;
  onDuplicateNode: (id: string) => void;
  onRenameNode: (id: string, label: string) => void;
  onCancelRename: (id: string) => void;
  onStartRename: (id: string) => void;
  onSetRole: (id: string, role: "objective" | "lever" | "uncertainty" | "factor") => void;
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
  renamingId = null,
  onSelect,
  onAddEdge,
  analysis,
  onUpdateNodePosition,
  onDeleteNode,
  onDeleteEdge,
  onRelayout,
  onAddNodeAt,
  onAddConnectedNodeAt,
  onDuplicateNode,
  onRenameNode,
  onCancelRename,
  onStartRename,
  onSetRole,
}: LayeredViewProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  // refs for onConnectEnd (v11 only provides the event, no connectionState)
  const connectStartRef = useRef<string | null>(null);
  const didConnectRef = useRef(false);

  // Track the last structural key so we can skip the structural sync when only
  // style/selection changed.
  const prevStructKey = useRef<string>("");

  // Deferred fitView scheduling: the 50 ms delay lets react-flow finish
  // painting before measuring, but an unguarded setTimeout could fire after
  // unmount. Keep the pending timer in a ref, clear any previous one before
  // scheduling a new one, and clear on unmount.
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFitView = useCallback(() => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => {
      fitTimerRef.current = null;
      fitView({ padding: 0.2 });
    }, 50);
  }, [fitView]);

  useEffect(
    () => () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    },
    []
  );

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
          type: "factor",
          position: pos,
          data: {
            label: mapNode.label,
            role: mapNode.role,
            // callbacks wired here so FactorNode can call back into DependencyMap
            onRename: onRenameNode,
            onCancelRename,
            onDuplicate: onDuplicateNode,
            onDelete: onDeleteNode,
          } satisfies FactorNodeData,
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
    scheduleFitView();
  }, [structKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: STYLE SYNC ────────────────────────────────────────────────
  // Fires when visual state changes (selection, hover, analysis, renamingId).
  // Sets data flags on nodes so FactorNode can render the correct visual state.
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

        let dimOpacity = 1;
        if (selectedId) {
          if (!isSelected && !isDownstream && !isUpstream) dimOpacity = 0.2;
        } else if (hoverNeighbours && hoveredId) {
          if (id !== hoveredId && !hoverNeighbours.has(id)) dimOpacity = 0.25;
        }

        const mapNode = map.nodes.find((mn) => mn.id === id);

        return {
          ...n,
          data: {
            ...n.data,
            label: mapNode?.label ?? n.data.label,
            role: mapNode?.role ?? n.data.role,
            renaming: id === renamingId,
            isSelected,
            isCycle,
            isRoot,
            isLeaf,
            dimOpacity,
            isDownstream,
            isUpstream,
            // callbacks always current
            onRename: onRenameNode,
            onCancelRename,
            onDuplicate: onDuplicateNode,
            onDelete: onDeleteNode,
          } satisfies FactorNodeData,
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
  }, [analysis, selectedId, hoveredId, map, renamingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        didConnectRef.current = true;
        onAddEdge(connection.source, connection.target);
      }
    },
    [onAddEdge]
  );

  const handleConnectStart: OnConnectStart = useCallback(
    (_evt, params) => {
      connectStartRef.current = params.nodeId ?? null;
      didConnectRef.current = false;
    },
    []
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!didConnectRef.current && connectStartRef.current) {
        const { clientX, clientY } =
          "touches" in event ? event.changedTouches[0]! : event;
        // Only create new node if dropped on the pane (not on an existing node)
        const target = event.target as Element;
        const onPane =
          target?.classList?.contains("react-flow__pane") ||
          !!target?.closest?.(".react-flow__pane");
        if (onPane) {
          const pos = screenToFlowPosition({ x: clientX, y: clientY });
          onAddConnectedNodeAt(connectStartRef.current, pos);
        }
      }
      connectStartRef.current = null;
      didConnectRef.current = false;
    },
    [onAddConnectedNodeAt, screenToFlowPosition]
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
    scheduleFitView();
  }, [map.nodes, map.edges, onRelayout, setRfNodes, scheduleFitView]);

  // Double-click on empty pane → add node at that position in rename mode.
  // react-flow v11 has no onPaneDoubleClick prop — wire via onDoubleClick on
  // the wrapper div and guard with closest(".react-flow__pane").
  const handleWrapperDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element;
      if (!target?.closest?.(".react-flow__pane")) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onAddNodeAt("", pos);
    },
    [onAddNodeAt, screenToFlowPosition]
  );

  // ⌘D / Ctrl-D: duplicate selected node
  const handleWrapperKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        if (selectedId) {
          e.preventDefault();
          onDuplicateNode(selectedId);
        }
      }
    },
    [selectedId, onDuplicateNode]
  );

  // Node context menu
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (evt, node) => {
      evt.preventDefault();
      setContextMenu({
        type: "node",
        x: (evt as unknown as MouseEvent).clientX,
        y: (evt as unknown as MouseEvent).clientY,
        nodeId: node.id,
        onRename: (id) => {
          onSelect(id);
          onStartRename(id);
        },
        onDuplicate: onDuplicateNode,
        onSetRole: onSetRole,
        onDelete: onDeleteNode,
        onClose: () => setContextMenu(null),
      });
    },
    [onSelect, onStartRename, onDuplicateNode, onSetRole, onDeleteNode]
  );

  // Pane context menu — wired on the wrapper div rather than onPaneContextMenu
  // because panOnDrag=[1,2] causes react-flow to swallow contextMenu on the pane
  // when right-click pan is enabled (it prevents default and doesn't call the prop).
  const handleWrapperContextMenu = useCallback(
    (evt: React.MouseEvent) => {
      const target = evt.target as Element;
      // Only show pane menu when clicking on the pane itself, not on a node
      const onPane =
        target?.classList?.contains("react-flow__pane") ||
        !!target?.closest?.(".react-flow__pane");
      if (!onPane) return;
      evt.preventDefault();
      const flowPos = screenToFlowPosition({
        x: evt.clientX,
        y: evt.clientY,
      });
      setContextMenu({
        type: "pane",
        x: evt.clientX,
        y: evt.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        onAddNodeAt: (pos) => onAddNodeAt("", pos),
        onTidy: handleTidy,
        onClose: () => setContextMenu(null),
      });
    },
    [screenToFlowPosition, onAddNodeAt, handleTidy]
  );

  // Keep onPaneContextMenu as a no-op fallback for react-flow (it won't fire
  // with panOnDrag=[1,2] but keeping it avoids a prop warning).
  const handlePaneContextMenu = useCallback((evt: React.MouseEvent) => {
    evt.preventDefault();
  }, []);

  const showHairballNotice = map.nodes.length > 20 && !selectedId;
  const showEmptyHint = map.nodes.length === 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "480px",
        position: "relative",
      }}
      onDoubleClick={handleWrapperDoubleClick}
      onKeyDown={handleWrapperKeyDown}
      onContextMenu={handleWrapperContextMenu}
      tabIndex={-1} // needs tabIndex to receive keydown
    >
      {/* ── Empty-state hint ─────────────────────────────────────────────── */}
      {showEmptyHint && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 5,
            pointerEvents: "none",
            color: "var(--ink-faint)",
            fontSize: "13px",
            fontFamily: "var(--font-display, inherit)",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          Double-click to add your first factor.
        </div>
      )}

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
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode="Backspace"
        zoomOnDoubleClick={false}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        panOnScroll={true}
      >
        <Background color="var(--paper-rule)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Context menu overlay */}
      {contextMenu && <ContextMenu {...contextMenu} />}
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
