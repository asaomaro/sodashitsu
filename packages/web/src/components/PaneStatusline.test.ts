import {mount} from "@vue/test-utils";
import {createPinia,setActivePinia} from "pinia";
import {afterEach,expect,it,vi} from "vitest";
import {useSessionStore} from "../store/session.js";
import {useSettingsStore} from "../store/settings.js";
import {loadStatuslineSettings,type Pane} from "@sodashitsu/protocol";
import PaneStatusline from "./PaneStatusline.vue";
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it.each([undefined,false,true])("renders native membership in the actual footer component with subagents=%s",enabled=>{
 const pinia=createPinia();setActivePinia(pinia);const session=useSessionStore(),settings=useSettingsStore();
 settings.statuslineSettings=loadStatuslineSettings(enabled===undefined?undefined:{fields:{subagents:enabled}});
 session.panes.set("p",{id:"p",label:"Codex",agent:{kind:"codex",label:"Codex",state:"idle",subagents:{count:3,countBasis:"alive",items:[{id:"generated",state:"unknown",startedAt:0}]}}} as Pane);
 vi.spyOn(HTMLElement.prototype,"clientHeight","get").mockReturnValue(220);
 const w=mount(PaneStatusline,{props:{paneId:"p"},global:{plugins:[pinia]}});
 try{expect(w.text().includes("Subagents 所属 3")).toBe(enabled!==false);expect(w.get('[data-pane-statusline]').isVisible()).toBe(true);}
 finally{w.unmount();pinia._s.forEach(s=>s.$dispose());}
});
