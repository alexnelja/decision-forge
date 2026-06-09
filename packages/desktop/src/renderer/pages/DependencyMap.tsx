import { useState, lazy, Suspense } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap, DependencyEdge } from "@decision-forge/core";
import { CapturePanel } from "./depmap/CapturePanel";
import { LayeredView } from "./depmap/LayeredView";
import { StructurePanel } from "./depmap/StructurePanel";
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

  // --- persistence handlers -------------------------------------------------

  async function handleSave() {
    const updated = { ...map, updatedAt: new Date().toISOString() };
    setMap(updated);
    await mapsApi.save(updated);
  }

  async function handleOpen() {
    const list = await mapsApi.list();
    setOpenList(list);
  }

  async function handleLoadMap(id: string) {
    const loaded = await mapsApi.load(id);
    if (loaded) {
      setMap(loaded);
      setSelectedId(null);
    }
    setOpenList(null);
  }

  function handleNew() {
    setMap(makeEmpty());
    setSelectedId(null);
    setOpenList(null);
  }

  return (
    <ModuleFrame
      section="§ IV"
      kicker="Consequence"
      title="Dependency Map"
      accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
      marginalia={<StructurePanel map={map} selectedId={selectedId} />}
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
          gridTemplateColumns: "260px 1fr",
          gap: "24px",
          height: "540px",
        }}
      >
        {/* Left: capture panel */}
        <div
          style={{
            borderRight: "1px solid var(--paper-rule)",
            paddingRight: "20px",
            overflowY: "auto",
          }}
        >
          <CapturePanel
            map={map}
            onAddNode={handleAddNode}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right: layered DAG canvas OR 3D constellation */}
        <div style={{ position: "relative" }}>
          {viewMode === "layered" ? (
            <LayeredView
              map={map}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddEdge={handleAddEdge}
              analysis={analysis}
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
