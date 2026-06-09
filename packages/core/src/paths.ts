import path from "node:path";
import os from "node:os";

export function resolveAppDataDir(override?: string): string {
  if (override) return override;
  return path.join(os.homedir(), "DecisionForge");
}

export function scenariosDir(override?: string): string {
  return path.join(resolveAppDataDir(override), "scenarios");
}

export function forecastsDbPath(override?: string): string {
  return path.join(resolveAppDataDir(override), "forecasts.db");
}

export function mapsDir(override?: string): string {
  return path.join(resolveAppDataDir(override), "maps");
}
