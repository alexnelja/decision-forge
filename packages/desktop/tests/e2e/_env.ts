/**
 * Build a launch environment for Electron e2e specs.
 *
 * Strips ELECTRON_RUN_AS_NODE — when that var is set in the ambient shell
 * (some tool runners and worker contexts leak it), Electron boots as plain
 * Node and `require("electron")` returns the binary path string instead of
 * the API object. The main process then crashes with
 * "Cannot read properties of undefined (reading 'whenReady')" before any
 * test code runs. Clearing it here makes the specs immune to the shell.
 */
export function e2eEnv(
  extra: Record<string, string> = {}
): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "ELECTRON_RUN_AS_NODE") continue;
    if (v !== undefined) base[k] = v;
  }
  return { ...base, NODE_ENV: "test", ...extra };
}
