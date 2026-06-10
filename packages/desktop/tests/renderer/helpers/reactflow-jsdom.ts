/**
 * reactflow-jsdom.ts — jsdom layout shims that make react-flow v11 actually
 * render nodes/edges in jsdom.
 *
 * Usage: `import "./helpers/reactflow-jsdom";` at the top of a test file.
 * The shims register via beforeAll in the IMPORTING file's context, so vitest's
 * per-file jsdom isolation is preserved — each test file that imports this
 * helper gets the shims applied to its own fresh jsdom, and files that don't
 * import it are unaffected.
 *
 * What the shims do:
 *   1. ResizeObserver mock that invokes its callback on observe() — this is
 *      how react-flow's NodeRenderer learns node dimensions.
 *   2. DOMMatrixReadOnly stub reporting identity zoom — react-flow reads the
 *      viewport zoom via `new window.DOMMatrixReadOnly(style.transform).m22`.
 *   3. offsetWidth/offsetHeight overridden on HTMLElement.prototype so
 *      updateNodeDimensions sees non-zero size (100x40).
 */

import { beforeAll } from "vitest";

beforeAll(() => {
  // ResizeObserver that fires immediately on observe — react-flow's
  // NodeRenderer callback maps entries to { nodeElement: entry.target, ... }.
  global.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb([{ target: el } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // react-flow reads the viewport zoom via `new window.DOMMatrixReadOnly(
  // style.transform).m22` — jsdom has no DOMMatrixReadOnly, so stub one
  // that reports identity zoom.
  (window as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22 = 1;
    constructor(_transform?: string) {}
  };

  // Non-zero dimensions so updateNodeDimensions accepts the node.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 100;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 40;
    },
  });
});
