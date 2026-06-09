import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
it("renders the § IV heading", () => {
  render(<MemoryRouter><DependencyMap /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /dependency map/i })).toBeInTheDocument();
});
