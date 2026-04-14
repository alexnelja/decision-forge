import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";

export interface WaitForHealthOptions {
  timeoutMs: number;
  intervalMs: number;
  fetchImpl?: typeof fetch;
}

export async function waitForHealth(
  baseUrl: string,
  opts: WaitForHealthOptions
): Promise<void> {
  const f = opts.fetchImpl ?? fetch;
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    try {
      const resp = await f(`${baseUrl}/health`);
      if (resp.status === 200) return;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`sidecar health timeout after ${opts.timeoutMs}ms`);
}

export interface Sidecar {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startSidecar(options: {
  pythonExecutable: string;
  engineDir: string;
  port: number;
  env?: Record<string, string>;
}): Promise<Sidecar> {
  const child: ChildProcess = spawn(
    options.pythonExecutable,
    ["-m", "decision_forge.main"],
    {
      cwd: options.engineDir,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        DECISION_FORGE_PORT: String(options.port)
      },
      stdio: ["ignore", "inherit", "inherit"]
    }
  );

  const baseUrl = `http://127.0.0.1:${options.port}`;
  await waitForHealth(baseUrl, { timeoutMs: 15000, intervalMs: 150 });

  return {
    baseUrl,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.killed || child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, 3000);
      })
  };
}

export function defaultEnginePaths(repoRoot: string) {
  const engineDir = path.resolve(repoRoot, "packages/py-engine");
  const pythonExecutable = path.join(engineDir, ".venv/bin/python");
  return { engineDir, pythonExecutable };
}
