import {expect,it} from "vitest";
import {createPinia,setActivePinia} from "pinia";
import type {SessionSnapshot,Workspace,Pane,Tab} from "@sodashitsu/protocol";
import {useSessionStore} from "./session.js";
import {useNormalSessionStore} from "./normalSession.js";
import {normalMachineSummary} from "./normalMachines.js";
import {StoreAdapter} from "./StoreAdapter.js";
import {useViewStore} from "./view.js";
function fixture(sibling=false):SessionSnapshot {
 const captain={id:'captain',tabId:'tab',agent:null} as Pane;
 const work={id:'work',tabId:'tab',agent:null} as Pane;
 const tab={id:'tab',workspaceId:'workspace',focusedPaneId:'captain',zoomedPaneId:'captain',layout:sibling?{type:'split',id:'split',dir:'right',ratio:.5,a:{type:'pane',paneId:'captain'},b:{type:'pane',paneId:'work'}}:{type:'pane',paneId:'captain'}} as Tab;
 const ws={id:'workspace',label:'fixture',tabIds:['tab'],activeTabId:'tab',groupId:null,git:null,assistant:{paneId:'captain'}} as Workspace;
 return {protocol:1,serverVersion:'fixture',host:{os:'linux',windowsBuild:null,hostname:'fixture'},limits:{scrollbackLines:10},workspaces:[ws],tabs:[tab],panes:sibling?[captain,work]:[captain],groups:[],focus:{workspaceId:'workspace',tabId:'tab',paneId:'captain'}};
}
it('repairs a hidden saved/server focus to normal sibling while raw dedicated attachment remains available',()=>{
 sessionStorage.clear();const pinia=createPinia();setActivePinia(pinia);const adapter=new StoreAdapter({pinia,onAuthRequired(){},onConnectionState(){}});
 adapter.applySnapshot(fixture(true),'client');const raw=useSessionStore(),normal=useNormalSessionStore(),view=useViewStore();
 expect(raw.panes.has('captain')).toBe(true);expect(normal.panes.has('captain')).toBe(false);expect(normal.tabs.get('tab')!.layout).toEqual({type:'pane',paneId:'work'});expect(view.focusedPaneId).toBe('work');
 view.focusPane('captain');expect(view.focusedPaneId).toBe('work');
 adapter.applySnapshot(fixture(),'client');expect(view.workspaceId).toBeNull();expect(view.tabId).toBeNull();expect(view.focusedPaneId).toBeNull();expect(raw.panes.has('captain')).toBe(true);
});
it('updates normal projection reactively when exact ownership arrives without discarding raw data',()=>{
 const pinia=createPinia();setActivePinia(pinia);const raw=useSessionStore(),snap=fixture();const ws={...snap.workspaces[0]!};delete ws.assistant;raw.applySnapshot({...snap,workspaces:[ws]},'client');const normal=useNormalSessionStore();expect(normal.panes.has('captain')).toBe(true);raw.workspaceUpserted(snap.workspaces[0]!);expect(normal.panes.size).toBe(0);expect(raw.panes.size).toBe(1);
});
it('projects remote exact bindings and keeps old/unknown peer and unrelated metadata intact',()=>{
 const snap=fixture();const source={connected:true,everConnected:true,workspaces:snap.workspaces,tabWorkspace:{tab:'workspace'},panes:{captain:{tabId:'tab',agent:null,label:null,title:'fixture'}}};
 const normal=normalMachineSummary(source);expect(normal.workspaces).toEqual([]);expect(normal.panes).toEqual({});expect(source.panes.captain).toBeDefined();
 const old={...source,workspaces:source.workspaces.map(w=>{const next={...w};delete next.assistant;return next;})};expect(normalMachineSummary(old).panes.captain).toBeDefined();
 const sibling={...source,panes:{...source.panes,work:{tabId:'tab',agent:null,label:null,title:'work'}}};expect(normalMachineSummary(sibling).workspaces).toHaveLength(1);expect(Object.keys(normalMachineSummary(sibling).panes)).toEqual(['work']);
});
