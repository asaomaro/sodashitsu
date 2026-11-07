import {mount,flushPromises} from "@vue/test-utils";
import {createPinia} from "pinia";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ConnectionKey} from "../injection.js";
import {useMachinesStore} from "../store/machines.js";
import {useSettingsStore} from "../store/settings.js";
import AgentToolsSettings from "./AgentToolsSettings.vue";
beforeEach(()=>localStorage.clear());
const wrappers:Array<ReturnType<typeof mount>>=[];afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()));
function fixture(request=vi.fn(async()=>({models:[{id:"model-high",label:"High model",efforts:["low","high"]},{id:"model-none",label:"No reasoning",efforts:[]}],message:"モデル候補"}))){
 const pinia=createPinia(),settings=useSettingsStore(pinia);settings.setSummarySettings({kind:"codex",model:"model-high",effort:"high",sessionId:"",autoUpdate:true,notificationSummary:false});
 const w=mount(AgentToolsSettings,{global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request}}}});wrappers.push(w);return {w,settings,pinia,request};
}
it("uses the captain catalog, filters efforts for the selected model and persists the selection",async()=>{
 const {w,settings}=fixture();await flushPromises();expect(w.get('[aria-label="要約エージェントのモデル"]').element.tagName).toBe("SELECT");
 const effort=w.get('[aria-label="要約エージェントのeffort"]');expect(effort.findAll("option").map(o=>o.attributes("value"))).toEqual(["","low","high"]);expect((effort.element as HTMLSelectElement).value).toBe("high");
 await w.get('[aria-label="要約エージェントのモデル"]').setValue("model-none");expect(settings.summarySettings.effort).toBe("");expect(effort.findAll("option")).toHaveLength(1);
 expect(settings.summarySettings).toMatchObject({autoUpdate:true,notificationSummary:false});
 const restored=useSettingsStore(createPinia());expect(restored.summarySettings).toMatchObject({kind:"codex",model:"model-none",effort:""});
});
it("retains saved custom values when the model catalog cannot be read",async()=>{
 const {w,settings}=fixture(vi.fn(async()=>{throw Error("offline")}));await flushPromises();
 expect(w.text()).toContain("保存済み：model-high");expect(w.text()).toContain("保存済み：high");expect(settings.summarySettings.effort).toBe("high");
});
it("ignores stale catalog results after changing the agent kind",async()=>{
 let first!:(value:any)=>void;const request=vi.fn().mockImplementationOnce(()=>new Promise(done=>first=done)).mockResolvedValue({models:[{id:"sonnet",label:"Sonnet",efforts:["medium"]}],message:""});
 const {w,settings}=fixture(request as never);await w.get('[aria-label="要約エージェントの種類"]').setValue("claude");await flushPromises();
 first({models:[{id:"wrong-old-model",label:"Old",efforts:["high"]}],message:""});await flushPromises();
 expect(settings.summarySettings.kind).toBe("claude");expect(w.text()).not.toContain("wrong-old-model");expect(w.text()).toContain("Sonnet");
 await w.get('[aria-label="要約エージェントのモデル"]').setValue("sonnet");await w.get('[aria-label="要約エージェントのeffort"]').setValue("medium");expect(settings.summarySettings).toMatchObject({kind:"claude",model:"sonnet",effort:"medium"});
});
it("clears a saved effort only when a known model no longer supports it",async()=>{
 const {settings}=fixture(vi.fn(async()=>({models:[{id:"model-high",label:"Model",efforts:["low"]}],message:""})));await flushPromises();expect(settings.summarySettings.effort).toBe("");
});

it("does not restore a different PC's agent profile",async()=>{
 const {w,settings,pinia}=fixture();await flushPromises();await w.get('[aria-label="要約エージェントのeffort"]').setValue("low");
 useMachinesStore(pinia).selectedId="other-pc";
 settings.setSummarySettings({kind:"claude",model:"sonnet",effort:"medium",sessionId:""});await flushPromises();
 await w.get('[aria-label="要約エージェントの種類"]').setValue("codex");await flushPromises();
 expect(settings.summarySettings).toMatchObject({kind:"codex",model:"",effort:""});
});

it("applies changes immediately without a save button and supports an explicit unconfigured state",async()=>{
 const pinia=createPinia(),settings=useSettingsStore(pinia),request=vi.fn(async()=>({models:[],message:""}));
 const w=mount(AgentToolsSettings,{global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request}}}});wrappers.push(w);
 expect((w.get('[aria-label="要約エージェントの種類"]').element as HTMLSelectElement).value).toBe("");expect(settings.summaryConfigured).toBe(false);expect(request).not.toHaveBeenCalled();
 await w.get('[aria-label="要約エージェントの種類"]').setValue("claude");await flushPromises();expect(settings.summaryConfigured).toBe(true);expect(useSettingsStore(createPinia()).summaryConfigured).toBe(true);
 expect(w.findAll("button").some(button=>button.text().includes("保存"))).toBe(false);
 await w.get('[aria-label="要約エージェントの種類"]').setValue("");expect(settings.summaryConfigured).toBe(false);expect(useSettingsStore(createPinia()).summaryConfigured).toBe(false);
});

it("selects Grok with fetched model-specific effort choices",async()=>{
 const {w,settings}=fixture(vi.fn(async()=>({models:[{id:"grok-generated",label:"Generated Grok",efforts:["low","high"]}],message:"Grok CLIから取得した候補"})));await flushPromises();
 await w.get('[aria-label="要約エージェントの種類"]').setValue("grok");await flushPromises();
 await w.get('[aria-label="要約エージェントのモデル"]').setValue("grok-generated");await w.get('[aria-label="要約エージェントのeffort"]').setValue("low");
 expect(settings.summarySettings).toMatchObject({kind:"grok",model:"grok-generated",effort:"low"});expect(w.text()).toContain("Grok CLIから取得");
});
