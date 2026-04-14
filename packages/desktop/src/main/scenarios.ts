import { ipcMain } from "electron";

export function registerScenarioIpc(): void {
  ipcMain.handle("scenarios:list", async () => []);
  ipcMain.handle("scenarios:load", async (_e, id: string) => null);
  ipcMain.handle("scenarios:save", async (_e, _scenario: unknown) => {});
}
