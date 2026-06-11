import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for jsdom — required by ReactFlow and similar canvas libs.
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
