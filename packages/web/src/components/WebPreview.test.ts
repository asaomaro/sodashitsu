import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import WebPreview from "./WebPreview.vue";
async function fixture(fail = false) {
  const pinia = createPinia(); setActivePinia(pinia);
  useViewStore().connectionState = "open";
  useMachinesStore().selectedId = "remote-b";
  const viewerId = crypto.randomUUID(), paneId = crypto.randomUUID();
  let connected = false;
  const target = vi.fn(async (method: string) => {
    if (method === "preview.watch") return {viewerId};
    if (method === "preview.list") return {apps:[]};
    if (method === "preview.poll") return {displays:[],helper:connected};
    return {};
  });
  const controller = vi.fn(async (method: string) => {
    if (method === "preview.helper_start") { if (fail) throw new Error("another browser PC"); connected = true; }
    return {};
  });
  useViewerTabsStore().connect({request:controller} as never);
  const wrapper = mount(WebPreview, {props:{workspaceId:crypto.randomUUID(),tabId:crypto.randomUUID(),fallbackPaneId:paneId,active:true},global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request:target}}}});
  await flushPromises();
  return {wrapper, controller, target, viewerId};
}
it("automatically starts the helper on the controller for the selected remote source, and stops on close", async () => {
  const h = await fixture();
  expect(h.controller).toHaveBeenCalledWith("preview.helper_start",{machineId:"remote-b",viewerId:h.viewerId});
  expect(h.target).not.toHaveBeenCalledWith("preview.helper_start", expect.anything());
  expect(h.wrapper.text()).toContain("helperに接続済み");
  expect(h.wrapper.find("[data-preview-helper-command]").exists()).toBe(false);
  h.wrapper.unmount();
  expect(h.controller).toHaveBeenCalledWith("preview.helper_stop",{viewerId:h.viewerId});
});
it("retains the browser-PC command when automatic startup is unavailable", async () => {
  const h = await fixture(true);
  expect(h.wrapper.get("[data-preview-helper-command]").text()).toContain(`--machine remote-b preview helper --viewer ${h.viewerId}`);
  expect(h.wrapper.text()).toContain("自動起動できませんでした");
  h.wrapper.unmount();
});

it("restores the preview on Escape or when its tab becomes inactive", async () => {
  const {wrapper, target} = await fixture();
  const maximize = () => wrapper.findAll("button").find(b=>b.text()==="最大化")!;
  await maximize().trigger("click");
  expect(wrapper.classes()).toContain("soda-viewport-maximized");
  await wrapper.trigger("keydown", {key:"Escape"});
  expect(wrapper.classes()).not.toContain("soda-viewport-maximized");
  await maximize().trigger("click");
  await wrapper.setProps({active:false});
  expect(wrapper.classes()).not.toContain("soda-viewport-maximized");
  expect(target.mock.calls.filter(([method])=>method==="preview.watch")).toHaveLength(1);
  wrapper.unmount();
});
