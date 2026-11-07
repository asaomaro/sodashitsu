import {isAssistantPane,type LayoutNode,type Pane,type Tab,type Workspace} from "@sodashitsu/protocol";

export interface SessionMaps {
 workspaces: ReadonlyMap<string,Workspace>;
 tabs: ReadonlyMap<string,Tab>;
 panes: ReadonlyMap<string,Pane>;
}
/** Presentation projection only. Raw lookup, input permission, history and accounting are unchanged. */
export function normalSession(source:SessionMaps) {
 const hiddenPaneIds=new Set<string>();
 for(const pane of source.panes.values()) {
  const tab=source.tabs.get(pane.tabId);
  if(isAssistantPane(pane,tab?source.workspaces.get(tab.workspaceId):undefined,tab))hiddenPaneIds.add(pane.id);
 }
 const panes=new Map([...source.panes].filter(([id])=>!hiddenPaneIds.has(id)));
 const tabs=new Map<string,Tab>();
 for(const tab of source.tabs.values()) {
  const layout=prune(tab.layout,hiddenPaneIds);
  if(!layout)continue;
  const ids=new Set(leaves(layout));
  tabs.set(tab.id,layout===tab.layout?tab:{...tab,layout,
   focusedPaneId:ids.has(tab.focusedPaneId)?tab.focusedPaneId:leaves(layout)[0]!,
   zoomedPaneId:tab.zoomedPaneId&&ids.has(tab.zoomedPaneId)?tab.zoomedPaneId:null});
 }
 const workspaces=new Map<string,Workspace>();
 for(const ws of source.workspaces.values()) {
  const tabIds=ws.tabIds.filter(id=>tabs.has(id));
  if(!tabIds.length)continue;
  workspaces.set(ws.id,tabIds.length===ws.tabIds.length?ws:{...ws,tabIds,
   activeTabId:tabIds.includes(ws.activeTabId)?ws.activeTabId:tabIds[0]!});
 }
 return {workspaces,tabs,panes,hiddenPaneIds};
}
function prune(node:LayoutNode,hidden:ReadonlySet<string>):LayoutNode|null {
 if(node.type==="pane")return hidden.has(node.paneId)?null:node;
 const a=prune(node.a,hidden),b=prune(node.b,hidden);
 return !a?b:!b?a:a===node.a&&b===node.b?node:{...node,a,b};
}
function leaves(node:LayoutNode):string[]{return node.type==="pane"?[node.paneId]:[...leaves(node.a),...leaves(node.b)];}
