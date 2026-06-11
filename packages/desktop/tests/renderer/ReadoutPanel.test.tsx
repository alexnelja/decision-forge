/**
 * ReadoutPanel.test.tsx — TDD tests for the Decision Readout panel.
 *
 * Tests written BEFORE implementation (TDD step 1 — expect FAIL until code exists).
 *
 * ReadoutPanel renders decisionReadout(map) output:
 *  - guidance copy when no roles set
 *  - ACT FIRST section with lever label + reason
 *  - RESOLVE NEXT section with uncertainty label + reason
 *  - PLAN AROUND section with loop info (⟳ reinforcing / ⇋ balancing)
 *  - clicking a row calls onSelect(nodeId)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReadoutPanel } from "../../src/renderer/pages/depmap/ReadoutPanel";
import type { DependencyMap as DMap } from "@decision-forge/core";
import { decisionReadout } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixture maps
// ---------------------------------------------------------------------------

const OBJ_ID  = "00000000-0000-4000-8000-000000000001";
const LEV_ID  = "00000000-0000-4000-8000-000000000002";
const UNC_ID  = "00000000-0000-4000-8000-000000000003";
const FAC_ID  = "00000000-0000-4000-8000-000000000004";
const CYCA_ID = "00000000-0000-4000-8000-000000000005";
const CYCB_ID = "00000000-0000-4000-8000-000000000006";

/** Map with no roles at all — guidance path. */
function makeNoRoleMap(): DMap {
  return {
    id: "map-no-roles",
    name: "No roles",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: FAC_ID, label: "Factor A" },
      { id: CYCA_ID, label: "Cycle A" },
      { id: CYCB_ID, label: "Cycle B" },
    ],
    edges: [
      { id: "e1", from: FAC_ID, to: CYCA_ID },
      { id: "e2", from: CYCA_ID, to: CYCB_ID },
      { id: "e3", from: CYCB_ID, to: CYCA_ID }, // reinforcing cycle
    ],
  };
}

/** Map with all roles set — full readout path. */
function makeFullRoleMap(): DMap {
  return {
    id: "map-full",
    name: "Full roles",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: OBJ_ID,  label: "Objective",    role: "objective" },
      { id: LEV_ID,  label: "Rail Lever",   role: "lever" },
      { id: UNC_ID,  label: "Tender Risk",  role: "uncertainty" },
      { id: FAC_ID,  label: "Port Factor",  role: "factor" },
    ],
    edges: [
      { id: "e1", from: LEV_ID, to: FAC_ID },
      { id: "e2", from: FAC_ID, to: OBJ_ID },
      { id: "e3", from: UNC_ID, to: FAC_ID },
    ],
  };
}

/** Map with a cycle (for PLAN AROUND loop items). */
function makeCyclicMap(): DMap {
  return {
    id: "map-cyclic",
    name: "Cyclic",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: OBJ_ID,  label: "Goal",         role: "objective" },
      { id: LEV_ID,  label: "My Lever",     role: "lever" },
      { id: CYCA_ID, label: "Price",        role: "factor" },
      { id: CYCB_ID, label: "Volume",       role: "factor" },
    ],
    edges: [
      { id: "e1", from: LEV_ID,  to: CYCA_ID },
      { id: "e2", from: CYCA_ID, to: CYCB_ID },
      { id: "e3", from: CYCB_ID, to: CYCA_ID }, // reinforcing cycle
      { id: "e4", from: CYCB_ID, to: OBJ_ID },
    ],
  };
}

/** Map with a balancing cycle (1 minus edge). */
function makeBalancingMap(): DMap {
  return {
    id: "map-balancing",
    name: "Balancing",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: OBJ_ID,  label: "Target",   role: "objective" },
      { id: CYCA_ID, label: "Supply",   role: "factor" },
      { id: CYCB_ID, label: "Demand",   role: "factor" },
    ],
    edges: [
      { id: "e1", from: CYCA_ID, to: CYCB_ID, sign: "-" },
      { id: "e2", from: CYCB_ID, to: CYCA_ID },             // 1 minus → balancing
      { id: "e3", from: CYCB_ID, to: OBJ_ID },
    ],
  };
}

// ---------------------------------------------------------------------------
// Guidance copy — no roles set
// ---------------------------------------------------------------------------

describe("ReadoutPanel — empty map", () => {
  it("renders nothing when the map has no nodes (blank canvas shows its own hint)", () => {
    const map: DMap = {
      id: "map-empty",
      name: "Empty",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      nodes: [],
      edges: [],
    };
    const readout = decisionReadout(map);

    const { container } = render(
      <ReadoutPanel map={map} readout={readout} onSelect={vi.fn()} />
    );

    // No premature "Mark your objective…" noise on a blank canvas
    expect(screen.queryByText(/mark your objective/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/decision readout/i)).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});

describe("ReadoutPanel — guidance (no roles)", () => {
  it("shows the exact guidance string from core when no roles are set", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    // The exact guidance string from core — do NOT re-hardcode: verify it matches.
    expect(readout.guidance).not.toBeNull();
    expect(screen.getByText(readout.guidance!)).toBeInTheDocument();
  });

  it("does NOT show ACT FIRST or RESOLVE NEXT sections when guidance is shown without roles", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    // No roles → actFirst and resolveNext are empty → those sections are hidden
    expect(screen.queryByText(/act first/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/resolve next/i)).not.toBeInTheDocument();
  });

  it("still shows PLAN AROUND with a loop even when guidance is present (no roles)", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    // The cycle in the no-role map should still appear in PLAN AROUND
    expect(screen.getByText(/plan around/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Full roles — ACT FIRST / RESOLVE NEXT / PLAN AROUND populated
// ---------------------------------------------------------------------------

describe("ReadoutPanel — full roles", () => {
  it("renders DECISION READOUT header", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/decision readout/i)).toBeInTheDocument();
  });

  it("shows ACT FIRST section with lever label", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/act first/i)).toBeInTheDocument();
    // Lever label must appear in the ACT FIRST section
    expect(screen.getByText(/rail lever/i)).toBeInTheDocument();
  });

  it("shows ACT FIRST row with the reason from core", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    // The reason from core (e.g. "drives N factors → reaches the objective")
    const leverReason = readout.actFirst[0]?.reason;
    expect(leverReason).toBeTruthy();
    expect(screen.getByText(new RegExp(leverReason!, "i"))).toBeInTheDocument();
  });

  it("shows RESOLVE NEXT section with uncertainty label", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/resolve next/i)).toBeInTheDocument();
    expect(screen.getByText(/tender risk/i)).toBeInTheDocument();
  });

  it("clicking an ACT FIRST row calls onSelect with the lever nodeId", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);
    const onSelect = vi.fn();

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={onSelect}
      />
    );

    // Find the ACT FIRST row button and click it
    const leverBtn = screen.getByRole("button", { name: /rail lever/i });
    fireEvent.click(leverBtn);

    expect(onSelect).toHaveBeenCalledWith(LEV_ID);
  });

  it("clicking a RESOLVE NEXT row calls onSelect with the uncertainty nodeId", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);
    const onSelect = vi.fn();

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={onSelect}
      />
    );

    const uncBtn = screen.getByRole("button", { name: /tender risk/i });
    fireEvent.click(uncBtn);

    expect(onSelect).toHaveBeenCalledWith(UNC_ID);
  });
});

// ---------------------------------------------------------------------------
// PLAN AROUND — loop items (⟳ reinforcing / ⇋ balancing)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 2: Guidance legend — role glyph + description shown when guidance present
// ---------------------------------------------------------------------------

describe("ReadoutPanel — guidance legend (role descriptions)", () => {
  it("shows all four role glyphs in the legend when guidance is shown", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel map={map} readout={readout} onSelect={vi.fn()} />
    );

    // Guidance must be present for the legend to show
    expect(readout.guidance).toBeTruthy();
    // Each role glyph appears at least once (the guidance string also contains them,
    // so use getAllByText — we just need the legend spans to be present too).
    expect(screen.getAllByText(/◎/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/◆/).length).toBeGreaterThanOrEqual(1);
  });

  it("legend shows description text for objective", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel map={map} readout={readout} onSelect={vi.fn()} />
    );

    expect(screen.getByText(/outcome you.re deciding for/i)).toBeInTheDocument();
  });

  it("legend shows description text for lever", () => {
    const map = makeNoRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel map={map} readout={readout} onSelect={vi.fn()} />
    );

    expect(screen.getByText(/directly act on or change/i)).toBeInTheDocument();
  });

  it("legend does NOT show when guidance is absent (roles are set)", () => {
    const map = makeFullRoleMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel map={map} readout={readout} onSelect={vi.fn()} />
    );

    // No guidance → no legend copy
    expect(readout.guidance).toBeFalsy();
    // The legend description text must not appear
    expect(screen.queryByText(/outcome you.re deciding for/i)).not.toBeInTheDocument();
  });
});

describe("ReadoutPanel — PLAN AROUND loops", () => {
  it("shows ⟳ reinforcing label for a reinforcing cycle with node labels", () => {
    const map = makeCyclicMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/plan around/i)).toBeInTheDocument();
    // Should show ⟳ glyph and "reinforcing" — use getAllByText since the glyph
    // also appears in the section header span (aria-hidden) and the row text.
    expect(screen.getAllByText(/⟳/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/reinforcing/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows ⇋ balancing label for a balancing cycle", () => {
    const map = makeBalancingMap();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/⇋/)).toBeInTheDocument();
    expect(screen.getByText(/balancing/i)).toBeInTheDocument();
  });

  it("clicking a PLAN AROUND loop row calls onSelect with the first loop node", () => {
    const map = makeCyclicMap();
    const readout = decisionReadout(map);
    const onSelect = vi.fn();

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={onSelect}
      />
    );

    // Find the loop row button (contains ⟳) and click it
    const loopButtons = screen.getAllByRole("button").filter((btn) =>
      btn.textContent?.includes("⟳") || btn.textContent?.includes("reinforcing")
    );
    expect(loopButtons.length).toBeGreaterThan(0);
    fireEvent.click(loopButtons[0]!);

    // onSelect called with the first node of the loop
    expect(onSelect).toHaveBeenCalled();
    const callArg = onSelect.mock.calls[0][0] as string;
    // The first loop node should be one of the cyclic nodes
    expect([CYCA_ID, CYCB_ID]).toContain(callArg);
  });
});
