/**
 * mc-handoff-mc-side.test.tsx — Task 4 TDD: § I side — merged linked variables,
 * write-through editing, formula chip.
 *
 * Behaviours under test:
 *   B1  § I renders the linked variable in the list, badged "§ IV · <node label>"
 *       and node note shown as hint.
 *   B2  Editing the linked variable's distribution → maps.load(mapId) then
 *       maps.save with patched node.mc.distribution AND recomputed summary
 *       (assert p10 < p50 < p90 present in the saved payload).
 *   B3  Linked variable's NAME input is not editable (locked).
 *   B4  The "use <varName>" chip appears next to the formula input when a linked
 *       variable is not referenced in the current formula; clicking it inserts
 *       the varName into the formula draft. Chip hidden once referenced.
 *   B5  maps.load returning null → variable still shown, badge shows
 *       "link broken — now ad-hoc", NO save attempted on edit.
 *   B6  Ad-hoc addVariable name collision with a linked varName → dedups.
 *   B7  Merged variables all flow into setLatestMCVariables and the run config —
 *       assert the run payload passed to mcApi.run includes the linked variable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import { clearMcLinks, addMcLink } from "../../src/renderer/lib/mc-link-store";
import type { DependencyMap as DMap } from "@decision-forge/core";
import MonteCarlo from "../../src/renderer/pages/MonteCarlo";

afterEach(() => {
  cleanup();
  clearMcLinks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MAP_ID = "map-id-fixture-abc";
const NODE_ID = "node-id-fixture-xyz";
const VAR_NAME = "market_demand";
const NODE_LABEL = "Market demand";
const NODE_NOTE = "Biggest source of uncertainty in Q3";

function makeMapFixture(overrides?: Partial<DMap["nodes"][0]>): DMap {
  return {
    id: MAP_ID,
    name: "Test map",
    createdAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
    nodes: [
      {
        id: NODE_ID,
        label: NODE_LABEL,
        note: NODE_NOTE,
        role: "uncertainty",
        mc: {
          varName: VAR_NAME,
          distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
        },
        ...overrides,
      },
    ],
    edges: [],
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
function setupMocks(mapFixture: DMap | null = makeMapFixture()) {
  clearMcLinks();
  (window as any).api = {
    maps: {
      load: vi.fn().mockResolvedValue(mapFixture),
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    mc: {
      run: vi.fn().mockResolvedValue({
        samples: Array.from({ length: 100 }, (_, i) => i),
        stats: {
          mean: 50, sd: 28, min: 0, max: 99,
          p5: 5, p10: 10, p25: 25, p50: 50, p75: 75, p90: 90, p95: 95, p99: 99,
        },
        iterations: 100,
      }),
    },
  };
}

function seedLink() {
  addMcLink({ mapId: MAP_ID, nodeId: NODE_ID, varName: VAR_NAME });
}

// ---------------------------------------------------------------------------
// B1 — Renders the linked variable with badge and note
// ---------------------------------------------------------------------------
describe("B1 – linked variable renders with badge and note", () => {
  beforeEach(() => {
    setupMocks();
    seedLink();
  });

  it("shows the badge '§ IV · Market demand'", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByText(/§ IV/)).toBeInTheDocument();
      expect(screen.getByText(/Market demand/)).toBeInTheDocument();
    });
  });

  it("shows the node note as a hint", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByText(/Biggest source of uncertainty in Q3/)).toBeInTheDocument();
    });
  });

  it("renders the linked variable's varName in the card", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// B2 — Write-through: editing distribution saves to the map file with summary
// ---------------------------------------------------------------------------
describe("B2 – write-through: distribution edit patches the map file with recomputed summary", () => {
  beforeEach(() => {
    setupMocks();
    seedLink();
  });

  it("calls maps.load(mapId) then maps.save with patched distribution and p10<p50<p90", async () => {
    render(<MonteCarlo />);
    // Wait for the linked variable to appear
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const loadMock = (window as any).api.maps.load as ReturnType<typeof vi.fn>;
    const saveMock = (window as any).api.maps.save as ReturnType<typeof vi.fn>;

    // Find the linked variable's card (it has the § IV badge text)
    // and scope the mode input query to that card to avoid collisions with
    // the default ad-hoc triangular variable ("cost").
    const badge = screen.getByText(/§ IV/);
    const card = badge.closest(".specimen") as HTMLElement;
    expect(card).not.toBeNull();
    const modeInput = within(card).getByLabelText(/c\s+Mode/i);
    fireEvent.change(modeInput, { target: { value: "30" } });

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith(MAP_ID);
    });

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
    });

    const savedMap = saveMock.mock.calls[saveMock.mock.calls.length - 1][0] as DMap;
    const savedNode = savedMap.nodes.find((n) => n.id === NODE_ID)!;
    expect(savedNode).toBeDefined();
    expect(savedNode.mc).toBeDefined();
    expect(savedNode.mc!.distribution).toBeDefined();

    // Summary should be recomputed with valid p10 < p50 < p90
    const summary = savedNode.mc!.summary;
    expect(summary).toBeDefined();
    expect(summary!.p10).toBeLessThan(summary!.p50);
    expect(summary!.p50).toBeLessThan(summary!.p90);
  });
});

// ---------------------------------------------------------------------------
// B3 — Linked variable name is locked (not editable)
// ---------------------------------------------------------------------------
describe("B3 – linked variable name input is locked", () => {
  beforeEach(() => {
    setupMocks();
    seedLink();
  });

  it("the name input for a linked variable is disabled", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue(VAR_NAME);
    expect(nameInput).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// B4 — "use <varName>" chip appears and inserts into formula
// ---------------------------------------------------------------------------
describe("B4 – formula chip appears and inserts varName", () => {
  beforeEach(() => {
    setupMocks();
    seedLink();
  });

  it("shows a chip 'use market_demand' when the var is not in the formula", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    // The default formula is "revenue - cost" which doesn't contain "market_demand"
    // so the chip should appear
    await waitFor(() => {
      const chip = screen.getByRole("button", { name: /use market_demand/i });
      expect(chip).toBeInTheDocument();
    });
  });

  it("clicking the chip inserts the varName into the formula draft", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const chip = await screen.findByRole("button", { name: /use market_demand/i });
    fireEvent.click(chip);

    await waitFor(() => {
      const formulaEl = screen.getByLabelText(/outcome formula/i);
      expect((formulaEl as HTMLTextAreaElement).value).toContain(VAR_NAME);
    });
  });

  it("chip is hidden once the varName is referenced in the formula", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const chip = await screen.findByRole("button", { name: /use market_demand/i });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /use market_demand/i })).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// B5 — maps.load null → variable shown as broken, no save on edit
// ---------------------------------------------------------------------------
describe("B5 – broken link: maps.load null → shown ad-hoc, no save on edit", () => {
  beforeEach(() => {
    setupMocks(null); // load returns null = deleted map
    seedLink();
  });

  it("still shows the variable in the list", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });
  });

  it("shows a 'link broken' note instead of the normal badge", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByText(/link broken/i)).toBeInTheDocument();
    });
  });

  it("does NOT call maps.save when the broken-link variable is edited", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const saveMock = (window as any).api.maps.save as ReturnType<typeof vi.fn>;
    const callsBefore = saveMock.mock.calls.length;

    // Find the linked variable's card — it shows "link broken" text
    const brokenBadge = screen.getByText(/link broken/i);
    const card = brokenBadge.closest(".specimen") as HTMLElement;
    expect(card).not.toBeNull();
    // The broken card uses normal distribution (fallback); edit the SD input
    const sdInput = within(card).getByLabelText(/σ\s+SD/i);
    fireEvent.change(sdInput, { target: { value: "5" } });

    // Give async code time to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(saveMock.mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// B6 — Ad-hoc variable name deduplication against linked varNames
// ---------------------------------------------------------------------------
describe("B6 – ad-hoc addVariable deduplicates against linked varNames", () => {
  beforeEach(() => {
    setupMocks();
    // Seed a link with varName "x1" to collide with the default naming
    addMcLink({ mapId: MAP_ID, nodeId: NODE_ID, varName: "x1" });
    // Override the map to use x1
    (window as any).api.maps.load = vi.fn().mockResolvedValue({
      ...makeMapFixture(),
      nodes: [
        {
          id: NODE_ID,
          label: "Some uncertainty",
          role: "uncertainty",
          mc: {
            varName: "x1",
            distribution: { kind: "triangular", min: 0, mode: 0, max: 0 },
          },
        },
      ],
    });
  });

  it("adding an ad-hoc variable when x1 is linked produces a different name", async () => {
    render(<MonteCarlo />);

    // Wait for linked variable to appear
    await waitFor(() => {
      expect(screen.getByDisplayValue("x1")).toBeInTheDocument();
    });

    // Click "Append a variable" — the new ad-hoc variable should NOT be named x1
    fireEvent.click(screen.getByRole("button", { name: /append a variable/i }));

    await waitFor(() => {
      // There should be no duplicate x1 — the new one must have a different name
      const allInputs = screen.getAllByDisplayValue("x1");
      // Only one input should show x1 (the locked linked one)
      expect(allInputs.length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// B7 — Merged variables flow into run config (linked + ad-hoc both included)
// ---------------------------------------------------------------------------
describe("B7 – merged variables flow into mcApi.run", () => {
  beforeEach(() => {
    setupMocks();
    seedLink();
  });

  it("mcApi.run receives the linked variable in its config", async () => {
    render(<MonteCarlo />);

    // Wait for linked variable to appear
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    // Click Run
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      const runMock = (window as any).api.mc.run as ReturnType<typeof vi.fn>;
      expect(runMock).toHaveBeenCalled();
      const config = runMock.mock.calls[0]![0];
      const varNames = config.variables.map((v: { name: string }) => v.name);
      expect(varNames).toContain(VAR_NAME);
    });
  });

  it("merged variables are also published to setLatestMCVariables (visible via mc-store)", async () => {
    const { getLatestMCVariables } = await import("../../src/renderer/lib/mc-store");
    render(<MonteCarlo />);

    await waitFor(() => {
      const vars = getLatestMCVariables();
      const varNames = vars.map((v) => v.name);
      expect(varNames).toContain(VAR_NAME);
    });
  });
});

// ---------------------------------------------------------------------------
// B8 — Broken link GENUINELY falls back to ad-hoc: edits stick, feed runs,
//      name becomes editable, no maps.save attempted.
// ---------------------------------------------------------------------------
describe("B8 – broken link promotes to ad-hoc: edits stick and feed runs", () => {
  beforeEach(() => {
    setupMocks(null); // maps.load returns null = deleted map
    seedLink();
  });

  it("an edit to the promoted variable STICKS and appears in the run config; no maps.save", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const saveMock = (window as any).api.maps.save as ReturnType<typeof vi.fn>;

    // Find the broken card and edit the SD param (fallback normal distribution)
    const brokenBadge = screen.getByText(/link broken/i);
    const card = brokenBadge.closest(".specimen") as HTMLElement;
    expect(card).not.toBeNull();
    fireEvent.change(within(card).getByLabelText(/σ\s+SD/i), { target: { value: "7" } });

    // Let any async write-through (there must be none) settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The edit STICKS — input did not snap back to the placeholder value
    expect(
      (within(card).getByLabelText(/σ\s+SD/i) as HTMLInputElement).value
    ).toBe("7");

    // And it feeds the run config
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      const runMock = (window as any).api.mc.run as ReturnType<typeof vi.fn>;
      expect(runMock).toHaveBeenCalled();
      const cfg = runMock.mock.calls[0]![0];
      const v = cfg.variables.find((x: { name: string }) => x.name === VAR_NAME);
      expect(v).toBeDefined();
      expect(v.distribution.kind).toBe("normal");
      expect(v.distribution.sd).toBe(7);
    });

    // Never any write-through for a broken link
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("the promoted variable's name input is editable (truly ad-hoc, not locked)", async () => {
    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(VAR_NAME)).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// B9 — Write-throughs are SERIALIZED: rapid successive edits to different
//      params must BOTH be present in the final saved payload.
// ---------------------------------------------------------------------------
describe("B9 – write-throughs serialized: rapid edits both persist", () => {
  it("two quick edits to different params are both in the final saved payload", async () => {
    clearMcLinks();
    // Emulate disk: load returns the latest saved map (or the fixture);
    // saves are DEFERRED so the second write-through overlaps the first.
    let lastSaved: DMap | null = null;
    const pendingResolves: Array<() => void> = [];
    (window as any).api = {
      maps: {
        load: vi.fn().mockImplementation(() => Promise.resolve(lastSaved ?? makeMapFixture())),
        save: vi.fn().mockImplementation((m: DMap) => {
          lastSaved = m;
          return new Promise<void>((res) => pendingResolves.push(() => res()));
        }),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      mc: { run: vi.fn() },
    };
    seedLink();

    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    const badge = screen.getByText(/§ IV/);
    const card = badge.closest(".specimen") as HTMLElement;
    const saveMock = (window as any).api.maps.save as ReturnType<typeof vi.fn>;

    // Two rapid edits: min then max — before any save resolves
    fireEvent.change(within(card).getByLabelText(/a\s+Min/i), { target: { value: "5" } });
    fireEvent.change(within(card).getByLabelText(/b\s+Max/i), { target: { value: "60" } });

    // Serialization contract: only ONE save in flight at a time
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await act(async () => { pendingResolves[0]!(); });

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    await act(async () => { pendingResolves[1]!(); });

    // BOTH edits present in the final payload
    const finalMap = saveMock.mock.calls[1]![0] as DMap;
    const dist = finalMap.nodes.find((n) => n.id === NODE_ID)!.mc!.distribution;
    expect(dist.kind).toBe("triangular");
    if (dist.kind === "triangular") {
      expect(dist.min).toBe(5);
      expect(dist.max).toBe(60);
    }
  });
});

// ---------------------------------------------------------------------------
// B10 — Save failure mid-session promotes the variable to ad-hoc with the
//       edit preserved; no further save attempts.
// ---------------------------------------------------------------------------
describe("B10 – save failure mid-session promotes to ad-hoc", () => {
  it("save rejection → ad-hoc with edit preserved, name editable, no further saves", async () => {
    setupMocks(); // valid map fixture
    (window as any).api.maps.save = vi.fn().mockRejectedValue(new Error("disk full"));
    seedLink();

    render(<MonteCarlo />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VAR_NAME)).toBeInTheDocument();
    });

    // Edit the mode param on the linked card → write-through save fails
    const badge = screen.getByText(/§ IV/);
    const card = badge.closest(".specimen") as HTMLElement;
    fireEvent.change(within(card).getByLabelText(/c\s+Mode/i), { target: { value: "30" } });

    // Promotion: broken note appears
    await waitFor(() => {
      expect(screen.getByText(/link broken/i)).toBeInTheDocument();
    });

    // The edit is preserved on the promoted card
    const brokenCard = screen.getByText(/link broken/i).closest(".specimen") as HTMLElement;
    expect(
      (within(brokenCard).getByLabelText(/c\s+Mode/i) as HTMLInputElement).value
    ).toBe("30");

    // Name is now editable
    expect(screen.getByDisplayValue(VAR_NAME)).not.toBeDisabled();

    // Further edits do NOT attempt another save
    const saveMock = (window as any).api.maps.save as ReturnType<typeof vi.fn>;
    const callsAfterPromotion = saveMock.mock.calls.length;
    fireEvent.change(within(brokenCard).getByLabelText(/c\s+Mode/i), { target: { value: "35" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(saveMock.mock.calls.length).toBe(callsAfterPromotion);
  });
});
