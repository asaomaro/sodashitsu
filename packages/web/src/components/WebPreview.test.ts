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
  return {wrapper, controller, target, viewerId, setFailure:(value:boolean)=>{fail=value;}};
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
it("retries the same viewer without replacing permission and explains origin-specific CLI login",async()=>{
 const h=await fixture(true);expect(h.wrapper.get('[data-preview-helper-login]').text()).toContain(`sodactl login --url ${location.origin}`);expect(h.wrapper.text()).toContain('別URLのログインは流用されません');h.setFailure(false);
 const retry=h.wrapper.findAll('button').find(b=>b.text()==='helperの自動起動を再試行')!;await retry.trigger('click');await flushPromises();
 expect(h.wrapper.text()).toContain('helperに接続済み');expect(h.target.mock.calls.filter(([method])=>method==='preview.watch')).toHaveLength(1);expect(h.controller.mock.calls.filter(([method])=>method==='preview.helper_start')).toHaveLength(2);h.wrapper.unmount();
});
it("shows a bounded cause without leaking a peer error or declaring a viewer expired",async()=>{
 const h=await fixture(true);h.controller.mockImplementationOnce(async()=>{throw Object.assign(Error('generated-secret-must-not-render'),{code:'not_found'});});
 await h.wrapper.findAll('button').find(b=>b.text()==='helperの自動起動を再試行')!.trigger('click');await flushPromises();const reason=h.wrapper.get('[data-preview-helper-failure]').text();expect(reason).toContain('表示許可または接続先');expect(h.wrapper.text()).not.toContain('generated-secret');expect(reason).not.toContain('失効');h.wrapper.unmount();
});
it("ignores a late retry failure after the preview closes",async()=>{
 const h=await fixture(true);let reject!:(e:unknown)=>void;h.controller.mockImplementationOnce(()=>new Promise<void>((_yes,no)=>{reject=no;}));await h.wrapper.findAll('button').find(b=>b.text()==='helperの自動起動を再試行')!.trigger('click');h.wrapper.unmount();reject(Object.assign(Error('private late message'),{code:'not_found'}));await flushPromises();expect(h.target.mock.calls.filter(([m])=>m==='preview.watch')).toHaveLength(1);
});
it("drops an unconfirmed viewer after poll not_found and only recreates permission on explicit enable",async()=>{
 const h=await fixture();const freshId=crypto.randomUUID();let missing=true;h.target.mockImplementation(async(method:string)=>{if(method==='preview.poll'){if(missing)throw {code:'not_found'};return {displays:[],helper:false};}if(method==='preview.list')return {apps:[]};if(method==='preview.watch')return {viewerId:freshId};return {};});
 await h.wrapper.setProps({active:false});await h.wrapper.setProps({active:true});await flushPromises();expect(h.wrapper.text()).toContain('表示許可を確認できません');expect(h.wrapper.find('[data-preview-helper-command]').exists()).toBe(false);expect(h.target.mock.calls.filter(([m])=>m==='preview.watch')).toHaveLength(1);
 missing=false;await h.wrapper.findAll('button').find(b=>b.text()==='このpaneでエージェントからの表示を許可')!.trigger('click');await flushPromises();expect(h.controller).toHaveBeenCalledWith('preview.helper_start',{machineId:'remote-b',viewerId:freshId});h.wrapper.unmount();
});
