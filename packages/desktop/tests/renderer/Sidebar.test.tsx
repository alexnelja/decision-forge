/**
 * Sidebar.test.tsx — Task 8: collapsible Contents nav tests.
 *
 * TDD Step 1 (failing):
 *  - Sidebar renders pinned by default (nav links visible)
 *  - Unpin button collapses to a thin rail (nav links hidden, vertical "Contents" label visible)
 *  - Hover over the rail reveals the nav
 *  - Pin state persisted to localStorage("df.sidebar.pinned")
 *  - Starting with key="false" → starts collapsed; no key → pinned
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../../src/renderer/components/Sidebar";

// ---------------------------------------------------------------------------
// localStorage mock — jsdom in this env does not provide localStorage.
// We provide a simple in-memory implementation so Sidebar's persistence works.
// ---------------------------------------------------------------------------
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
  localStorageMock.clear();
});

afterEach(() => {
  cleanup();
  localStorageMock.clear();
});

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar — default pinned state", () => {
  it("renders nav links by default (pinned)", () => {
    renderSidebar();
    // The nav links for the four modules should be visible
    expect(screen.getByRole("link", { name: /monte carlo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /negotiation/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dependency map/i })).toBeInTheDocument();
  });

  it("shows the Contents eyebrow heading when pinned", () => {
    renderSidebar();
    expect(screen.getByText(/contents/i)).toBeInTheDocument();
  });
});

describe("Sidebar — unpin collapses to rail", () => {
  it("unpin button is present with an accessible name (aria-label)", () => {
    renderSidebar();
    // Pin toggle button (● when pinned) — must be announced by name, not
    // "black circle, button"
    const pinBtn = screen.getByRole("button", { name: "Unpin sidebar" });
    expect(pinBtn).toBeInTheDocument();
    expect(pinBtn).toHaveAttribute("title", "Unpin sidebar");
  });

  it("after unpin (and mouse leave), nav links are hidden", () => {
    const { container } = renderSidebar();
    const pinBtn = screen.getByRole("button", { name: "Unpin sidebar" });
    fireEvent.click(pinBtn);
    // Ensure no lingering hover state keeps the panel open
    const sidebarEl = container.querySelector("nav");
    if (sidebarEl) fireEvent.mouseLeave(sidebarEl);

    // When collapsed, nav links are not rendered at all
    expect(container.querySelectorAll("a[href]").length).toBe(0);
    // The collapsed rail still shows the vertical "Contents" label
    expect(screen.getByText(/contents/i)).toBeInTheDocument();
  });

  it("collapsed pin button has the accessible name 'Pin sidebar open'", () => {
    localStorage.setItem("df.sidebar.pinned", "false");
    renderSidebar();
    expect(screen.getByRole("button", { name: "Pin sidebar open" })).toBeInTheDocument();
  });

  it("after unpin, a vertical 'Contents' label appears in the rail", () => {
    renderSidebar();
    const pinBtn = screen.getByTitle(/unpin sidebar/i);
    fireEvent.click(pinBtn);
    // The vertical label text is still visible
    expect(screen.getByText(/contents/i)).toBeInTheDocument();
  });

  it("unpin button shows ○ (unpinned) after clicking", () => {
    renderSidebar();
    const pinBtn = screen.getByTitle(/unpin sidebar/i);
    fireEvent.click(pinBtn);
    // After unpin, button now shows "Pin sidebar open" title and ○ character
    expect(screen.getByTitle(/pin sidebar open/i)).toBeInTheDocument();
  });

  it("hover over collapsed rail reveals the nav links", () => {
    const { container } = renderSidebar();
    const pinBtn = screen.getByTitle(/unpin sidebar/i);
    fireEvent.click(pinBtn);

    // Find the sidebar container and hover over it
    const sidebarEl = container.querySelector("nav");
    if (sidebarEl) {
      fireEvent.mouseEnter(sidebarEl);
    }

    // After hover, the nav links should be visible again
    expect(screen.getByRole("link", { name: /monte carlo/i })).toBeInTheDocument();
  });

  it("mouse leave collapses the rail again after hover", () => {
    const { container } = renderSidebar();
    const pinBtn = screen.getByTitle(/unpin sidebar/i);
    fireEvent.click(pinBtn);

    const sidebarEl = container.querySelector("nav");
    if (sidebarEl) {
      fireEvent.mouseEnter(sidebarEl);
      fireEvent.mouseLeave(sidebarEl);
    }

    // After mouseleave, the nav links should be hidden again
    // The links should not be rendered (collapsed state)
    const links = container.querySelectorAll("a[href]");
    expect(links.length).toBe(0);
  });
});

describe("Sidebar — localStorage persistence", () => {
  it("default (no key) → starts pinned", () => {
    localStorage.removeItem("df.sidebar.pinned");
    renderSidebar();
    // Pinned = nav links visible
    expect(screen.getByRole("link", { name: /monte carlo/i })).toBeInTheDocument();
    expect(screen.getByTitle(/unpin sidebar/i)).toBeInTheDocument();
  });

  it("localStorage key = 'false' → starts collapsed (rail mode)", () => {
    localStorage.setItem("df.sidebar.pinned", "false");
    const { container } = renderSidebar();

    // Should start collapsed: no nav links rendered
    const links = container.querySelectorAll("a[href]");
    expect(links.length).toBe(0);
    // Pin button shows ○
    expect(screen.getByTitle(/pin sidebar open/i)).toBeInTheDocument();
  });

  it("localStorage key = 'true' → starts pinned", () => {
    localStorage.setItem("df.sidebar.pinned", "true");
    renderSidebar();
    expect(screen.getByRole("link", { name: /monte carlo/i })).toBeInTheDocument();
    expect(screen.getByTitle(/unpin sidebar/i)).toBeInTheDocument();
  });

  it("pinning writes 'true' to localStorage", () => {
    localStorage.setItem("df.sidebar.pinned", "false");
    renderSidebar();
    // Start collapsed, then pin
    const pinBtn = screen.getByTitle(/pin sidebar open/i);
    fireEvent.click(pinBtn);
    expect(localStorage.getItem("df.sidebar.pinned")).toBe("true");
  });

  it("unpinning writes 'false' to localStorage", () => {
    renderSidebar();
    const pinBtn = screen.getByTitle(/unpin sidebar/i);
    fireEvent.click(pinBtn);
    expect(localStorage.getItem("df.sidebar.pinned")).toBe("false");
  });
});
