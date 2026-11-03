import {mount,flushPromises} from "@vue/test-utils";
import {createPinia} from "pinia";
import {expect,it,vi,afterEach,beforeEach} from "vitest";
import {ConnectionKey} from "../injection.js";
import {useSettingsStore} from "../store/settings.js";
import NotificationWorkSummary from "./NotificationWorkSummary.vue";
beforeEach(()=>localStorage.clear());
function configuredPinia(){const pinia=createPinia();useSettingsStore(pinia).setSummarySettings({kind:"codex",model:"",sessionId:""});return pinia;}

afterEach(()=>vi.useRealTimers());
it("shows only the short generated headline, never the detailed summary",async()=>{
 const request=vi.fn(async()=>({status:"ready",headline:"保存先の統一が完了しました <img src=x>",text:"詳細な作業要約・返信案".repeat(100),message:"共有要約"}));
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[configuredPinia()],provide:{[ConnectionKey as symbol]:{request}}}});
 await flushPromises();expect(w.text()).toContain("保存先の統一");expect(w.text()).not.toContain("詳細な作業要約");expect(w.find("img").exists()).toBe(false);
 expect(request).toHaveBeenCalledWith("notification.summary",expect.objectContaining({key:"done:actor:1",refresh:false}));w.unmount();
});
it("discards late results after changing the target or disabling summaries",async()=>{
 let resolve!:(v:unknown)=>void;const request=vi.fn(()=>new Promise(done=>resolve=done)),pinia=configuredPinia();
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request}}}});
 const settings=useSettingsStore(pinia);settings.setSummarySettings({...settings.summarySettings,notificationSummary:false});await flushPromises();resolve({status:"ready",text:"古い本文",message:""});await flushPromises();
 expect(w.text()).not.toContain("古い本文");w.unmount();
});
it("polls pending results, then shows a concise notification",async()=>{
 vi.useFakeTimers();const request=vi.fn().mockResolvedValueOnce({status:"summarizing",text:"",message:"要約中"}).mockResolvedValueOnce({status:"ready",headline:"確認待ちです",text:"長い詳細",message:"共有要約"});
 const w=mount(NotificationWorkSummary,{props:{paneId:crypto.randomUUID(),noticeKey:"done:actor:1"},global:{plugins:[configuredPinia()],provide:{[ConnectionKey as symbol]:{request}}}});
 await flushPromises();expect(w.text()).toBe("");await vi.advanceTimersByTimeAsync(2000);expect(w.text()).toBe("確認待ちです");expect(w.text()).not.toContain("長い詳細");w.unmount();
});
