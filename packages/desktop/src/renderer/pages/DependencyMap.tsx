import { useState, lazy, Suspense } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap, DependencyEdge } from "@decision-forge/core";
import { CapturePanel } from "./depmap/CapturePanel";
import { LayeredView } from "./depmap/LayeredView";
import { StructurePanel } from "./depmap/StructurePanel";
import { NodeInspector } from "./depmap/NodeInspector";
import { useAnalysis } from "./depmap/useAnalysis";
import { mapsApi } from "../lib/maps-api";

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

export default function DependencyMap() {
  const [map, setMap] = useState<DMap>(makeEmpty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("layered");
  // Collapsible capture sidebar: starts pinned open; unpin to get the thin rail.
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinned || sidebarHovered;

  // Open-dialog state: null = closed, array = list of maps available to load
  const [openList, setOpenList] = useState<Array<{ id: string; name: string }> | null>(null);

  // Compute analysis ONCE here and pass down to both LayeredView and StructurePanel.
  const analysis = useAnalysis(map);

  function handleAddNode(label: string) {
    const now = new Date().toISOString();
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: crypto.randomUUID(), label }],
      updatedAt: now,
    }));
  }

  function handleAddEdge(from: string, to: string) {
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
  }

  function handleUpdateNodePosition(id: string, pos: { x: number; y: number }) {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === id ? { ...n, position: pos } : n
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleDeleteNode(id: string) {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.from !== id && e.to !== id),
      updatedAt: new Date().toISOString(),
    }));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  function handleDeleteEdge(id: string) {
    setMap((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleUpdateNode(id: string, patch: { label?: string; note?: string }) {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleRelayout(positions: Map<string, { x: number; y: number }>) {
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
      updatedAt: new Date().toISOString(),
    }));
  }

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
      marginalia={
        <>
          <NodeInspector
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedId(null)}
          />
          <StructurePanel map={map} selectedId={selectedId} />
        </>
      }
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

        {/* Persistence buttons */}
        <button
          onClick={handleSave}
          style={btnStyle}
          title="Save this map"
          data-testid="map-save"
        >
          Save
        </button>
        <button
          onClick={handleOpen}
          style={btnStyle}
          title="Open a saved map"
        >
          Open
        </button>
        <button
          onClick={handleNew}
          style={btnStyle}
          title="Start a new empty map"
        >
          New
        </button>

        {/* View-mode toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          <button
            onClick={() => setViewMode("layered")}
            style={viewMode === "layered" ? activeToggleStyle : toggleStyle}
            aria-pressed={viewMode === "layered"}
          >
            Layered
          </button>
          <button
            onClick={() => setViewMode("3d")}
            style={viewMode === "3d" ? activeToggleStyle : toggleStyle}
            aria-pressed={viewMode === "3d"}
          >
            3D
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

          {/* Pin/unpin toggle — always visible */}
          <button
            onClick={() => setSidebarPinned((p) => !p)}
            title={sidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
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
              padding: "2px 4px",
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

        {/* Right: layered DAG canvas OR 3D constellation */}
        <div style={{ position: "relative", height: "100%" }}>
          {viewMode === "layered" ? (
            <LayeredView
              map={map}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddEdge={handleAddEdge}
              analysis={analysis}
              onUpdateNodePosition={handleUpdateNodePosition}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onRelayout={handleRelayout}
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

          {/* Direction hint — bottom-left of canvas */}
          <div
            style={{
              position: "absolute",
              bottom: "10px",
              left: "12px",
              fontSize: "10px",
              color: "var(--ink-faint)",
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "0.02em",
            }}
          >
            Drag from a driver → to what it depends on / affects.
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

const toggleStyle: React.CSSProperties = {
  ...btnStyle,
  color: "var(--ink-dim)",
};

const activeToggleStyle: React.CSSProperties = {
  ...btnStyle,
  background: "var(--sec-depmap)",
  color: "#fff",
  border: "1px solid var(--sec-depmap)",
};
