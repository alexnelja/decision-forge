import { ModuleFrame } from "../components/ModuleFrame";
export default function Home() {
  return (
    <ModuleFrame title="Decision Forge" accent="text-forge-accent">
      <p className="text-neutral-400 max-w-2xl">
        Choose a module. Monte Carlo for uncertain outcomes, Negotiation for deal rehearsal,
        Forecast for calibrated predictions.
      </p>
    </ModuleFrame>
  );
}
