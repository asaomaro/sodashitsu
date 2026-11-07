import {normalMachineSummary} from "@sodashitsu/client-core";
export {normalMachineSummary,summaryAssistantPane} from "@sodashitsu/client-core";
import {computed} from "vue";
import {useMachinesStore} from "./machines.js";
export function useNormalMachinesStore(...args:Parameters<typeof useMachinesStore>):ReturnType<typeof useMachinesStore>{
 const raw=useMachinesStore(...args);
 const summaries=computed(()=>Object.fromEntries(Object.entries(raw.summaries).map(([id,s])=>[id,normalMachineSummary(s)])));
 return new Proxy(raw,{get(target,key){if(key==="summaries")return summaries.value;if(key==="agentsInWorkspace")return (id:string,workspaceId:string)=>{const s=summaries.value[id];return s?Object.values(s.panes).flatMap(p=>p.agent&&s.tabWorkspace[p.tabId]===workspaceId?[p.agent]:[]):[];};return Reflect.get(target,key);}});
}
export {summaryPaneName} from "./machines.js";
