#!/usr/bin/env node
import { readFile as fsReadFile } from "node:fs/promises";
import { MCConfigSchema } from "@decision-forge/core";
import type { MCConfig, MCRunResult } from "@decision-forge/core";

const VERSION = "decision-forge 0.1.0";
const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8765";

/** Injectable side effects, so commands stay unit-testable without disk or network. */
export interface CliDeps {
  readFile: (path: string) => Promise<string>;
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
}

function resolveDeps(deps: Partial<CliDeps>): CliDeps {
  return {
    readFile: deps.readFile ?? ((p) => fsReadFile(p, "utf8")),
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env
  };
}

const TOP_USAGE = "usage: decision-forge <version|mc>";
const MC_USAGE = [
  "usage: decision-forge mc <command>",
  "",
  "  validate <config.json>                type-check a Monte Carlo config",
  "  run <config.json> [--url U] [--json]  run it against the sidecar"
].join("\n");

/** Read a file and parse it as a Monte Carlo config, throwing readable errors. */
async function loadConfig(deps: CliDeps, file: string | undefined): Promise<MCConfig> {
  if (!file) throw new Error(`missing config path\n${MC_USAGE}`);
  const text = await deps.readFile(file); // ENOENT etc. propagate verbatim
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
  const parsed = MCConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`config invalid in ${file}:\n${issues}`);
  }
  return parsed.data;
}

async function postRun(
  deps: CliDeps,
  baseUrl: string,
  config: MCConfig
): Promise<MCRunResult> {
  const res = await deps.fetchImpl(`${baseUrl}/mc/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`mc/run ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as MCRunResult;
}

function num(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Render an MCRunResult as a readable terminal report. */
function formatRunResult(formula: string, result: MCRunResult): string {
  const s = result.stats;
  const lines: string[] = [];
  lines.push(`Monte Carlo — ${formula}`);
  lines.push(`  iterations  ${result.iterations.toLocaleString()}`);
  lines.push("");
  const rows: Array<[string, number]> = [
    ["mean", s.mean],
    ["sd", s.sd],
    ["min", s.min],
    ["p5", s.p5],
    ["p10", s.p10],
    ["p25", s.p25],
    ["p50", s.p50],
    ["p75", s.p75],
    ["p90", s.p90],
    ["p95", s.p95],
    ["p99", s.p99],
    ["max", s.max]
  ];
  for (const [label, value] of rows) {
    lines.push(`  ${label.padEnd(5)}  ${num(value).padStart(12)}`);
  }
  if (result.sensitivity && result.sensitivity.length > 0) {
    lines.push("");
    lines.push("  sensitivity (first-order, normalised)");
    for (const row of result.sensitivity) {
      const pct = `${(row.normalised * 100).toFixed(1)}%`;
      lines.push(`    ${row.name.padEnd(14)} ${pct.padStart(7)}`);
    }
  }
  return lines.join("\n");
}

async function mcCommand(deps: CliDeps, args: string[]): Promise<string> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "validate": {
      const config = await loadConfig(deps, rest[0]);
      return (
        `✓ config valid — ${config.variables.length} variable(s), ` +
        `formula \`${config.formula}\`, ${config.iterations.toLocaleString()} iterations`
      );
    }
    case "run": {
      const file = rest.find((a) => !a.startsWith("--"));
      const asJson = rest.includes("--json");
      const urlIdx = rest.indexOf("--url");
      const urlFlag = urlIdx >= 0 ? rest[urlIdx + 1] : undefined;
      const baseUrl = urlFlag ?? deps.env.SIDECAR_URL ?? DEFAULT_SIDECAR_URL;
      const config = await loadConfig(deps, file);
      const result = await postRun(deps, baseUrl, config);
      return asJson ? JSON.stringify(result) : formatRunResult(config.formula, result);
    }
    default:
      return MC_USAGE;
  }
}

export async function run(argv: string[], deps: Partial<CliDeps> = {}): Promise<string> {
  const resolved = resolveDeps(deps);
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "version":
      return VERSION;
    case "mc":
      return mcCommand(resolved, rest);
    default:
      return TOP_USAGE;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((out) => console.log(out))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
