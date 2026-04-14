import { NavLink } from "react-router-dom";

const modules = [
  { to: "/mc", roman: "I", label: "Monte Carlo", kicker: "Uncertainty", color: "var(--sec-mc)" },
  { to: "/negotiation", roman: "II", label: "Negotiation", kicker: "Rehearsal", color: "var(--sec-nego)" },
  { to: "/forecast", roman: "III", label: "Forecast", kicker: "Calibration", color: "var(--sec-forecast)" }
];

export function Sidebar() {
  return (
    <nav className="w-[260px] shrink-0 border-r border-paper-rule h-full flex flex-col bg-paper">
      <div className="px-6 pt-8 pb-5">
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
    </nav>
  );
}
