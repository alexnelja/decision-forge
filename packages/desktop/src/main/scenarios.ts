import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { ScenarioSchema, scenariosDir, type Scenario } from "@decision-forge/core";

export class ScenarioStore {
  private readonly dir: string;
  constructor(appDataOverride?: string) {
    this.dir = scenariosDir(appDataOverride);
  }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async save(scenario: Scenario): Promise<void> {
    const parsed = ScenarioSchema.parse(scenario);
    await this.ensure();
    const file = path.join(this.dir, `${parsed.id}.json`);
    await fs.writeFile(file, JSON.stringify(parsed, null, 2), "utf8");
  }

  async load(id: string): Promise<Scenario | null> {
    const file = path.join(this.dir, `${id}.json`);
    try {
      const raw = await fs.readFile(file, "utf8");
      return ScenarioSchema.parse(JSON.parse(raw));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async list(): Promise<Array<{ id: string; name: string }>> {
    try {
      await this.ensure();
      const entries = await fs.readdir(this.dir);
      const out: Array<{ id: string; name: string }> = [];
      for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        try {
          const raw = await fs.readFile(path.join(this.dir, e), "utf8");
          const parsed = ScenarioSchema.parse(JSON.parse(raw));
          out.push({ id: parsed.id, name: parsed.name });
        } catch {
          // skip malformed
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
}

let store: ScenarioStore | null = null;

export function registerScenarioIpc(appDataOverride?: string): void {
  store = new ScenarioStore(appDataOverride);
  ipcMain.handle("scenarios:list", () => store!.list());
  ipcMain.handle("scenarios:load", (_e, id: string) => store!.load(id));
  ipcMain.handle("scenarios:save", (_e, scenario: Scenario) => store!.save(scenario));
}
