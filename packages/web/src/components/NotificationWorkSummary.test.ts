import {mount,flushPromises} from "@vue/test-utils";
import {createPinia} from "pinia";
import {expect,it,vi,afterEach,beforeEach} from "vitest";
import {ConnectionKey} from "../injection.js";
import {useSettingsStore} from "../store/settings.js";
import NotificationWorkSummary from "./NotificationWorkSummary.vue";
beforeEach(()=>localStorage.clear());
afterEach(()=>vi.useRealTimers());
it("shows a shared task summary as text, and does not submit commands or replies",async()=>{
 const request=vi.fn(async()=>({status:"ready",text:"目的・成果・検証・返信案 <img src=x>",message:"共有要約"}));
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[createPinia()],provide:{[ConnectionKey as symbol]:{request}}}});
 await flushPromises();expect(w.text()).toContain("返信案");expect(w.find("img").exists()).toBe(false);
 expect(request).toHaveBeenCalledWith("notification.summary",expect.objectContaining({key:"done:actor:1",refresh:false}));w.unmount();
});
it("discards late results after changing the target or disabling summaries",async()=>{
 let resolve!:(v:unknown)=>void;const request=vi.fn(()=>new Promise(done=>resolve=done)),pinia=createPinia();
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request}}}});
 const settings=useSettingsStore(pinia);settings.setSummarySettings({...settings.summarySettings,notificationSummary:false});await flushPromises();resolve({status:"ready",text:"古い本文",message:""});await flushPromises();
 expect(w.text()).not.toContain("古い本文");w.unmount();
});
it("polls pending results and prevents repeated manual refresh while a request is pending",async()=>{
 vi.useFakeTimers();let release!:(v:unknown)=>void;
 const request=vi.fn().mockResolvedValueOnce({status:"summarizing",text:"",message:"要約中"}).mockResolvedValueOnce({status:"ready",text:"完成",message:"共有要約"}).mockImplementation(()=>new Promise(done=>release=done));
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[createPinia()],provide:{[ConnectionKey as symbol]:{request}}}});
 await flushPromises();expect(w.get("button").attributes("disabled")).toBeDefined();await vi.advanceTimersByTimeAsync(2000);expect(w.text()).toContain("完成");
 await w.get("button").trigger("click");await w.get("button").trigger("click");expect(request).toHaveBeenCalledTimes(3);release({status:"ready",text:"更新",message:""});await flushPromises();expect(w.text()).toContain("更新");w.unmount();
});
