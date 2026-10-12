import { useViewStore } from "../store/view.js";
import { useExtensionsStore } from "../store/extensions.js";
import type { ExtensionListResult } from "@sodashitsu/protocol";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { expect, it, vi } from "vitest";
import type { Pane, Tab } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import TabViews from "./TabViews.vue";
function setup(count: number) {
  const pinia = createPinia(),
    session = useSessionStore(pinia),
    request = vi.fn().mockResolvedValue({});
  const tab = {
    id: "t",
    workspaceId: "w",
    label: "Studio",
    plugin: { extensionKey: "test", display: "main" },
    perspective: "app",
    focusedPaneId: "p0",
    layout: { type: "pane", paneId: "p0" },
  } as Tab;
  const pane = (id: string, virtual = false): Pane => ({
    id,
    tabId: "t",
    label: null,
    ...(virtual ? { virtual: true as const } : {}),
    cwd: "/",
    shell: "/bin/bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "herdr",
    agent: null,
    agentSession: null,
  });
  for (let i = 0; i < count; i++) session.paneUpserted(pane("p" + i));
  session.paneUpserted(pane("anchor", true));
  const wrapper = mount(TabViews, {
    props: { tab },
    global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: { request } } },
  });
  return { wrapper, request, pinia };
}
it("a single work pane offers the two perspectives without a duplicate terminal shortcut", () => {
  const { wrapper } = setup(1);
  expect(wrapper.find(".tab-workers").exists()).toBe(false);
  expect(wrapper.findAll(".tab-perspectives button").map((b) => b.text())).toEqual([
    "作業画面",
    "アプリ画面",
  ]);
  wrapper.unmount();
});
it("multiple work panes explicitly offer pane selection and focus the selected terminal", async () => {
  const { wrapper, request } = setup(2);
  expect(wrapper.get(".tab-workers").attributes("aria-label")).toBe("ペインを選択");
  const buttons = wrapper.findAll(".tab-workers button");
  expect(buttons).toHaveLength(2);
  await buttons[1]!.trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith("tab.set_perspective", {
    tabId: "t",
    perspective: "terminal",
  });
  expect(request).toHaveBeenCalledWith("pane.focus", { paneId: "p1" });
  wrapper.unmount();
});

it("filters by information target and keeps float independent of pane scope", async () => {
  const { wrapper, request, pinia } = setup(1),
    view = useViewStore(pinia);
  useExtensionsStore(pinia).setList({
    extensions: [
      {
        key: "plugin",
        id: "plugin",
        scope: "user",
        state: "running",
        views: [
          {
            id: "pane",
            title: "ペインの会話",
            targets: ["pane"],
            placements: ["float"],
            requiresProject: false,
          },
          {
            id: "tab",
            title: "タブの制作",
            targets: ["tab"],
            placements: ["left"],
            requiresProject: false,
          },
        ],
      },
    ],
  } as unknown as ExtensionListResult);
  view.openDialogWithContext({ kind: "addView", tabId: "t", paneId: "p0" });
  await flushPromises();
  expect(wrapper.get('select[aria-label="ビュー"]').text()).toContain("ペインの会話");
  expect(wrapper.get('select[aria-label="ビュー"]').text()).not.toContain("ファイルツリー");
  expect(wrapper.get('select[aria-label="ビュー"]').text()).not.toContain("タブの制作");
  await wrapper.get('select[aria-label="ビュー"]').setValue(JSON.stringify(["plugin", "pane"]));
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(
    "tab.add_view",
    expect.objectContaining({ target: "pane", paneId: "p0", placement: "float" }),
  );
  view.openDialogWithContext({ kind: "addView", tabId: "t" });
  await flushPromises();
  expect(wrapper.get('select[aria-label="ビュー"]').text()).toContain("ファイルツリー");
  expect(wrapper.get('select[aria-label="ビュー"]').text()).toContain("タブの制作");
  expect(wrapper.get('select[aria-label="ビュー"]').text()).toContain("ペインの会話");
  wrapper.unmount();
});
