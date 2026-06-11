/**
 * context-menu-portal.test.tsx — TDD tests for Bug 2 (portal context menu).
 *
 * Verifies that ContextMenu renders into document.body via a React portal,
 * not into the react-flow transformed ancestor tree. The key observable:
 * the menu's immediate parent in the DOM should be document.body, NOT a
 * descendant of the canvas wrapper.
 *
 * Portal rendering still makes the menu findable via screen.* queries
 * (RTL queries document-wide), but the menu's DOM parent changes.
 */

import { it, expect, describe, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";

afterEach(cleanup);

describe("ContextMenu — portal to document.body", () => {
  it("pane right-click: menu element is a child of document.body, not the canvas", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const pane = container.querySelector(".react-flow__pane");
    if (pane) {
      fireEvent.contextMenu(pane, { clientX: 100, clientY: 100 });
    }

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    // With a portal, the menu's parent is document.body (or a direct child div of body).
    // Without a portal, the menu lives inside the canvas container div.
    const canvasWrapper = container.querySelector("[data-testid='depmap-canvas']");
    expect(canvasWrapper).toBeInTheDocument();

    // The menu must NOT be inside the canvas wrapper
    expect(canvasWrapper?.contains(menu)).toBe(false);

    // The menu IS inside document.body
    expect(document.body.contains(menu)).toBe(true);
  });

  it("node right-click: node menu is also portalled to document.body", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Add a node so we can right-click it
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "TestNode" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });

    // Right-click the node
    const node = container.querySelector(".react-flow__node")!;
    fireEvent.contextMenu(node, { clientX: 100, clientY: 100 });

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    const canvasWrapper = container.querySelector("[data-testid='depmap-canvas']");
    expect(canvasWrapper?.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it("menu still closes on Escape after portal (event bubbles to document)", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const pane = container.querySelector(".react-flow__pane");
    if (pane) {
      fireEvent.contextMenu(pane);
    }

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    // Escape on document.body closes the portalled menu (avoid firing on document
    // directly which can trigger react-flow's internal keyboard handler in jsdom)
    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("menu still closes on pointer-down outside (click-away) after portal", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const pane = container.querySelector(".react-flow__pane");
    if (pane) {
      fireEvent.contextMenu(pane);
    }

    await screen.findByRole("menu");

    // Pointer-down on body (outside menu)
    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("clamping still works — menu position stays within window bounds", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const pane = container.querySelector(".react-flow__pane")!;
    // Extreme coordinates that should be clamped
    fireEvent.contextMenu(pane, { clientX: 5000, clientY: 5000 });

    const menu = await screen.findByRole("menu");
    await waitFor(() => {
      const left = parseFloat((menu as HTMLElement).style.left);
      const top = parseFloat((menu as HTMLElement).style.top);
      expect(left).toBeLessThanOrEqual(window.innerWidth);
      expect(top).toBeLessThanOrEqual(window.innerHeight);
    });
  });
});
