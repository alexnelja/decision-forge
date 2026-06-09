import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { DependencyMapSchema, mapsDir, type DependencyMap } from "@decision-forge/core";

export class MapStore {
  private readonly dir: string;
  // NOTE: `dirOverride` is the maps dir ITSELF (tests pass a tmp dir), unlike
  // ScenarioStore whose override is the app-data root passed to scenariosDir().
  constructor(dirOverride?: string) { this.dir = dirOverride ?? mapsDir(); }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async save(map: DependencyMap): Promise<void> {
    const parsed = DependencyMapSchema.parse(map);
    await this.ensure();
    await fs.writeFile(path.join(this.dir, `${parsed.id}.json`), JSON.stringify(parsed, null, 2), "utf8");
  }

  async load(id: string): Promise<DependencyMap | null> {
    try {
      return DependencyMapSchema.parse(JSON.parse(await fs.readFile(path.join(this.dir, `${id}.json`), "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async list(): Promise<Array<{ id: string; name: string }>> {
    try {
      await this.ensure();
      const out: Array<{ id: string; name: string }> = [];
      for (const f of await fs.readdir(this.dir)) {
        if (!f.endsWith(".json")) continue;
        try {
          const m = DependencyMapSchema.parse(JSON.parse(await fs.readFile(path.join(this.dir, f), "utf8")));
          out.push({ id: m.id, name: m.name });
        } catch { /* skip malformed */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dir, `${id}.json`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}

let store: MapStore | null = null;

export function registerMapsIpc(dirOverride?: string): void {
  store = new MapStore(dirOverride);
  ipcMain.handle("maps:list", () => store!.list());
  ipcMain.handle("maps:load", (_e, id: string) => store!.load(id));
  ipcMain.handle("maps:save", (_e, m: DependencyMap) => store!.save(m));
  ipcMain.handle("maps:delete", (_e, id: string) => store!.delete(id));
}
