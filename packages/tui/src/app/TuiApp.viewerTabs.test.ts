import { afterEach, expect, it, vi } from "vitest";
import { menuItems } from "../modes/ContextMenu.js";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import { startedApp } from "../testing/appHarness.js";
const closes: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of closes.splice(0)) await close(); });
it.each([55, 120])("does not expose browser viewer tabs or their menu at %i columns", async (cols) => {
  const viewerTabs = ["web-preview", "desktop", "vscode"].map(kind => ({
    id: crypto.randomUUID(), machineId: "local", workspaceId: "w1", kind,
    label: `WebOnly-${kind}`,
  }));
  const h = await startedApp({ cols, respond: { "prefs.get": { prefs: { viewerTabs }, rev: 1 } } });
  closes.push(h.close);
  await vi.waitFor(() => expect(h.app.prefs.shared.viewerTabs).toHaveLength(3));
  const screen = await h.screen();
  expect(screen).not.toContain("閲覧");
  for (const viewer of viewerTabs) expect(screen).not.toContain(viewer.label);
  if (cols === 120) expect(screen).toContain("＋作業ビュー");
  expect(h.ws.requests("viewer_tabs.create")).toHaveLength(0);
});
it("does not include a viewer management entry in the terminal global menu", async () => {
  const h = await startedApp(); closes.push(h.close);
  const menu = menuItems({ target: { kind: "global" }, at: { x: 1, y: 1 } }, {
    ui: h.app.ui, model: h.app.model,
    actions: (h.app as unknown as { dispatcher: TuiDispatcher }).dispatcher,
  });
  expect(menu.map(item => item.label).join(" ")).not.toContain("閲覧");
});
