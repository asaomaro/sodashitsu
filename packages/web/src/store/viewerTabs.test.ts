import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import { useViewerTabsStore } from "./viewerTabs.js";
import { useMachinesStore } from "./machines.js";
import { useViewStore } from "./view.js";
const first = {
  id: crypto.randomUUID(),
  machineId: "remote",
  workspaceId: "w1",
  kind: "vscode" as const,
  label: "Code",
};
beforeEach(() => setActivePinia(createPinia()));
it("writes viewer creation through the separately supplied controller port, never a target tab.create", async () => {
  const tabs = useViewerTabsStore(),
    view = useViewStore();
  useMachinesStore().selectedId = "remote";
  view.setView("w1", "t1");
  const request = vi.fn(async () => ({ tabs: [first], tab: first, rev: 1 }));
  tabs.connect({ request } as never);
  const { id: _id, ...params } = first;
  await tabs.create(params);
  expect(request).toHaveBeenCalledWith("viewer_tabs.create", params);
  expect(tabs.active?.id).toBe(first.id);
  expect(request.mock.calls).toHaveLength(1);
});
it("explicit work navigation to the same tab deactivates the viewer, and target contexts do not collide", () => {
  const tabs = useViewerTabsStore(),
    view = useViewStore(),
    machines = useMachinesStore();
  machines.selectedId = "remote";
  view.setView("w1", "t1");
  tabs.apply([first], 1);
  tabs.select(first.id);
  expect(tabs.active?.id).toBe(first.id);
  view.setView("w1", "t1");
  expect(tabs.active).toBeUndefined();
  tabs.select(first.id);
  machines.selectedId = "local";
  expect(tabs.visible).toHaveLength(0);
  expect(tabs.active).toBeUndefined();
});
it("ignores stale mutation/list replies after a newer preference broadcast", () => {
  const tabs = useViewerTabsStore();
  tabs.apply([first], 3);
  tabs.apply([], 2);
  expect(tabs.tabs).toEqual([first]);
});
it("places the first connection nearest the right controls and new connections to its left", () => {
  const tabs = useViewerTabsStore();
  useMachinesStore().selectedId = "remote";
  useViewStore().setView("w1", "t1");
  const second = { ...first, id: crypto.randomUUID(), label: "second" };
  tabs.apply([first, second], 1);
  expect(tabs.visible.map(t => t.id)).toEqual([second.id, first.id]);
  // Display order is separate from persisted order; switching scopes doesn't mutate it.
  expect(tabs.tabs.map(t => t.id)).toEqual([first.id, second.id]);
});
