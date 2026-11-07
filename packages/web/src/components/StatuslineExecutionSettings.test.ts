import {mount} from "@vue/test-utils";
import {createPinia,setActivePinia} from "pinia";
import {afterEach,expect,it} from "vitest";
import {loadStatuslineSettings} from "@sodashitsu/protocol";
import {useSessionStore} from "../store/session.js";
import {useUsageStore} from "../store/usage.js";
import PaneStatusline from "./PaneStatusline.vue";
import type {Pane} from "@sodashitsu/protocol";
import {useSettingsStore} from "../store/settings.js";
import StatuslineSettingsDialog from "./StatuslineSettingsDialog.vue";
afterEach(()=>localStorage.clear());
it("offers effort and approval fields without changing existing order or individual visibility",async()=>{
 const pinia=createPinia();setActivePinia(pinia);const settings=useSettingsStore();
 settings.statuslineSettings=loadStatuslineSettings({order:["model","pane"],rows:2,fields:{state:false}});
 const before=loadStatuslineSettings(settings.statuslineSettings),w=mount(StatuslineSettingsDialog,{global:{plugins:[pinia]}});
 try{
  const effort=w.get('input[aria-label="effort（推論の強さ）"]'),approval=w.get('input[aria-label="承認モード"]');
  expect((effort.element as HTMLInputElement).checked).toBe(false);expect((approval.element as HTMLInputElement).checked).toBe(false);
  await effort.setValue(true);await approval.setValue(true);
  expect(settings.statuslineSettings.fields).toMatchObject({effort:true,approval:true,state:false});
  expect(settings.statuslineSettings.order).toEqual(before.order);expect(settings.statuslineSettings.rows).toBe(2);
  await effort.setValue(false);expect(settings.statuslineSettings.fields).toMatchObject({effort:false,approval:true});
 }finally{w.unmount();pinia._s.forEach(s=>s.$dispose());}
});


it("shows observed execution settings and their source in real footer DOM without launch preferences",async()=>{
 const pinia=createPinia();setActivePinia(pinia);const settings=useSettingsStore(),session=useSessionStore(),usage=useUsageStore();
 settings.statuslineSettings=loadStatuslineSettings({fields:{effort:true,approval:true},order:["effort","approval"]});
 session.panes.set("p",{id:"p",agent:{kind:"codex",label:"Codex",state:"idle"}} as unknown as Pane);
 usage.panes.p={paneId:"p",kind:"codex",model:null,tokens:{basis:"context"},source:"rollout",updatedAt:2,executionSettings:{reasoningEffort:{value:"high",source:"rollout",basis:"turn",observedAt:1000},approvalPolicy:{value:"on-request",source:"rollout",basis:"turn"}}};
 const w=mount(PaneStatusline,{props:{paneId:"p"},global:{plugins:[pinia]}});
 try{
  expect(w.text()).toContain("effort high（記録）");expect(w.text()).toContain("承認policy on-request（記録）");
  expect(w.findAll("span[title]").some(x=>x.attributes("title")?.includes("ターンの記録 / rollout"))).toBe(true);
  settings.statuslineSettings=loadStatuslineSettings({fields:{effort:false,approval:true}});await w.vm.$nextTick();expect(w.text()).not.toContain("effort high");expect(w.text()).toContain("承認policy");
  usage.panes.p={...usage.panes.p!,executionSettings:{approvalMode:{value:"onRequest",source:"muse-events",basis:"session"}}};await w.vm.$nextTick();expect(w.text()).toContain("承認mode onRequest");
  usage.panes.p={...usage.panes.p!,kind:"claude"};await w.vm.$nextTick();expect(w.text()).not.toContain("承認policy");expect(w.text()).not.toContain("承認mode");
 }finally{w.unmount();pinia._s.forEach(s=>s.$dispose());}
});
