/**
 * ModuleFrame.test.tsx — TDD tests for Fix 1: full-width layout when no marginalia.
 *
 * The offending default: grid-cols-[1fr_220px] max-w-[1180px] always reserved a
 * 220px aside column even when `marginalia` was absent.  After the fix, the
 * grid must collapse to a single content column and no max-width cap.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ModuleFrame } from "../../src/renderer/components/ModuleFrame";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Layout without marginalia (§ IV — DependencyMap)
// ---------------------------------------------------------------------------

describe("ModuleFrame — no marginalia (full-width layout)", () => {
  it("grid wrapper does NOT have the two-column class when marginalia is absent", () => {
    const { container } = render(
      <ModuleFrame section="§ IV" kicker="Consequence" title="Dependency Map" accent="#8b7cf8">
        <div>content</div>
      </ModuleFrame>
    );
    // The inner grid div must NOT contain grid-cols-[1fr_220px]
    const gridDiv = container.querySelector(".grid");
    expect(gridDiv).toBeInTheDocument();
    expect(gridDiv!.className).not.toContain("grid-cols-[1fr_220px]");
  });

  it("grid wrapper uses a single-column class when marginalia is absent", () => {
    const { container } = render(
      <ModuleFrame section="§ IV" kicker="Consequence" title="Dependency Map" accent="#8b7cf8">
        <div>content</div>
      </ModuleFrame>
    );
    const gridDiv = container.querySelector(".grid");
    // Must have a class that expresses single-column (grid-cols-1 or similar)
    expect(gridDiv!.className).toMatch(/grid-cols-1/);
  });

  it("grid wrapper does NOT have max-w-[1180px] when marginalia is absent", () => {
    const { container } = render(
      <ModuleFrame section="§ IV" kicker="Consequence" title="Dependency Map" accent="#8b7cf8">
        <div>content</div>
      </ModuleFrame>
    );
    const gridDiv = container.querySelector(".grid");
    expect(gridDiv!.className).not.toContain("max-w-[1180px]");
  });

  it("article element is present and renders children", () => {
    const { container } = render(
      <ModuleFrame section="§ IV" kicker="Consequence" title="Dependency Map" accent="#8b7cf8">
        <div data-testid="child-content">hello</div>
      </ModuleFrame>
    );
    const article = container.querySelector("article");
    expect(article).toBeInTheDocument();
    expect(article!.querySelector("[data-testid='child-content']")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Layout WITH marginalia (§ I–III — unchanged)
// ---------------------------------------------------------------------------

describe("ModuleFrame — with marginalia (two-column layout preserved)", () => {
  it("grid wrapper retains the two-column class when marginalia is provided", () => {
    const { container } = render(
      <ModuleFrame
        section="§ I"
        kicker="Uncertainty"
        title="Monte Carlo"
        accent="#4ade80"
        marginalia={<div>side notes</div>}
      >
        <div>main content</div>
      </ModuleFrame>
    );
    const gridDiv = container.querySelector(".grid");
    expect(gridDiv!.className).toContain("grid-cols-[1fr_220px]");
  });

  it("grid wrapper retains max-w-[1180px] when marginalia is provided", () => {
    const { container } = render(
      <ModuleFrame
        section="§ I"
        kicker="Uncertainty"
        title="Monte Carlo"
        accent="#4ade80"
        marginalia={<div>side notes</div>}
      >
        <div>main content</div>
      </ModuleFrame>
    );
    const gridDiv = container.querySelector(".grid");
    expect(gridDiv!.className).toContain("max-w-[1180px]");
  });

  it("aside renders the marginalia content when provided", () => {
    const { container } = render(
      <ModuleFrame
        section="§ I"
        kicker="Uncertainty"
        title="Monte Carlo"
        accent="#4ade80"
        marginalia={<span data-testid="side-note">A side note</span>}
      >
        <div>content</div>
      </ModuleFrame>
    );
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside!.querySelector("[data-testid='side-note']")).toBeInTheDocument();
  });
});
