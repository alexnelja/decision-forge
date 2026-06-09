import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";

afterEach(cleanup);

// Mock window.api.maps so we can test persistence without Electron IPC.
beforeEach(() => {
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("DependencyMap page", () => {
  it("renders the § IV heading", () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /dependency map/i })).toBeInTheDocument();
  });

  it("clicking Save calls window.api.maps.save with the current map", async () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const saveBtn = screen.getByTestId("map-save");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect((window as any).api.maps.save).toHaveBeenCalledTimes(1);
    });

    // Verify the argument is a DependencyMap-shaped object (has id, name, nodes, edges).
    const arg = (window as any).api.maps.save.mock.calls[0][0];
    expect(arg).toMatchObject({
      name: expect.any(String),
      nodes: expect.any(Array),
      edges: expect.any(Array),
    });
    expect(typeof arg.id).toBe("string");
  });
});
