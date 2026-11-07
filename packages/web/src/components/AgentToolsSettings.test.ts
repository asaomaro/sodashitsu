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

it("selects a Cursor variant while keeping unobserved independent effort at default",async()=>{
 const {w,settings}=fixture(vi.fn(async()=>({models:[{id:"cursor-generated-high",label:"Generated variant",efforts:[]}],message:"Cursor CLIから取得"})));await flushPromises();
 await w.get('[aria-label="要約エージェントの種類"]').setValue("cursor");await flushPromises();
 await w.get('[aria-label="要約エージェントのモデル"]').setValue("cursor-generated-high");
 expect(settings.summarySettings).toMatchObject({kind:"cursor",model:"cursor-generated-high",effort:""});expect(w.get('[aria-label="要約エージェントのeffort"]').findAll('option')).toHaveLength(1);
});

it("force refreshes on open and the update button, while labelling observation time",async()=>{
 const request=vi.fn(async()=>({models:[],message:"Generated",source:"reference" as const,fetchedAt:1000,cached:true}));const {w}=fixture(request);await flushPromises();
 expect(request).toHaveBeenCalledWith("agent.model_options",{kind:"codex",refresh:true});expect(w.text()).toContain("参考候補");expect(w.text()).toContain("照会日時");expect(w.text()).toContain("モデル一覧の更新日時ではありません");
 await w.findAll('button').find(b=>b.text()==="モデル候補を再取得")!.trigger('click');await flushPromises();expect(request).toHaveBeenCalledTimes(2);
});
it("falls back once only for an old host's invalid refresh parameter, preserving saved choices",async()=>{
 const request=vi.fn(async(_method:string,params:any)=>{if(params.refresh)throw {code:"invalid_params"};return {models:[],message:"Old host"};});const {w,settings}=fixture(request as never);await flushPromises();
 expect(request.mock.calls.map(c=>c[1])).toEqual([{kind:"codex",refresh:true},{kind:"codex"}]);expect(w.text()).toContain("強制更新に未対応");expect(settings.summarySettings).toMatchObject({model:"model-high",effort:"high"});expect(w.text()).toContain("保存済み：model-high");
});
it("does not retry network or authentication failures as compatibility fallback",async()=>{
 const request=vi.fn(async()=>{throw {code:"unauthorized"};});const {w}=fixture(request as never);await flushPromises();expect(request).toHaveBeenCalledTimes(1);expect(w.text()).toContain("取得できません");
});
it("refreshes on each dialog open and retires a pending result when closed",async()=>{
 let complete!:(v:any)=>void;const request=vi.fn().mockImplementationOnce(()=>new Promise(done=>complete=done)).mockResolvedValue({models:[],message:"Fresh reopen"});
 const {w}=fixture(request as never);await w.setProps({active:false});complete({models:[{id:"stale-model",label:"Stale",efforts:[]}],message:"stale"});await flushPromises();expect(w.text()).not.toContain("stale-model");
 await w.setProps({active:true});await flushPromises();expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls[1]).toEqual(["agent.model_options",{kind:"codex",refresh:true}]);expect(w.text()).toContain("Fresh reopen");
});
