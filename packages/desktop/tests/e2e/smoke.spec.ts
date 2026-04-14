import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

test("boots app, sidecar is healthy, all module pages render", async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: { ...process.env, NODE_ENV: "test" }
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  const health = await window.evaluate(async () => {
    const url = (window as any).api.sidecarUrl();
    const r = await fetch(`${url}/health`);
    return r.json();
  });
  expect(health.status).toBe("ok");

  await expect(window.getByRole("link", { name: /monte carlo/i }).first()).toBeVisible();
  await expect(window.getByRole("link", { name: /negotiation/i }).first()).toBeVisible();
  await expect(window.getByRole("link", { name: /forecast/i }).first()).toBeVisible();

  await window.getByRole("link", { name: /monte carlo/i }).first().click();
  await expect(window.getByRole("heading", { name: /monte carlo/i })).toBeVisible();
  await window.getByRole("link", { name: /negotiation/i }).first().click();
  await expect(window.getByRole("heading", { name: /negotiation dojo/i })).toBeVisible();
  await window.getByRole("link", { name: /forecast/i }).first().click();
  await expect(window.getByRole("heading", { name: /forecast journal/i })).toBeVisible();

  await app.close();
});
