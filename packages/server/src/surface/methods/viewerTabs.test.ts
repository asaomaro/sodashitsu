import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { PrefsStore } from "../../persist/PrefsStore.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerViewerTabs } from "./viewerTabs.js";
import type { MethodDeps } from "./deps.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const ctx = {
  clientId: "operator",
  sink: { clientId: "operator", bufferedAmount: 0, sendOutput() {}, sendSnapshot() {} },
};
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "viewer-tabs-"));
  dirs.push(dir);
  const store = new PrefsStore(dir);
  await store.load();
  const surface = new ControlSurface();
  registerViewerTabs(surface, { prefs: store } as MethodDeps);
  return { store, surface, dir };
}
const p = {
  machineId: "remote-pc",
  workspaceId: "workspace-legacy",
  kind: "web-preview",
  label: "Preview",
};
it("stores viewers only in the controller's preferences and restores without creating workspace tabs or panes", async () => {
  const a = await fixture(),
    b = await fixture();
  const result = await a.surface.invoke(ctx, "viewer_tabs.create", p);
  expect(result.ok).toBe(true);
  expect(a.store.get().prefs.viewerTabs).toHaveLength(1);
  expect(b.store.get().prefs.viewerTabs).toBeUndefined();
  const loaded = new PrefsStore(a.dir);
  await loaded.load();
  expect(loaded.get().prefs.viewerTabs).toEqual(a.store.get().prefs.viewerTabs);
});
it("serializes concurrent create/reorder/rename/remove and retains unrelated preferences", async () => {
  const f = await fixture();
  await f.store.set({ theme: "dracula" }, "other");
  await Promise.all([
    f.surface.invoke(ctx, "viewer_tabs.create", p),
    f.surface.invoke(ctx, "viewer_tabs.create", { ...p, label: "Second" }),
  ]);
  const tabs = f.store.get().prefs.viewerTabs!;
  expect(tabs).toHaveLength(2);
  await f.surface.invoke(ctx, "viewer_tabs.update", {
    id: tabs[0]!.id,
    label: "Changed",
    position: 1,
  });
  expect(f.store.get().prefs.viewerTabs?.map((t) => t.label)).toEqual(["Second", "Changed"]);
  await f.surface.invoke(ctx, "viewer_tabs.remove", { id: tabs[1]!.id });
  expect(f.store.get().prefs.viewerTabs).toHaveLength(1);
  expect(f.store.get().prefs.theme).toBe("dracula");
});
it("rejects arbitrary URLs/commands and reports invalid records rather than spawning anything", async () => {
  const f = await fixture();
  expect(await f.surface.invoke(ctx, "viewer_tabs.create", { ...p, label: "bad\u001b[31m" })).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  expect(
    await f.surface.invoke(ctx, "viewer_tabs.create", { ...p, url: "https://evil.example" }),
  ).toMatchObject({ ok: false, error: { code: "invalid_params" } });
  expect(
    await f.surface.invoke(ctx, "viewer_tabs.update", { id: crypto.randomUUID(), position: 0 }),
  ).toMatchObject({ ok: false, error: { code: "not_found" } });
});
