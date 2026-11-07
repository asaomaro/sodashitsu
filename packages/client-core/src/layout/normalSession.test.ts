import {expect,it} from "vitest";
import type {Pane,Tab,Workspace} from "@sodashitsu/protocol";
import {normalSession} from "./normalSession.js";
function data(sibling=false){
 const panes=new Map([['captain',{id:'captain',tabId:'tab'} as Pane],...(sibling?[['work',{id:'work',tabId:'tab'} as Pane] as const]:[])]);
 const tab={id:'tab',workspaceId:'workspace',focusedPaneId:'captain',zoomedPaneId:'captain',layout:sibling?{type:'split',id:'split',dir:'right',ratio:.5,a:{type:'pane',paneId:'captain'},b:{type:'pane',paneId:'work'}}:{type:'pane',paneId:'captain'}} as Tab;
 const ws={id:'workspace',tabIds:['tab'],activeTabId:'tab',assistant:{paneId:'captain'}} as Workspace;
 return {panes,tabs:new Map([[tab.id,tab]]),workspaces:new Map([[ws.id,ws]])};
}
it('projects captain-only session to empty normal view while raw exact PTY remains intact',()=>{
 const raw=data(),result=normalSession(raw);expect(result.panes.size).toBe(0);expect(result.tabs.size).toBe(0);expect(result.workspaces.size).toBe(0);expect(raw.panes.has('captain')).toBe(true);expect(raw.tabs.get('tab')!.zoomedPaneId).toBe('captain');
});
it('collapses only captain leaf and repairs local focus/zoom without changing sibling or raw layout',()=>{
 const raw=data(true),result=normalSession(raw);expect([...result.panes.keys()]).toEqual(['work']);expect(result.tabs.get('tab')).toMatchObject({layout:{type:'pane',paneId:'work'},focusedPaneId:'work',zoomedPaneId:null});expect(result.workspaces.has('workspace')).toBe(true);expect(raw.tabs.get('tab')!.layout.type).toBe('split');
});
it('does not infer hidden ownership from names, absent old-peer binding, or mismatched workspace',()=>{
 const raw=data();delete raw.workspaces.get('workspace')!.assistant;expect(normalSession(raw).panes.has('captain')).toBe(true);
 raw.workspaces.get('workspace')!.assistant={paneId:'captain'} as NonNullable<Workspace['assistant']>;raw.tabs.get('tab')!.workspaceId='other';expect(normalSession(raw).panes.has('captain')).toBe(true);
});
