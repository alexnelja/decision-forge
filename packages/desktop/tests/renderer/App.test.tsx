import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../../src/renderer/App";

describe("App shell", () => {
  it("renders all three module links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("link", { name: /monte carlo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /negotiation/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /forecast/i }).length).toBeGreaterThan(0);
  });
});
