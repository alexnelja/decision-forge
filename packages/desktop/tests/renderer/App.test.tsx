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
    expect(screen.getByRole("link", { name: /monte carlo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /negotiation/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /forecast/i })).toBeInTheDocument();
  });
});
