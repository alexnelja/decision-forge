import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap, DependencyEdge, DependencyNode } from "@decision-forge/core";
import { mcVarName } from "@decision-forge/core";
import { CapturePanel } from "./depmap/CapturePanel";
import { LayeredView } from "./depmap/LayeredView";
import { StructurePanel } from "./depmap/StructurePanel";
import { NodeInspector } from "./depmap/NodeInspector";
import { ReadoutPanel } from "./depmap/ReadoutPanel";
import type { NodeRole } from "./depmap/roles";
import { useAnalysis } from "./depmap/useAnalysis";
import { mapsApi } from "../lib/maps-api";
import { addMcLink } from "../lib/mc-link-store";

/**
 * Read the right-panel pinned preference from localStorage.
 * Key: "df.depmap.panel.pinned". Defaults to true (open).
 */
function readPanelPinned(): boolean {
  try {
    const stored = localStorage.getItem("df.depmap.panel.pinned");
    if (stored === null) return true;
    return stored !== "false";
  } catch {
    return true;
  }
}

// Lazy-load ConstellationView so that three.js (600+ kB) is code-split into its
// own chunk and NOT bundled into the main renderer entry.  It is only fetched
// when the user first clicks the [3D] toggle.
const ConstellationView = lazy(() => import("./depmap/ConstellationView"));

type ViewMode = "layered" | "3d";

function makeEmpty(): DMap {
  return {
    id: crypto.randomUUID(),
    name: "Untitled map",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
  };
}

/**
 * Read the capture-panel pinned preference from localStorage. Same lazy-init
 * try/catch pattern as the global Sidebar ("df.sidebar.pinned") so the two
 * identical pin controls behave consistently across restarts. Defaults to
 * true (pinned) when the key is absent or localStorage is unavailable.
 */
function readCapturePinned(): boolean {
  try {
    const stored = localStorage.getItem("df.capture.pinned");
    if (stored === null) return true; // default: pinned
    return stored !== "false";
  } catch {
    return true;
  }
}

export default function DependencyMap() {
  const navigate = useNavigate();
  const [map, setMap] = useState<DMap>(makeEmpty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Pending MC push: set to a nodeId when handlePushToMC is called.
  // A useEffect watches this flag and does the async persist → register → navigate.
  const [pendingMcPush, setPendingMcPush] = useState<string | null>(null);
  // {nodeId, varName} for the in-flight push. Doubles as the re-entrancy guard:
  // non-null = a push is in flight, further pushes are ignored until it clears.
  const pendingMcRef = useRef<{ nodeId: string; varName: string } | null>(null);
  // Live mirror of `map` so useCallback([]) handlers can read fresh state
  // synchronously (assigned every render — never stale at event time).
  const mapRef = useRef(map);
  mapRef.current = map;
  // Freshly created node ids (born via double-click-add or drag-to-empty) that
  // have never been successfully named. Cancel-by-empty (committing an empty
  // label) deletes ONLY these — an existing node committed empty keeps its
  // previous label instead of being silently destroyed.
  const freshNodeIds = useRef<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("layered");
  // Collapsible capture sidebar: pinned by default; unpin to get the thin rail.
  // Pin state persists to localStorage("df.capture.pinned") — parity with the
  // global Contents nav's "df.sidebar.pinned".
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(() => readCapturePinned());
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinned || sidebarHovered;

  const toggleCapturePinned = useCallback(() => {
    setSidebarPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem("df.capture.pinned", String(next));
      } catch {
        // localStorage may be unavailable in some contexts — ignore
      }
      return next;
    });
  }, []);

  // Collapsible right overlay panel (Decision Readout / NodeInspector / StructurePanel).
  // Floats over the canvas — pinned open by default. Persists to
  // localStorage("df.depmap.panel.pinned"). The pin/rail convention matches the
  // capture panel above: ●/○ glyph, same button style.
  const [panelPinned, setPanelPinned] = useState<boolean>(() => readPanelPinned());

  const togglePanelPinned = useCallback(() => {
    setPanelPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem("df.depmap.panel.pinned", String(next));
      } catch {
        // localStorage may be unavailable in some contexts — ignore
      }
      return next;
    });
  }, []);

  // Open-dialog state: null = closed, array = list of maps available to load
  const [openList, setOpenList] = useState<Array<{ id: string; name: string }> | null>(null);

  // Compute analysis ONCE here and pass down to both LayeredView and StructurePanel.
  const analysis = useAnalysis(map);

  const handleAddNode = useCallback((label: string) => {
    const now = new Date().toISOString();
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: crypto.randomUUID(), label }],
      updatedAt: now,
    }));
  }, []);

  const handleAddEdge = useCallback((from: string, to: string) => {
    if (from === to) return;
    setMap((prev) => {
      if (prev.edges.some((e) => e.from === from && e.to === to)) return prev;
      const newEdge: DependencyEdge = { id: crypto.randomUUID(), from, to };
      return {
        ...prev,
        edges: [...prev.edges, newEdge],
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const handleUpdateNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === id ? { ...n, position: pos } : n
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleDeleteNode = useCallback((id: string) => {
    freshNodeIds.current.delete(id);
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
      updatedAt: new Date().toISOString(),
    }));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDeleteEdge = useCallback((id: string) => {
    setMap((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // ── Task 5 handlers ─────────────────────────────────────────────────────

  /**
   * Add a node at a specific canvas position.
   * Passing an empty label immediately puts the node into rename mode.
   */
  const handleAddNodeAt = useCallback((label: string, pos: { x: number; y: number }) => {
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    freshNodeIds.current.add(newId);
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: newId, label: label || "New factor", position: pos }],
      updatedAt: now,
    }));
    setSelectedId(newId);
    setRenamingId(newId);
  }, []);

  /**
   * Add a new node connected FROM sourceId at a specific canvas position.
   * Both node creation and edge creation happen in a single state update.
   */
  const handleAddConnectedNodeAt = useCallback((sourceId: string, pos: { x: number; y: number }) => {
    const newId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();
    const now = new Date().toISOString();
    freshNodeIds.current.add(newId);
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: newId, label: "New factor", position: pos }],
      edges: [...prev.edges, { id: edgeId, from: sourceId, to: newId }],
      updatedAt: now,
    }));
    setSelectedId(newId);
    setRenamingId(newId);
  }, []);

  /**
   * Duplicate a node: clone label + role, append " (copy)", offset position +24/+24.
   * `sourcePos` is the source's current RENDERED position, passed by LayeredView
   * from react-flow state — schema position alone is absent for nodes added via
   * the CapturePanel and never dragged, which would land every copy at {24,24}.
   */
  const handleDuplicateNode = useCallback((id: string, sourcePos?: { x: number; y: number }) => {
    const newId = crypto.randomUUID();
    setMap((prev) => {
      const src = prev.nodes.find((n) => n.id === id);
      if (!src) return prev;
      const base = sourcePos ?? src.position;
      const pos = base
        ? { x: base.x + 24, y: base.y + 24 }
        : { x: 24, y: 24 };
      const newNode: DependencyNode = {
        id: newId,
        label: `${src.label} (copy)`,
        position: pos,
        ...(src.role ? { role: src.role } : {}),
      };
      return {
        ...prev,
        nodes: [...prev.nodes, newNode],
        updatedAt: new Date().toISOString(),
      };
    });
    // setSelectedId with the new id; if the source didn't exist (setMap returned
    // prev unchanged), the phantom id is harmless — no node inspector shows.
    setSelectedId(newId);
  }, []);

  /**
   * Rename a node. Empty-label commits are scoped:
   *   - FRESH node (never successfully named): delete it (cancel-by-empty).
   *   - EXISTING node: keep its previous label — just exit rename mode.
   *     Never silently destroy user data on an accidental empty commit.
   * Same-label commits are no-ops: if the trimmed label equals the current
   * label, exit rename mode without bumping updatedAt.
   */
  const handleRenameNode = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) {
      if (freshNodeIds.current.has(id)) {
        // Delete fresh node (inline to avoid stale handleDeleteNode dep)
        freshNodeIds.current.delete(id);
        setMap((prev) => ({
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== id),
          edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
          updatedAt: new Date().toISOString(),
        }));
        setSelectedId((prev) => (prev === id ? null : prev));
      }
      setRenamingId(null); // existing node: snap back to previous label
      return;
    }
    freshNodeIds.current.delete(id); // successfully named — no longer fresh
    setMap((prev) => {
      const existing = prev.nodes.find((n) => n.id === id);
      // Same-label commit: exit rename mode without bumping updatedAt
      if (existing && existing.label === trimmed) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === id ? { ...n, label: trimmed } : n
        ),
        updatedAt: new Date().toISOString(),
      };
    });
    setRenamingId(null);
  }, []);

  /**
   * Cancel rename (Esc key).
   *   - FRESH node (never successfully named): Esc during initial naming means
   *     "never mind" — remove the node (FigJam/Obsidian-canvas pattern).
   *   - EXISTING node: keep it, just exit rename mode (label unchanged).
   */
  const handleCancelRename = useCallback((id: string) => {
    if (freshNodeIds.current.has(id)) {
      // Inline the delete to avoid depending on handleDeleteNode callback
      freshNodeIds.current.delete(id);
      setMap((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== id),
        edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
        updatedAt: new Date().toISOString(),
      }));
      setSelectedId((prev) => (prev === id ? null : prev));
    }
    setRenamingId(null);
  }, []);

  /** Enter rename mode for an existing node (e.g. from context menu Rename item). */
  const handleStartRename = useCallback((id: string) => {
    setSelectedId(id);
    setRenamingId(id);
  }, []);

  // (handleSetRole lives below handleUpdateNode — it delegates to it so the
  // factor-strips-the-key rule has exactly one implementation.)

  // ── Task 6 edge handlers ─────────────────────────────────────────────────

  /**
   * Flip the direction of an edge (swap from/to).
   * No-op if the reversed edge already exists (would create a duplicate).
   */
  const handleFlipEdge = useCallback((id: string) => {
    setMap((prev) => {
      const edge = prev.edges.find((e) => e.id === id);
      if (!edge) return prev;
      // Guard: refuse if reversed edge already exists
      if (prev.edges.some((e) => e.from === edge.to && e.to === edge.from)) return prev;
      return {
        ...prev,
        edges: prev.edges.map((e) =>
          e.id === id ? { ...e, from: e.to, to: e.from } : e
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  /**
   * Cycle the sign of an edge: undefined → "+" → "-" → undefined.
   */
  const handleCycleEdgeSign = useCallback((id: string) => {
    setMap((prev) => ({
      ...prev,
      edges: prev.edges.map((e) => {
        if (e.id !== id) return e;
        const next = e.sign === undefined ? "+" : e.sign === "+" ? "-" : undefined;
        const { sign: _sign, ...rest } = e;
        return next === undefined ? rest as typeof e : { ...rest, sign: next };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  /**
   * Toggle confidence between undefined/"known" and "assumption".
   */
  const handleToggleEdgeConfidence = useCallback((id: string) => {
    setMap((prev) => ({
      ...prev,
      edges: prev.edges.map((e) => {
        if (e.id !== id) return e;
        const next = e.confidence === "assumption" ? undefined : "assumption";
        const { confidence: _conf, ...rest } = e;
        return next === undefined ? rest as typeof e : { ...rest, confidence: next };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  /**
   * Re-point an edge to new source/target endpoints.
   * Refuses self-loops and duplicate edges (no-op).
   */
  const handleRepointEdge = useCallback((id: string, conn: { source: string; target: string }) => {
    const { source, target } = conn;
    if (source === target) return; // no self-loops
    setMap((prev) => {
      // Guard: refuse if this would duplicate an existing edge
      if (prev.edges.some((e) => e.id !== id && e.from === source && e.to === target)) return prev;
      return {
        ...prev,
        edges: prev.edges.map((e) =>
          e.id === id ? { ...e, from: source, to: target } : e
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const handleUpdateNode = useCallback((id: string, patch: { label?: string; note?: string; role?: NodeRole }) => {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== id) return n;
        // Spec: absent ≡ "factor" — a patch setting role to "factor" must
        // REMOVE the key from the node (saved JSON never contains
        // "role":"factor"), mirroring sign/confidence key removal on edges.
        if (patch.role === "factor") {
          const { role: _patchRole, ...patchRest } = patch;
          const { role: _nodeRole, mc: _mc, ...nodeRest } = n;
          return { ...nodeRest, ...patchRest };
        }
        // Role change away from uncertainty strips the mc block (key removal).
        if (patch.role !== undefined && patch.role !== "uncertainty" && n.mc) {
          const { mc: _mc, ...nodeWithoutMc } = n;
          return { ...nodeWithoutMc, ...patch };
        }
        return { ...n, ...patch };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  /**
   * Set the role of a node (context-menu path). Delegates to handleUpdateNode
   * so the factor-strips-the-key rule lives in exactly one place.
   */
  const handleSetRole = useCallback((id: string, role: NodeRole) => {
    handleUpdateNode(id, { role });
  }, [handleUpdateNode]);

  /**
   * Unlink a node from its § I Monte Carlo variable.
   * Strips the whole `mc` key from the node (key-removal destructure, same
   * pattern as role="factor" stripping).  No confirm dialog — re-pushing
   * recovers the link.
   */
  const handleUnlinkMC = useCallback((id: string) => {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id !== id || !n.mc) return n;
        const { mc: _mc, ...nodeWithoutMc } = n;
        return nodeWithoutMc as typeof n;
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  /**
   * Push an uncertainty node to § I Monte Carlo.
   *
   * Phase 1 (sync): checks eligibility against fresh state (mapRef), computes
   * the varName OUTSIDE the updater (the updater stays pure: seed-if-absent
   * only), stashes {nodeId, varName} in a ref, sets pendingMcPush.
   * Phase 2 (async effect): persists, registers in mc-link-store, navigates.
   *
   * Re-entrancy: pendingMcRef doubles as an in-flight latch — a push while a
   * previous push's save is still pending is ignored (no second concurrent
   * save with a divergent payload, no dangling mc-link registration).
   */
  const handlePushToMC = useCallback((id: string) => {
    if (pendingMcRef.current) return; // a push is already in flight — ignore
    const node = mapRef.current.nodes.find((n) => n.id === id);
    if (!node || node.role !== "uncertainty") return;

    let varName: string;
    if (node.mc) {
      // Already linked — preserve the definition, just re-register + navigate.
      varName = node.mc.varName;
    } else {
      const taken = new Set(
        mapRef.current.nodes.flatMap((n) => (n.mc ? [n.mc.varName] : []))
      );
      varName = mcVarName(node.label, taken);
      setMap((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === id && !n.mc
            ? {
                ...n,
                mc: {
                  varName,
                  distribution: { kind: "triangular" as const, min: 0, mode: 0, max: 0 },
                },
              }
            : n
        ),
        updatedAt: new Date().toISOString(),
      }));
    }

    pendingMcRef.current = { nodeId: id, varName };
    setPendingMcPush(id);
  }, []);

  // Phase 2: async persist → register → navigate, triggered by pendingMcPush.
  // The effect sees the post-update `map` (render between phases) — that's the
  // point of the two-phase shape.
  useEffect(() => {
    if (!pendingMcPush || !pendingMcRef.current) return;
    const { nodeId, varName } = pendingMcRef.current;
    let cancelled = false;
    (async () => {
      try {
        const updated = { ...map, updatedAt: new Date().toISOString() };
        await mapsApi.save(updated); // persist FIRST
        setMap(updated); // sync the saved stamp back into state (handleSave parity)
        // mc-link-store is module-level and the save succeeded — register even
        // if this component instance unmounted mid-save.
        addMcLink({ mapId: updated.id, nodeId, varName });
        if (!cancelled) navigate("/mc");
      } catch (err) {
        console.error("handlePushToMC: failed to save or register:", err);
      } finally {
        pendingMcRef.current = null;
        setPendingMcPush(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMcPush]);

  const handleRelayout = useCallback((positions: Map<string, { x: number; y: number }>) => {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // --- persistence handlers -------------------------------------------------

  async function handleSave() {
    const updated = { ...map, updatedAt: new Date().toISOString() };
    try {
      await mapsApi.save(updated); // persist FIRST
      setMap(updated); // only update state on success
    } catch (err) {
      console.error("Failed to save map:", err);
    }
  }

  async function handleOpen() {
    try {
      setOpenList(await mapsApi.list());
    } catch (err) {
      console.error("Failed to list maps:", err);
      setOpenList([]); // don't hang the dialog
    }
  }

  async function handleLoadMap(id: string) {
    try {
      const loaded = await mapsApi.load(id);
      if (loaded) {
        freshNodeIds.current.clear();
        setMap(loaded);
        setSelectedId(null);
      }
    } catch (err) {
      console.error("Failed to load map:", err);
    } finally {
      setOpenList(null); // always close the dialog
    }
  }

  function handleNew() {
    freshNodeIds.current.clear();
    setMap(makeEmpty());
    setSelectedId(null);
    setOpenList(null);
  }

  const selectedNode = map.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <ModuleFrame
      section="§ IV"
      kicker="Consequence"
      title="Dependency Map"
      accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
    >
      {/* ── Header bar: map name + persistence controls + view toggle ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Editable map name */}
        <input
          type="text"
          aria-label="Map name"
          value={map.name}
          onChange={(e) =>
            setMap((prev) => ({ ...prev, name: e.target.value }))
          }
          style={{
            flex: "1 1 180px",
            minWidth: "120px",
            background: "var(--paper-raised)",
            color: "var(--ink)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "13px",
            fontFamily: "var(--font-display, inherit)",
          }}
        />

        {/* Persistence buttons — icon-only with aria-label + title tooltips */}
        <button
          onClick={handleSave}
          style={iconBtnStyle}
          title="Save this map"
          aria-label="Save map"
          data-testid="map-save"
        >
          {/* Floppy/down-tray save icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <rect x="5" y="2" width="6" height="4" rx="0.5" />
            <rect x="4.5" y="9" width="7" height="4.5" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={handleOpen}
          style={iconBtnStyle}
          title="Open a saved map"
          aria-label="Open map"
        >
          {/* Folder open icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6l1.5 2H13c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3.5C2.67 13 2 12.33 2 11.5V4.5Z" />
          </svg>
        </button>
        <button
          onClick={handleNew}
          style={iconBtnStyle}
          title="Start a new empty map"
          aria-label="New map"
        >
          {/* Plus icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        {/* View-mode toggle — icon-only with aria-label + title */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          <button
            onClick={() => setViewMode("layered")}
            style={viewMode === "layered" ? activeIconBtnStyle : iconToggleStyle}
            aria-pressed={viewMode === "layered"}
            aria-label="Layered view"
            title="Layered view — 2D DAG canvas"
          >
            {/* Stacked layers icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 5.5L8 3l6 2.5L8 8 2 5.5Z" />
              <path d="M2 8.5L8 6l6 2.5" opacity="0.5" />
              <path d="M2 11.5L8 9l6 2.5" opacity="0.25" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("3d")}
            style={viewMode === "3d" ? activeIconBtnStyle : iconToggleStyle}
            aria-pressed={viewMode === "3d"}
            aria-label="3D view"
            title="3D constellation view"
          >
            {/* Cube icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M8 2L14 5.5v5L8 14 2 10.5v-5L8 2Z" />
              <path d="M8 2v12M2 5.5l6 3.5 6-3.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Open-map list overlay ── */}
      {openList !== null && (
        <div
          style={{
            position: "absolute",
            top: "120px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "var(--paper-raised)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "6px",
            padding: "16px",
            minWidth: "260px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-dim)", marginBottom: "8px" }}>
            Saved maps
          </div>
          {openList.length === 0 && (
            <div style={{ color: "var(--ink-dim)", fontSize: "13px" }}>No saved maps yet.</div>
          )}
          {openList.map((item) => (
            <button
              key={item.id}
              onClick={() => handleLoadMap(item.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink)",
                fontSize: "13px",
                padding: "6px 4px",
                borderRadius: "3px",
              }}
            >
              {item.name}
            </button>
          ))}
          <button
            onClick={() => setOpenList(null)}
            style={{ ...btnStyle, marginTop: "8px", width: "100%" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Two-column grid: capture panel | canvas ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: sidebarOpen ? "260px 1fr" : "14px 1fr",
          gap: sidebarOpen ? "24px" : "8px",
          height: "calc(100vh - 320px)",
          minHeight: "520px",
          transition: "grid-template-columns 0.22s ease, gap 0.22s ease",
        }}
      >
        {/* Left: collapsible capture panel rail */}
        <div
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          style={{
            borderRight: "1px solid var(--paper-rule)",
            paddingRight: sidebarOpen ? "20px" : "0",
            overflowY: sidebarOpen ? "auto" : "hidden",
            overflowX: "hidden",
            position: "relative",
            transition: "padding-right 0.22s ease",
            cursor: sidebarOpen ? "default" : "e-resize",
          }}
        >
          {/* Collapsed rail: faint vertical "Capture" label */}
          {!sidebarOpen && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--ink-faint)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              Capture
            </div>
          )}

          {/* Pin/unpin toggle — always visible. Named "capture panel" (not
              "sidebar") so its accessible name never collides with the global
              Contents nav pin when both are on screen. */}
          <button
            onClick={toggleCapturePinned}
            title={sidebarPinned ? "Unpin capture panel" : "Pin capture panel open"}
            aria-label={sidebarPinned ? "Unpin capture panel" : "Pin capture panel open"}
            style={{
              position: "absolute",
              top: "6px",
              right: sidebarOpen ? "6px" : "50%",
              transform: sidebarOpen ? "none" : "translateX(50%)",
              zIndex: 2,
              background: sidebarPinned ? "var(--sec-depmap)" : "var(--paper-raised)",
              border: "1px solid var(--paper-rule)",
              borderRadius: "3px",
              color: sidebarPinned ? "#fff" : "var(--ink-dim)",
              fontSize: "9px",
              padding: "8px", // ≥24px hit target (9px glyph + 2×8px padding)
              cursor: "pointer",
              lineHeight: 1,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {sidebarPinned ? "●" : "○"}
          </button>

          {/* The actual capture panel — only rendered when sidebar is open */}
          {sidebarOpen && (
            <div style={{ paddingTop: "24px" }}>
              <CapturePanel
                map={map}
                onAddNode={handleAddNode}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </div>

        {/* Right: layered DAG canvas OR 3D constellation, with floating overlay panel */}
        <div style={{ position: "relative", height: "100%" }} data-testid="depmap-canvas-area">
          {viewMode === "layered" ? (
            <LayeredView
              map={map}
              selectedId={selectedId}
              renamingId={renamingId}
              freshNodeIdsRef={freshNodeIds}
              onSelect={setSelectedId}
              onAddEdge={handleAddEdge}
              analysis={analysis}
              onUpdateNodePosition={handleUpdateNodePosition}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onRelayout={handleRelayout}
              onAddNodeAt={handleAddNodeAt}
              onAddConnectedNodeAt={handleAddConnectedNodeAt}
              onDuplicateNode={handleDuplicateNode}
              onRenameNode={handleRenameNode}
              onCancelRename={handleCancelRename}
              onStartRename={handleStartRename}
              onSetRole={handleSetRole}
              onPushToMC={handlePushToMC}
              onFlipEdge={handleFlipEdge}
              onCycleEdgeSign={handleCycleEdgeSign}
              onToggleEdgeConfidence={handleToggleEdgeConfidence}
              onRepointEdge={handleRepointEdge}
            />
          ) : (
            <Suspense
              fallback={
                <div className="meta" style={{ padding: "24px", color: "var(--ink-dim)" }}>
                  loading 3D…
                </div>
              }
            >
              <ConstellationView
                map={map}
                analysis={analysis}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </Suspense>
          )}

          {/* Direction hint — bottom of canvas, offset right of the react-flow
              Controls (+/− buttons) which sit at bottom-left ~40px wide. */}
          <div
            style={{
              position: "absolute",
              bottom: "10px",
              left: "56px",
              fontSize: "10px",
              color: "var(--ink-faint)",
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "0.02em",
            }}
          >
            Drag from a driver → to what it depends on / affects.
          </div>

          {/* ── Floating right overlay panel ────────────────────────────────
           *  Sits at top:40px so the Tidy button (absolute top:8, right:8 inside
           *  LayeredView) is never covered — the ~32px gap keeps both visible.
           *  z-index 20: above the canvas (0) and loop badges (8) / empty-state (5)
           *  / Tidy (10), but below context menus (portalled to body, typically
           *  z:50+) and the open-map dialog (z:50).
           *  backdrop-filter blur gives the frosted-glass effect requested.
           *
           *  OPEN: the panel is a frosted-glass card with the toggle embedded in
           *  its own slim header row — the toggle is visually attached to the panel,
           *  never floating disconnected above it.
           *
           *  COLLAPSED: a slim 22px-wide vertical tab docked flush to the canvas's
           *  right edge (right:0, no overflow). The ○ glyph is centred inside the
           *  tab with a writing-mode rotation so it stays readable.
           ────────────────────────────────────────────────────────────────── */}
          <div
            data-testid="depmap-overlay-panel"
            style={{
              position: "absolute",
              top: "40px",
              right: "0",
              zIndex: 20,
              maxHeight: "calc(100% - 48px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            {panelPinned ? (
              /* ── OPEN state: panel card with integrated header row ── */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "310px",
                  maxHeight: "calc(100vh - 48px - 40px)",
                  background: "rgba(21, 19, 15, 0.88)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  borderLeft: "1px solid var(--paper-rule)",
                  borderBottom: "1px solid var(--paper-rule)",
                  borderRadius: "0 0 0 6px",
                  boxShadow: "-4px 4px 20px rgba(0,0,0,0.35)",
                }}
              >
                {/* Header row: slim bar housing the collapse toggle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "4px 6px",
                    borderBottom: "1px solid var(--paper-rule)",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={togglePanelPinned}
                    title="Collapse side panel"
                    aria-label="Collapse side panel"
                    data-testid="depmap-panel-toggle"
                    style={{
                      background: "var(--sec-depmap)",
                      border: "1px solid var(--paper-rule)",
                      borderRadius: "3px",
                      color: "#fff",
                      fontSize: "9px",
                      padding: "4px 6px",
                      cursor: "pointer",
                      lineHeight: 1,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    ●
                  </button>
                </div>

                {/* Panel body */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "12px 14px",
                  }}
                >
                  <ReadoutPanel
                    map={map}
                    readout={analysis.readout}
                    onSelect={setSelectedId}
                    onPushToMC={handlePushToMC}
                  />
                  <NodeInspector
                    node={selectedNode}
                    onUpdate={handleUpdateNode}
                    onDelete={handleDeleteNode}
                    onClose={() => setSelectedId(null)}
                    onPushToMC={handlePushToMC}
                    onUnlinkMC={handleUnlinkMC}
                  />
                  <StructurePanel map={map} selectedId={selectedId} />
                </div>
              </div>
            ) : (
              /* ── COLLAPSED state: slim vertical tab flush to right edge ── */
              <button
                onClick={togglePanelPinned}
                title="Expand side panel"
                aria-label="Expand side panel"
                data-testid="depmap-panel-toggle"
                style={{
                  width: "22px",
                  padding: "10px 0",
                  background: "var(--paper-raised)",
                  border: "1px solid var(--paper-rule)",
                  borderRight: "none",
                  borderRadius: "4px 0 0 4px",
                  color: "var(--ink-dim)",
                  fontSize: "9px",
                  cursor: "pointer",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s, color 0.15s",
                  writingMode: "vertical-rl",
                  letterSpacing: "0.08em",
                }}
              >
                ○
              </button>
            )}
          </div>
        </div>
      </div>
    </ModuleFrame>
  );
}

// --- tiny shared button styles -----------------------------------------------

const btnStyle: React.CSSProperties = {
  background: "var(--paper-raised)",
  color: "var(--ink)",
  border: "1px solid var(--paper-rule)",
  borderRadius: "4px",
  padding: "4px 10px",
  fontSize: "12px",
  cursor: "pointer",
  fontFamily: "var(--font-display, inherit)",
};

/** Icon-only button: square, same border/radius as btnStyle, centered 16px icon. */
const iconBtnStyle: React.CSSProperties = {
  background: "var(--paper-raised)",
  color: "var(--ink)",
  border: "1px solid var(--paper-rule)",
  borderRadius: "4px",
  padding: "5px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};

const iconToggleStyle: React.CSSProperties = {
  ...iconBtnStyle,
  color: "var(--ink-dim)",
};

const activeIconBtnStyle: React.CSSProperties = {
  ...iconBtnStyle,
  background: "var(--sec-depmap)",
  color: "#fff",
  border: "1px solid var(--sec-depmap)",
};
