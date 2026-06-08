#!/usr/bin/env node
import { readFile as fsReadFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  MCConfigSchema,
  QuestionSchema,
  PredictionSchema,
  ResolutionSchema
} from "@decision-forge/core";
import type { MCConfig, MCRunResult, CalibrationReport } from "@decision-forge/core";

const VERSION = "decision-forge 0.1.0";
const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8765";

/** Injectable side effects, so commands stay unit-testable without disk, network, clock, or RNG. */
export interface CliDeps {
  readFile: (path: string) => Promise<string>;
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => string;
  uuid: () => string;
}

function resolveDeps(deps: Partial<CliDeps>): CliDeps {
  return {
    readFile: deps.readFile ?? ((p) => fsReadFile(p, "utf8")),
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    now: deps.now ?? (() => new Date().toISOString()),
    uuid: deps.uuid ?? (() => randomUUID())
  };
}

const TOP_USAGE = "usage: decision-forge <version|mc|forecast>";
const MC_USAGE = [
  "usage: decision-forge mc <command>",
  "",
  "  validate <config.json>                type-check a Monte Carlo config",
  "  run <config.json> [--url U] [--json]  run it against the sidecar"
].join("\n");
const FORECAST_USAGE = [
  "usage: decision-forge forecast <command> [--url U] [--json]",
  "",
  "  list                              list questions and latest predictions",
  "  calibration                       Brier score and reliability buckets",
  "  ask <text> --prob P --by DATE [--tags a,b] [--criteria C]",
  "  resolve <questionId> <true|false> [--notes N]"
].join("\n");

interface ParsedArgs {
  positionals: string[];
  asJson: boolean;
  /** `--json` excluded; every other `--key value` lands here. */
  options: Record<string, string>;
}

/** Parse positionals, the boolean --json, and `--key value` options (e.g. --url, --prob, --by). */
function parseFlags(rest: string[]): ParsedArgs {
  const positionals: string[] = [];
  let asJson = false;
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === undefined) continue;
    if (tok === "--json") asJson = true;
    else if (tok.startsWith("--")) options[tok.slice(2)] = rest[++i] ?? ""; // consume the value
    else positionals.push(tok);
  }
  return { positionals, asJson, options };
}

function resolveUrl(deps: CliDeps, urlFlag?: string): string {
  return urlFlag ?? deps.env.SIDECAR_URL ?? DEFAULT_SIDECAR_URL;
}

/** Format a Zod failure into a readable, path-annotated error. */
function zodError(label: string, error: { issues: Array<{ path: Array<string | number>; message: string }> }): Error {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return new Error(`${label} invalid:\n${issues}`);
}

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
  if (!parsed.success) throw zodError(`config in ${file}`, parsed.error);
  return parsed.data;
}

async function httpGet<T>(deps: CliDeps, baseUrl: string, path: string): Promise<T> {
  const res = await deps.fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: { "content-type": "application/json" }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function httpPost<T>(deps: CliDeps, baseUrl: string, path: string, payload: unknown): Promise<T> {
  const res = await deps.fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
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
      const { positionals, asJson, options } = parseFlags(rest);
      const config = await loadConfig(deps, positionals[0]);
      const result = await httpPost<MCRunResult>(
        deps,
        resolveUrl(deps, options.url),
        "/mc/run",
        config
      );
      return asJson ? JSON.stringify(result) : formatRunResult(config.formula, result);
    }
    default:
      return MC_USAGE;
  }
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Render the forecast journal (GET /forecast/questions) as a table. */
function formatQuestions(questions: Array<Record<string, unknown>>): string {
  const lines = [`Forecast journal — ${questions.length} question(s)`, ""];
  if (questions.length === 0) {
    lines.push("  (none yet)");
    return lines.join("\n");
  }
  for (const q of questions) {
    const prob = typeof q.latestProbability === "number" ? pct(q.latestProbability) : "—";
    const status = q.resolved ? (q.outcome ? "✓ TRUE" : "✗ FALSE") : "open";
    lines.push(`  ${prob.padStart(4)}  ${status.padEnd(8)}  ${String(q.text ?? "")}`);
  }
  return lines.join("\n");
}

/** Render a CalibrationReport (GET /forecast/calibration). */
function formatCalibration(report: CalibrationReport): string {
  const lines = [
    `Calibration — ${report.count} resolved`,
    `  Brier score  ${report.brier.toFixed(3)}   (0 = perfect, 0.25 = coin-flip)`
  ];
  const filled = report.buckets.filter((b) => b.n > 0);
  if (filled.length > 0) {
    lines.push("");
    lines.push("  predicted → actual    (n)");
    for (const b of filled) {
      lines.push(`  ${pct(b.predicted).padStart(4)} → ${pct(b.actual).padStart(4)}      ${b.n}`);
    }
  }
  return lines.join("\n");
}

function parseOutcome(raw: string): 0 | 1 {
  const t = raw.toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "y") return 1;
  if (t === "false" || t === "0" || t === "no" || t === "n") return 0;
  throw new Error(`outcome must be true or false (got "${raw}")`);
}

async function forecastCommand(deps: CliDeps, args: string[]): Promise<string> {
  const [sub, ...rest] = args;
  const { positionals, asJson, options } = parseFlags(rest);
  const baseUrl = resolveUrl(deps, options.url);
  switch (sub) {
    case "list": {
      const questions = await httpGet<Array<Record<string, unknown>>>(
        deps,
        baseUrl,
        "/forecast/questions"
      );
      return asJson ? JSON.stringify(questions) : formatQuestions(questions);
    }
    case "calibration": {
      const report = await httpGet<CalibrationReport>(deps, baseUrl, "/forecast/calibration");
      return asJson ? JSON.stringify(report) : formatCalibration(report);
    }
    case "ask": {
      const text = positionals[0];
      if (!text) throw new Error(`missing question text\n${FORECAST_USAGE}`);
      if (options.prob === undefined) throw new Error("missing --prob <0..1>");
      const probability = Number(options.prob);
      if (!Number.isFinite(probability)) {
        throw new Error(`--prob must be a number in [0,1] (got "${options.prob}")`);
      }
      if (!options.by) throw new Error("missing --by <YYYY-MM-DD or ISO>");
      const resolveBy = /^\d{4}-\d{2}-\d{2}$/.test(options.by)
        ? `${options.by}T23:59:59Z`
        : options.by;
      const qid = deps.uuid();
      const at = deps.now();
      const question = QuestionSchema.safeParse({
        id: qid,
        text,
        createdAt: at,
        resolveBy,
        resolutionCriteria: options.criteria,
        tags: options.tags
          ? options.tags.split(",").map((s) => s.trim()).filter(Boolean)
          : []
      });
      if (!question.success) throw zodError("question", question.error);
      const prediction = PredictionSchema.safeParse({
        id: deps.uuid(),
        questionId: qid,
        probability,
        madeAt: at
      });
      if (!prediction.success) throw zodError("prediction", prediction.error);
      await httpPost(deps, baseUrl, "/forecast/question", {
        question: question.data,
        prediction: prediction.data
      });
      return asJson
        ? JSON.stringify({ questionId: qid, predictionId: prediction.data.id })
        : `✓ asked — ${qid}\n  ${pct(prediction.data.probability)}  ${text}`;
    }
    case "resolve": {
      const [qid, outcomeRaw] = positionals;
      if (!qid || outcomeRaw === undefined) {
        throw new Error(
          `usage: decision-forge forecast resolve <questionId> <true|false> [--notes N]`
        );
      }
      const outcome = parseOutcome(outcomeRaw);
      const resolution = ResolutionSchema.safeParse({
        questionId: qid,
        outcome,
        resolvedAt: deps.now(),
        notes: options.notes
      });
      if (!resolution.success) throw zodError("resolution", resolution.error);
      await httpPost(deps, baseUrl, "/forecast/resolve", resolution.data);
      return asJson
        ? JSON.stringify({ ok: true, questionId: qid, outcome })
        : `✓ resolved ${qid} → ${outcome === 1 ? "TRUE" : "FALSE"}`;
    }
    default:
      return FORECAST_USAGE;
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
    case "forecast":
      return forecastCommand(resolved, rest);
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
