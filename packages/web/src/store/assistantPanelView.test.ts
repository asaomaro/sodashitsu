import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createPinia,setActivePinia} from "pinia";
import type {SessionSnapshot,Pane,Tab,Workspace} from "@sodashitsu/protocol";
import {assistantPanelGuard} from "../actions/assistantPanelGuard.js";
import {assistantPanelTarget} from "../actions/assistantPanelLink.js";
import {focusAssistantPanelView} from "./assistantPanelView.js";
import {StoreAdapter} from "./StoreAdapter.js";
import {useSessionStore} from "./session.js";
import {useNormalSessionStore} from "./normalSession.js";
import {useViewStore} from "./view.js";
const p="11111111-1111-4111-8111-111111111111",w="22222222-2222-4222-8222-222222222222",a="33333333-3333-4333-8333-333333333333";
const hash=`#assistantPane=${p}&assistantWorkspace=${w}&assistantInstance=${a}`,target=assistantPanelTarget(hash)!;
function snapshot():SessionSnapshot {
 const pane={id:p,tabId:"tab",agent:{instanceId:a,kind:"codex"},agentSession:{kind:"codex",sessionId:"generated-session"}} as Pane;
 const tab={id:"tab",workspaceId:w,focusedPaneId:p,zoomedPaneId:null,layout:{type:"pane",paneId:p}} as Tab;
 const workspace={id:w,label:"Generated captain",cwd:"/generated",projectDir:"/generated",tabIds:["tab"],activeTabId:"tab",assistant:{paneId:p}} as Workspace;
 return {protocol:1,serverVersion:"fixture",host:{os:"linux",windowsBuild:null,hostname:"fixture"},limits:{scrollbackLines:10},workspaces:[workspace],tabs:[tab],panes:[pane],groups:[],focus:{workspaceId:w,tabId:"tab",paneId:p}};
}
beforeEach(()=>{sessionStorage.clear();document.body.innerHTML='<div id="app"><input id="terminal"></div>';vi.spyOn(HTMLDialogElement.prototype,"showModal").mockImplementation(function(this:HTMLDialogElement){this.open=true;});vi.spyOn(HTMLDialogElement.prototype,"close").mockImplementation(function(this:HTMLDialogElement){this.open=false;});});
afterEach(()=>{document.body.innerHTML="";vi.restoreAllMocks();});
it("pins only the dedicated target across snapshots/events without making a hidden captain ordinary",()=>{
 const pinia=createPinia();setActivePinia(pinia);const session=useSessionStore(),view=useViewStore();
 const adapter=new StoreAdapter({pinia,assistantTarget:target,onAuthRequired(){},onConnectionState(){}});
 let connected=true,currentHash=hash;
 const guard=assistantPanelGuard({model:()=>session,connected:()=>connected,focusedPane:()=>view.focusedPaneId,hash:()=>currentHash,focus:()=>{focusAssistantPanelView(target,session,view);}},hash);
 try{
  adapter.applySnapshot(snapshot(),"generated-client");expect(view.focusedPaneId).toBe(p);guard();expect(view.focusedPaneId).toBe(p);expect(useNormalSessionStore().panes.has(p)).toBe(false);expect(guard.canInput(p)).toBe(true);
  const sent:string[]=[];const input=document.getElementById("terminal")!;input.addEventListener("keydown",()=>{if(guard.canInput(p))sent.push("key");});input.addEventListener("paste",()=>{if(guard.canInput(p))sent.push("paste");});
  input.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true,cancelable:true}));input.dispatchEvent(new Event("paste",{bubbles:true,cancelable:true}));expect(sent).toEqual(["key","paste"]);
  adapter.applyEvent({event:"workspace.updated",data:{workspace:snapshot().workspaces[0]!}} as never);guard();expect(view.focusedPaneId).toBe(p);
  connected=false;expect(guard.canInput(p)).toBe(false);connected=true;adapter.applySnapshot(snapshot(),"reconnected");guard();expect(guard.canInput(p)).toBe(true);expect(view.focusedPaneId).toBe(p);
  currentHash=hash.replace(a,w);expect(guard.canInput(p)).toBe(false);const late=new KeyboardEvent("keydown",{key:"x",bubbles:true,cancelable:true});input.dispatchEvent(late);expect(late.defaultPrevented).toBe(true);expect(sent).toHaveLength(2);
  expect(sessionStorage.getItem("soda.view.v1")).toBeNull();
 }finally{guard.dispose();}
});
it.each(["instance","workspace","project","closed","machine"])("keeps the input fence after %s changes",change=>{
 const pinia=createPinia();setActivePinia(pinia);const session=useSessionStore(),view=useViewStore(),adapter=new StoreAdapter({pinia,assistantTarget:target,onAuthRequired(){},onConnectionState(){}});let machine="local";
 const guard=assistantPanelGuard({model:()=>session,connected:()=>true,focusedPane:()=>view.focusedPaneId,machine:()=>machine,focus:()=>{focusAssistantPanelView(target,session,view);}},hash);
 try{adapter.applySnapshot(snapshot(),"client");guard();expect(guard.canInput(p)).toBe(true);
  if(change==="instance")session.panes.get(p)!.agent!.instanceId=w;
  else if(change==="workspace")session.tabs.get("tab")!.workspaceId=a;
  else if(change==="project")session.workspaces.get(w)!.projectDir="/changed";
  else if(change==="closed")session.panes.delete(p);
  else machine="a".repeat(32);
  expect(guard.canInput(p)).toBe(false);const event=new Event("paste",{bubbles:true,cancelable:true});document.getElementById("terminal")!.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 }finally{guard.dispose();}
});
it("keeps ordinary view navigation and repair from selecting the hidden captain",()=>{
 const pinia=createPinia();setActivePinia(pinia);const session=useSessionStore(),view=useViewStore(),adapter=new StoreAdapter({pinia,onAuthRequired(){},onConnectionState(){}});
 adapter.applySnapshot(snapshot(),"ordinary-client");view.setView(w,"tab");view.focusPane(p);expect(view.focusedPaneId).toBeNull();expect(view.workspaceId).toBeNull();expect(session.panes.has(p)).toBe(true);
});
