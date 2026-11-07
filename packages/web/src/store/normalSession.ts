import {useSessionStore} from "./session.js";
/** Explicit read projection for ordinary UI consumers only. Dedicated windows and analytics use raw store. */
export function useNormalSessionStore(...args:Parameters<typeof useSessionStore>):ReturnType<typeof useSessionStore>{
 const raw=useSessionStore(...args);
 return new Proxy(raw,{get(target,key){
  if(key==="workspaces"||key==="tabs"||key==="panes")return target.normal[key];
  if(key==="panesInWorkspace")return (id:string)=>[...target.normal.panes.values()].filter(p=>target.normal.tabs.get(p.tabId)?.workspaceId===id);
  if(key==="focus"){
   const focus=target.focus;if(!focus||target.normal.panes.has(focus.paneId))return focus;
   const tab=target.normal.tabs.values().next().value;
   return tab?{workspaceId:tab.workspaceId,tabId:tab.id,paneId:tab.focusedPaneId}:null;
  }
  return Reflect.get(target,key);
 }});
}
