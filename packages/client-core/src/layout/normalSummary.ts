import {isAssistantPane,type Pane,type Tab,type Workspace} from "@sodashitsu/protocol";
interface NormalSummary {workspaces:Workspace[];tabWorkspace:Record<string,string>;panes:Record<string,{tabId:string}>}
export function summaryAssistantPane(summary:NormalSummary,paneId:string):boolean {
 const pane=summary.panes[paneId];if(!pane)return false;
 const workspaceId=summary.tabWorkspace[pane.tabId];
 const workspace=summary.workspaces.find(w=>w.id===workspaceId);
 return isAssistantPane({id:paneId,tabId:pane.tabId} as Pane,workspace,{id:pane.tabId,workspaceId} as Tab);
}
/** Summary workspace bindings are retained by raw machines.ts snapshots/events. */
export function normalMachineSummary<T extends NormalSummary>(summary:T):T {
 const hidden=new Set(Object.keys(summary.panes).filter(id=>summaryAssistantPane(summary,id)));
 if(!hidden.size)return summary;
 const panes=Object.fromEntries(Object.entries(summary.panes).filter(([id])=>!hidden.has(id)));
 const visibleTabs=new Set(Object.values(panes).map(p=>p.tabId));
 const hiddenTabs=new Set([...hidden].map(id=>summary.panes[id]!.tabId).filter(id=>!visibleTabs.has(id)));
 const tabWorkspace=Object.fromEntries(Object.entries(summary.tabWorkspace).filter(([id])=>!hiddenTabs.has(id)));
 const workspaces=summary.workspaces.flatMap(w=>{
  const tabIds=w.tabIds.filter(id=>!hiddenTabs.has(id));
  if(tabIds.length===w.tabIds.length)return [w];
  return tabIds.length?[{...w,tabIds,activeTabId:tabIds.includes(w.activeTabId)?w.activeTabId:tabIds[0]!}]:[];
 });
 return {...summary,workspaces,tabWorkspace,panes};
}
