import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { expect, it, vi } from "vitest";
import ViewerTabBar from "./ViewerTabBar.vue";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
it("creates and manages a viewer from the compact dropdown and exposes source-specific labels", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const view = useViewStore(),
    tabs = useViewerTabsStore();
  useMachinesStore().selectedId = "remote";
  view.setView("w1", "t1");
  const entry = {
    id: crypto.randomUUID(),
    kind: "vscode" as const,
    label: "VSCode",
    machineId: "remote",
    workspaceId: "w1",
  };
  const request = vi.fn(async (method: string) =>
    method === "viewer_tabs.create" ? { tab: entry, tabs: [entry], rev: 1 } : { tabs: [], rev: 2 },
  );
  tabs.connect({ request } as never);
  const wrapper = mount(ViewerTabBar, { global: { plugins: [pinia] } });
  await wrapper.get(".viewer-menu-button").trigger("click");
  await wrapper
    .findAll('[role="menuitem"]')
    .find((b) => b.text() === "＋ VSCode")!
    .trigger("click");
  await flushPromises();
  expect(tabs.active?.id).toBe(entry.id);
  expect(wrapper.get('[role="tab"]').attributes("aria-label")).toBe("VSCode");
  await wrapper.get(".viewer-menu-button").trigger("click");
  await wrapper.get('[role="menuitem"][aria-label="VSCodeの閲覧タブを閉じる"]').trigger("click");
  await flushPromises();
  expect(tabs.tabs).toHaveLength(0);
  wrapper.unmount();
});
it("moves connections left and right using their on-screen order", async () => {
  const pinia = createPinia(); setActivePinia(pinia);
  const view = useViewStore(), tabs = useViewerTabsStore();
  view.setView("w1", "t1");
  useMachinesStore().selectedId = "remote";
  const entries = ["first", "second"].map(label => ({
    id: crypto.randomUUID(), kind: "vscode" as const, label,
    machineId: "remote", workspaceId: "w1",
  }));
  tabs.apply(entries, 1);
  const move = vi.spyOn(tabs, "move").mockResolvedValue(undefined);
  const wrapper = mount(ViewerTabBar, { global: { plugins: [pinia] } });
  expect(wrapper.findAll('[role="tab"]').map(t => t.attributes("aria-label"))).toEqual(["second", "first"]);
  expect(wrapper.get(".viewer-menu-button").text()).toBe("＋接続ビュー");
  await wrapper.get(".viewer-menu-button").trigger("click");
  expect(wrapper.get('[aria-label="secondを左へ"]').attributes("disabled")).toBeDefined();
  await wrapper.get('[aria-label="firstを左へ"]').trigger("click");
  expect(move).toHaveBeenCalledWith(entries[0]!.id, entries[1]!.id);
  move.mockRestore(); wrapper.unmount();
});
