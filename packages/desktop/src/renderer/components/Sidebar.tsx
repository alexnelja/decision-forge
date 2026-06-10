import { useState } from "react";
import { NavLink } from "react-router-dom";

const modules = [
  { to: "/mc", roman: "I", label: "Monte Carlo", kicker: "Uncertainty", color: "var(--sec-mc)" },
  { to: "/negotiation", roman: "II", label: "Negotiation", kicker: "Rehearsal", color: "var(--sec-nego)" },
  { to: "/forecast", roman: "III", label: "Forecast", kicker: "Calibration", color: "var(--sec-forecast)" },
  { to: "/dependency-map", roman: "IV", label: "Dependency Map", kicker: "Consequence", color: "var(--sec-depmap)" }
];

/**
 * Read the pinned preference from localStorage. Guard against JSON/value errors
 * and default to true (pinned) when the key is absent or unparseable.
 */
function readPinned(): boolean {
  try {
    const stored = localStorage.getItem("df.sidebar.pinned");
    if (stored === null) return true; // default: pinned
    return stored !== "false";
  } catch {
    return true;
  }
}

export function Sidebar() {
  const [pinned, setPinned] = useState<boolean>(() => readPinned());
  const [hovered, setHovered] = useState(false);

  const sidebarOpen = pinned || hovered;

  function togglePin() {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("df.sidebar.pinned", String(next));
      } catch {
        // localStorage may be unavailable in some contexts — ignore
      }
      return next;
    });
  }

  return (
    <nav
      className="shrink-0 border-r border-paper-rule h-full flex flex-col bg-paper relative"
      style={{
        width: sidebarOpen ? "260px" : "14px",
        transition: "width 0.22s ease",
        overflow: "hidden",
        cursor: sidebarOpen ? "default" : "e-resize",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Collapsed rail: faint vertical "Contents" label */}
      {!sidebarOpen && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ink-faint)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          Contents
        </div>
      )}

      {/* Pin/unpin toggle — always visible */}
      <button
        onClick={togglePin}
        title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
        style={{
          position: "absolute",
          top: "6px",
          right: sidebarOpen ? "6px" : "50%",
          transform: sidebarOpen ? "none" : "translateX(50%)",
          zIndex: 2,
          background: pinned ? "var(--sec-depmap)" : "var(--paper-raised)",
          border: "1px solid var(--paper-rule)",
          borderRadius: "3px",
          color: pinned ? "#fff" : "var(--ink-dim)",
          fontSize: "9px",
          padding: "2px 4px",
          cursor: "pointer",
          lineHeight: 1,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {pinned ? "●" : "○"}
      </button>

      {/* Nav content — only rendered when sidebar is open */}
      {sidebarOpen && (
        <div style={{ paddingTop: "24px", display: "flex", flexDirection: "column", flex: 1 }}>
          <div className="px-6 pt-4 pb-5">
            <div className="eyebrow">Contents</div>
          </div>
          <ul className="flex-1 px-2">
            {modules.map((m) => (
              <li key={m.to}>
                <NavLink
                  to={m.to}
                  className={({ isActive }) =>
                    `group block px-4 py-5 border-b border-paper-rule focus-ring relative transition-colors ${
                      isActive ? "bg-paper-raised" : "hover:bg-paper-raised/60"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator — a colored vertical seam */}
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[2px] transition-all"
                        style={{
                          background: isActive ? m.color : "transparent"
                        }}
                      />
                      <div className="flex items-baseline gap-4">
                        <span
                          className="font-display text-[13px] tracking-widest2 w-6 transition-transform duration-300 group-hover:translate-x-0.5"
                          style={{ color: isActive ? m.color : "var(--ink-faint)" }}
                        >
                          § {m.roman}
                        </span>
                        <div className="flex-1">
                          <div className="eyebrow mb-1" style={{ color: isActive ? m.color : undefined }}>
                            {m.kicker}
                          </div>
                          <div className="font-display text-[22px] leading-none tracking-tight text-ink">
                            {m.label}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="px-6 py-5 border-t border-paper-rule">
            <div className="meta">SIDECAR</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-section-forecast animate-pulse" />
              <span className="font-mono text-[11px] text-ink-dim">127.0.0.1:8765</span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
