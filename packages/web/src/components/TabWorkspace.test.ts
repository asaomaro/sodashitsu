import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import type { Tab } from "@sodashitsu/protocol";
import TabWorkspace from "./TabWorkspace.vue";

const tab: Tab = {
  id: "t1", workspaceId: "w1", label: "app",
  layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1",
  zoomedPaneId: null, sizeOwnerClientId: null,
  plugin: { extensionKey: "test:plugin", display: "main" },
  displayPaneId: "anchor", perspective: "app",
};
const global = { stubs: {
  PaneFrame: { template: "<div><slot /></div>" },
  PaneLayout: { template: '<div><slot name="pane" pane-id="p1" /></div>' },
  TerminalPane: { template: "<div data-test-terminal />" },
  PluginView: { template: "<div data-test-plugin />" },
  NativeTabView: { template: "<div data-test-native />" },
} };

it("releases hidden plugin UI while retaining its terminal DOM", async () => {
  const w = mount(TabWorkspace, { props: { tab, active: true }, global });
  const terminal = w.get("[data-test-terminal]").element;
  expect(w.find("[data-test-plugin]").exists()).toBe(true);
  await w.setProps({ active: false });
  expect(w.find("[data-test-plugin]").exists()).toBe(false);
  expect(w.get("[data-test-terminal]").element).toBe(terminal);
  await w.setProps({ active: true });
  expect(w.find("[data-test-plugin]").exists()).toBe(true);
  expect(w.get("[data-test-terminal]").element).toBe(terminal);
  w.unmount();
});

it.each(["desktop", "vscode"] as const)("releases a legacy %s share while a controller viewer is selected", async (nativeView) => {
  const { plugin: _plugin, ...workTab } = tab;
  const w = mount(TabWorkspace, { props: { tab: { ...workTab, nativeView }, active: true }, global });
  expect(w.find("[data-test-native]").exists()).toBe(true);
  await w.setProps({ active: false });
  expect(w.find("[data-test-native]").exists()).toBe(false);
  await w.setProps({ active: true });
  expect(w.find("[data-test-native]").exists()).toBe(true);
  w.unmount();
});
