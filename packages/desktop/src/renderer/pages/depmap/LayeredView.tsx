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
  useViewport,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type NodeDragHandler,
  type OnConnectStart,
  type EdgeMouseHandler,
} from "reactflow";

import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import { layoutPositions } from "./layout";
import type { Analysis } from "./useAnalysis";
import { FactorNode, type FactorNodeData } from "./FactorNode";
import { ContextMenu, type ContextMenuProps } from "./ContextMenu";
import { EdgeToolbar } from "./EdgeToolbar";
import { edgeVisual } from "./edge-style";
import { FloatingEdge } from "./FloatingEdge";
import { FloatingConnectionLine } from "./FloatingConnectionLine";

// ---------------------------------------------------------------------------
// Module-level nodeTypes constant — react-flow warns if this is defined inline
// ---------------------------------------------------------------------------

const nodeTypes = { factor: FactorNode };

// Module-level edgeTypes constant — floating edges for correct border routing
const edgeTypes = { floating: FloatingEdge };

/**
 * Delay before the deferred fitView fires after a topology change — lets
 * react-flow finish painting before measuring. Exported so tests can settle
 * past it deterministically instead of using a magic number.
 */
export const FITVIEW_DELAY_MS = 50;

/**
 * Padding fraction used for all fitView calls (Controls + scheduleFitView).
 * 0.25 gives edges and node badges breathing room without cropping arrowheads.
 * Exported so tests can assert the value.
 */
export const FITVIEW_PADDING = 0.25;

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
  /** `sourcePos` = the node's current rendered position (react-flow state). */
  onDuplicateNode: (id: string, sourcePos?: { x: number; y: number }) => void;
  onRenameNode: (id: string, label: string) => void;
  onCancelRename: (id: string) => void;
  onStartRename: (id: string) => void;
  onSetRole: (id: string, role: "objective" | "lever" | "uncertainty" | "factor") => void;
  // Task 6 edge mutation props
  onFlipEdge: (id: string) => void;
  onCycleEdgeSign: (id: string) => void;
  onToggleEdgeConfidence: (id: string) => void;
  onRepointEdge: (id: string, conn: { source: string; target: string }) => void;
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
 * Returns true when the event target is the empty react-flow pane (not on a
 * node).  In react-flow v11 nodes render inside .react-flow__pane, so we must
 * exclude node targets before checking for the pane.
 */
function isEmptyPaneTarget(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el) return false;
  if (el.closest?.(".react-flow__node")) return false;
  return (
    el.classList?.contains("react-flow__pane") ||
    !!el.closest?.(".react-flow__pane")
  );
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
  onFlipEdge,
  onCycleEdgeSign,
  onToggleEdgeConfidence,
  onRepointEdge,
}: LayeredViewProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const { fitView, screenToFlowPosition, flowToScreenPosition, getNode } = useReactFlow();
  // Live viewport transform — subscribing via useViewport re-renders this
  // component on every pan/zoom/fitView, keeping overlays (loop badges) in
  // sync with the canvas instead of going stale at their render-time position.
  const viewport = useViewport();

  // refs for onConnectEnd (v11 only provides the event, no connectionState)
  const connectStartRef = useRef<string | null>(null);
  const didConnectRef = useRef(false);

  // Wrapper div ref — receives focus back after rename ends so ⌘D keeps working.
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Duplicate with the node's CURRENT rendered position: schema position is
  // absent for CapturePanel-added nodes that were never dragged, so the copy
  // must offset from react-flow's live position instead.
  const duplicateNode = useCallback(
    (id: string) => {
      onDuplicateNode(id, getNode(id)?.position);
    },
    [onDuplicateNode, getNode]
  );

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
      fitView({ padding: FITVIEW_PADDING });
    }, FITVIEW_DELAY_MS);
  }, [fitView]);

  useEffect(
    () => () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    },
    []
  );

  // When a rename ends (commit or cancel), return focus to the canvas wrapper
  // so keyboard shortcuts (⌘D, Delete) work without an extra click.
  const prevRenamingId = useRef<string | null>(renamingId);
  useEffect(() => {
    if (prevRenamingId.current && !renamingId) {
      wrapperRef.current?.focus();
    }
    prevRenamingId.current = renamingId;
  }, [renamingId]);

  // ── Effect 1: STRUCTURAL SYNC ───────────────────────────────────────────
  // Fires when topology (node/edge set) changes.  Responsible for:
  //   - initialising positions (saved → existing RF position → dagre)
  //   - building edge objects
  //   - calling fitView after a fresh load or tidy
  // This effect NEVER touches styles — it sets the minimal node object so that
  // the style effect below can paint over it without losing position data.
  //
  // The prevStructKey early-return guarantees the effect body only runs when
  // topology truly changed, even if the deps array includes stable-but-changing
  // values.  This lets us list all real deps for the linter without altering
  // the semantics of the guard.
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
            onDuplicate: duplicateNode,
            onDelete: onDeleteNode,
          } satisfies FactorNodeData,
        };
      });
    });

    const nodeIds = new Set(map.nodes.map((n) => n.id));
    setRfEdges(
      map.edges
        .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
        .map((e) => {
          const visual = edgeVisual(e, { isCycle: false, dimmed: false });
          return {
            id: e.id,
            source: e.from,
            target: e.to,
            type: "floating" as const,
            // Store sign/confidence on the RF edge data so context menu can read it
            data: { sign: e.sign, confidence: e.confidence },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: visual.stroke,
            },
            style: {
              stroke: visual.stroke,
              strokeWidth: visual.strokeWidth,
              ...(visual.strokeDasharray ? { strokeDasharray: visual.strokeDasharray } : {}),
            },
            interactionWidth: 20,
          };
        })
    );

    // Fit view after a topology change (load or add/delete nodes).
    // Small timeout lets RF finish painting the new nodes before measuring.
    scheduleFitView();
  }, [structKey, onRenameNode, onCancelRename, duplicateNode, onDeleteNode, scheduleFitView]);

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

    // O(1) lookup by id instead of O(n) find() inside the per-node loop.
    const mapNodeById = new Map(map.nodes.map((n) => [n.id, n]));

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

        const mapNode = mapNodeById.get(id);

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
            onDuplicate: duplicateNode,
            onDelete: onDeleteNode,
          } satisfies FactorNodeData,
        };
      })
    );

    // O(1) lookup by id instead of O(n) find() inside the per-edge loop.
    const mapEdgeById = new Map(map.edges.map((me) => [me.id, me]));

    setRfEdges((eds) =>
      eds.map((e) => {
        const isCycleEdge = cycleEdgeIds.has(e.id);

        // Look up the current edge schema object to get sign/confidence
        const mapEdge = mapEdgeById.get(e.id);

        let dimmed = false;
        if (selectedId) {
          const fromActive =
            e.source === selectedId ||
            downstream.has(e.source) ||
            upstream.has(e.source);
          const toActive =
            e.target === selectedId ||
            downstream.has(e.target) ||
            upstream.has(e.target);
          if (!fromActive && !toActive) dimmed = true;
        } else if (hoverNeighbours && hoveredId) {
          const fromActive =
            e.source === hoveredId || hoverNeighbours.has(e.source);
          const toActive =
            e.target === hoveredId || hoverNeighbours.has(e.target);
          if (!fromActive && !toActive) dimmed = true;
        }

        const visual = edgeVisual(
          mapEdge ?? { sign: undefined, confidence: undefined },
          { isCycle: isCycleEdge, dimmed }
        );

        return {
          ...e,
          type: "floating" as const,
          data: { sign: mapEdge?.sign, confidence: mapEdge?.confidence },
          markerEnd: { type: MarkerType.ArrowClosed, color: visual.stroke },
          style: {
            stroke: visual.stroke,
            strokeWidth: visual.strokeWidth,
            opacity: visual.opacity,
            transition: "opacity 0.15s ease",
            ...(visual.strokeDasharray ? { strokeDasharray: visual.strokeDasharray } : {}),
          },
        };
      })
    );
  }, [analysis, selectedId, hoveredId, map, renamingId, onRenameNode, onCancelRename, duplicateNode, onDeleteNode]);

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
        if (isEmptyPaneTarget(event.target)) {
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
  // NOTE: in v11 the nodes container renders INSIDE .react-flow__pane, so the
  // pane check alone also matches double-clicks on nodes — exclude node
  // targets explicitly (node double-click = rename, see handleNodeDoubleClick).
  const handleWrapperDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEmptyPaneTarget(e.target)) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onAddNodeAt("", pos);
    },
    [onAddNodeAt, screenToFlowPosition]
  );

  // Double-click on a node → inline rename of that node.
  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (evt, node) => {
      evt.preventDefault();
      onStartRename(node.id);
    },
    [onStartRename]
  );

  // ⌘D / Ctrl-D: duplicate selected node
  const handleWrapperKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        if (selectedId) {
          e.preventDefault();
          duplicateNode(selectedId);
        }
      }
    },
    [selectedId, duplicateNode]
  );

  // Shared close handler: close context menu and return focus to the canvas.
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    // Return focus to canvas so keyboard shortcuts keep working without a click.
    wrapperRef.current?.focus();
  }, []);

  // Node context menu
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (evt, node) => {
      evt.preventDefault();
      setContextMenu({
        type: "node",
        x: evt.clientX,
        y: evt.clientY,
        nodeId: node.id,
        onRename: (id) => {
          onSelect(id);
          onStartRename(id);
        },
        onDuplicate: duplicateNode,
        onSetRole: onSetRole,
        onDelete: onDeleteNode,
        onClose: closeContextMenu,
      });
    },
    [onSelect, onStartRename, duplicateNode, onSetRole, onDeleteNode, closeContextMenu]
  );

  // Pane context menu — wired on the wrapper div rather than onPaneContextMenu
  // because panOnDrag=[1,2] causes react-flow to swallow contextMenu on the pane
  // when right-click pan is enabled (it prevents default and doesn't call the prop).
  const handleWrapperContextMenu = useCallback(
    (evt: React.MouseEvent) => {
      // Only show pane menu when clicking on the pane itself, not on a node —
      // nodes render INSIDE .react-flow__pane in v11, so exclude them first or
      // the bubbled event overwrites the node menu set by onNodeContextMenu.
      if (!isEmptyPaneTarget(evt.target)) return;
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
        onClose: closeContextMenu,
      });
    },
    [screenToFlowPosition, onAddNodeAt, handleTidy, closeContextMenu]
  );

  // Keep onPaneContextMenu as a no-op fallback for react-flow (it won't fire
  // with panOnDrag=[1,2] but keeping it avoids a prop warning).
  const handlePaneContextMenu = useCallback((evt: React.MouseEvent) => {
    evt.preventDefault();
  }, []);

  // Edge click: select the edge and show the EdgeToolbar.
  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_evt, edge) => {
      setSelectedEdgeId(edge.id);
      // Close any open context menu when edge is selected
      setContextMenu(null);
    },
    []
  );

  // Edge context menu: show the edge menu with flip/sign/confidence/delete.
  const handleEdgeContextMenu: EdgeMouseHandler = useCallback(
    (evt, edge) => {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedEdgeId(edge.id);
      setContextMenu({
        type: "edge",
        x: evt.clientX,
        y: evt.clientY,
        edgeId: edge.id,
        sign: edge.data?.sign,
        confidence: edge.data?.confidence,
        onFlipEdge,
        onCycleEdgeSign,
        onToggleEdgeConfidence,
        onDeleteEdge: (id) => {
          onDeleteEdge(id);
          setSelectedEdgeId(null);
        },
        onClose: closeContextMenu,
      });
    },
    [onFlipEdge, onCycleEdgeSign, onToggleEdgeConfidence, onDeleteEdge, closeContextMenu]
  );

  // Edge update (re-point): drag an edge endpoint to a new node.
  // React-flow v11 calls this handler when the user drops an edge endpoint onto
  // a valid node. If the drop is on empty space, the handler is NOT called and
  // the edge is kept as-is (v11 default behaviour — no silent unbind).
  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (newConnection.source && newConnection.target) {
        onRepointEdge(oldEdge.id, {
          source: newConnection.source,
          target: newConnection.target,
        });
      }
    },
    [onRepointEdge]
  );

  // Pane click: deselect edge when clicking empty canvas.
  const handlePaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Close overlays when the canvas pans or scrolls (react-flow onMove): the
  // context menu AND the edge toolbar are both anchored to stale screen
  // positions once the viewport moves, so both must go.
  const handleMove = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    setSelectedEdgeId(null);
  }, [contextMenu]);

  // ── Loop badge computation ─────────────────────────────────────────────
  // For each classified loop, compute a centroid from rfNode positions and
  // render a floating, pointer-events-none label. Computed at render time
  // from rfNodes so badges track node drags automatically.
  // Cross-reference readout.planAround to get valence (virtuous/vicious) when
  // available — classifiedLoops carries only class (reinforcing/balancing).
  const loopBadges = (() => {
    const { classifiedLoops, readout } = analysis;
    if (!classifiedLoops || classifiedLoops.length === 0) return [];
    const rfNodeById = new Map(rfNodes.map((n) => [n.id, n]));

    // Build a quick lookup: first loop node id → valence from readout.planAround.
    // Keying on nodes[0] is safe because SCCs are disjoint — a node belongs to
    // at most one loop, so the first node uniquely identifies it.
    const readoutLoopValence = new Map<string, "virtuous" | "vicious" | undefined>();
    for (const item of readout.planAround) {
      if (item.kind === "loop") {
        readoutLoopValence.set(item.nodes[0] ?? "", item.valence);
      }
    }

    return classifiedLoops.map((loop, idx) => {
      const positions = loop.nodes
        .map((id) => rfNodeById.get(id))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .map((n) => ({
          x: n.position.x + (n.width ?? 0) / 2,
          y: n.position.y + (n.height ?? 0) / 2,
        }));
      if (positions.length === 0) return null;
      const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

      const glyph = loop.class === "balancing" ? "⇋" : "⟳";
      // Build label text: valence takes precedence over plain class name.
      const valence = readoutLoopValence.get(loop.nodes[0] ?? "");
      const classLabel: string = (valence ?? loop.class);
      const label = `${glyph} ${classLabel}`;

      // Flow → overlay coords via the LIVE viewport transform (useViewport):
      // overlay = flow*zoom + pan offset. Because useViewport re-renders this
      // component on every transform change, badges track pan/zoom/fitView
      // instead of going stale at a render-time flowToScreenPosition snapshot.
      const overlayPos = {
        x: cx * viewport.zoom + viewport.x,
        y: cy * viewport.zoom + viewport.y,
      };

      return { idx, label, ...overlayPos };
    }).filter((b): b is NonNullable<typeof b> => b !== null);
  })();

  const showHairballNotice = map.nodes.length > 20 && !selectedId;
  const showEmptyHint = map.nodes.length === 0;

  const selectedEdge = selectedEdgeId
    ? map.edges.find((e) => e.id === selectedEdgeId)
    : null;

  // EdgeToolbar anchor: midpoint between the two endpoint node CENTRES
  // (position is the node's top-left; width/height are measured by react-flow,
  // fall back to 0 before measurement). flowToScreenPosition returns viewport
  // coords; subtract the wrapper rect to get overlay-relative coords.
  const edgeToolbarPosition = (() => {
    if (!selectedEdge) return null;
    const srcNode = rfNodes.find((n) => n.id === selectedEdge.from);
    const tgtNode = rfNodes.find((n) => n.id === selectedEdge.to);
    if (!srcNode || !tgtNode) return null;
    const srcCx = srcNode.position.x + (srcNode.width ?? 0) / 2;
    const srcCy = srcNode.position.y + (srcNode.height ?? 0) / 2;
    const tgtCx = tgtNode.position.x + (tgtNode.width ?? 0) / 2;
    const tgtCy = tgtNode.position.y + (tgtNode.height ?? 0) / 2;
    const screenPos = flowToScreenPosition({
      x: (srcCx + tgtCx) / 2,
      y: (srcCy + tgtCy) / 2,
    });
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return screenPos; // fallback to screen coords
    return {
      x: screenPos.x - wrapperRect.left,
      y: screenPos.y - wrapperRect.top,
    };
  })();

  return (
    <div
      ref={wrapperRef}
      data-testid="depmap-canvas"
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

      {/* Tidy button — icon-only, explicit dagre relayout, does NOT fire on every render */}
      <button
        onClick={handleTidy}
        title="Re-run auto-layout (Tidy)"
        aria-label="Tidy layout"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          background: "var(--paper-raised)",
          color: "var(--ink-dim)",
          border: "1px solid var(--paper-rule)",
          borderRadius: "4px",
          padding: "5px",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 0,
        }}
      >
        {/* Grid/alignment (Tidy) icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <line x1="3" y1="4" x2="13" y2="4" />
          <line x1="3" y1="8" x2="13" y2="8" />
          <line x1="3" y1="12" x2="13" y2="12" />
          <line x1="3" y1="3" x2="3" y2="13" />
        </svg>
      </button>

      {/* Loop badge overlay — pointer-events-none floating labels at loop centroids */}
      {loopBadges.map((badge) => (
        <div
          key={badge.idx}
          data-testid={`loop-badge-${badge.idx}`}
          style={{
            position: "absolute",
            left: badge.x,
            top: badge.y,
            transform: "translate(-50%, -50%)",
            zIndex: 8,
            pointerEvents: "none",
            color: "var(--ink-dim)",
            fontSize: "10px",
            fontVariant: "small-caps",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-display, inherit)",
            userSelect: "none",
            background: "var(--paper-base, transparent)",
            padding: "1px 4px",
            borderRadius: "3px",
            border: "1px solid var(--paper-rule)",
            opacity: 0.85,
          }}
        >
          {badge.label}
        </div>
      ))}

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={FloatingConnectionLine}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onEdgeClick={handleEdgeClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        onEdgeUpdate={handleEdgeUpdate}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        edgesUpdatable={true}
        fitView
        fitViewOptions={{ padding: FITVIEW_PADDING }}
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

      {/* Edge toolbar — appears when an edge is selected */}
      {selectedEdge && edgeToolbarPosition && (
        <EdgeToolbar
          edgeId={selectedEdge.id}
          sign={selectedEdge.sign}
          confidence={selectedEdge.confidence}
          x={edgeToolbarPosition.x}
          y={edgeToolbarPosition.y}
          onFlip={onFlipEdge}
          onCycleSign={onCycleEdgeSign}
          onToggleConfidence={onToggleEdgeConfidence}
          onDelete={(id) => { onDeleteEdge(id); setSelectedEdgeId(null); }}
          onClose={() => {
            // Escape scoping: when a context menu is open ON TOP of the
            // toolbar, the same Escape press also reaches the toolbar's
            // document listener. Let the menu consume that press (ContextMenu
            // closes itself); the NEXT Escape closes the toolbar.
            if (contextMenu) return;
            setSelectedEdgeId(null);
            wrapperRef.current?.focus();
          }}
        />
      )}

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
