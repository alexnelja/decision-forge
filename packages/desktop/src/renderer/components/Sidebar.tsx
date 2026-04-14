import { NavLink } from "react-router-dom";

const modules = [
  { to: "/mc", label: "Monte Carlo", color: "text-forge-mc" },
  { to: "/negotiation", label: "Negotiation", color: "text-forge-nego" },
  { to: "/forecast", label: "Forecast", color: "text-forge-forecast" }
];

export function Sidebar() {
  return (
    <nav className="w-60 bg-forge-panel border-r border-forge-border h-full flex flex-col">
      <div className="p-5 text-lg font-semibold tracking-tight">Decision Forge</div>
      <ul className="flex-1 px-2 space-y-1">
        {modules.map((m) => (
          <li key={m.to}>
            <NavLink
              to={m.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm ${m.color} hover:bg-forge-border/40 ${
                  isActive ? "bg-forge-border/60" : ""
                }`
              }
            >
              {m.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
