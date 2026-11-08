import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Pane,AgentInfo} from "@sodashitsu/protocol";
import {NativeSubagentReader,type NativeSubagentSource} from "./NativeSubagentReader.js";
import {NativeSubagentService} from "./NativeSubagentService.js";
import {toAgentView} from "../../../cli/dist/agentStatus.js";
import {subagentModelLabel} from "@sodashitsu/client-core";
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-grok-native-wire-"));roots.push(root);
 const native=JSON.parse(await readFile(new URL("../../../../.aidev/works/20261107-grok-cursor-native-children/installed-grok-native-fixture.json",import.meta.url),"utf8"));
 const spawn=native.nativeEnvelopes[0].row,parent=spawn.params.sessionId,child=spawn.params.update.child_session_id,base=join(root,"sessions",encodeURIComponent("/generated")),file=join(base,parent,"updates.jsonl");
 await mkdir(join(base,parent),{recursive:true});await writeFile(file,JSON.stringify(spawn)+"\n");
 const instance="12345678-1234-4234-8234-123456789015",paneId="12345678-1234-4234-8234-123456789016";
 const pane:Pane={id:paneId,tabId:"12345678-1234-4234-8234-123456789017",label:"Generated",cwd:"/generated",shell:"node",cols:80,rows:24,status:"running",failure:null,busy:false,title:"Generated",rightClick:"pane",agent:{instanceId:instance,kind:"grok",label:"Grok",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1},agentSession:{kind:"grok",sessionId:parent,reportedAt:1}};
 let verified=true;const reader=new NativeSubagentReader({grokHome:root,codexHome:join(root,"codex"),dataHome:join(root,"muse")});
 const service=new NativeSubagentService({reader,bus:{subscribe:()=>({dispose(){}})},session:{snapshot:()=>({panes:[pane]}),getPane:()=>pane,hasVerifiedAgentSession:()=>verified,setAgentSubagents:(_id,value)=>{if(!pane.agent)return false;if(value===undefined)delete pane.agent.subagents;else pane.agent.subagents=value;return true;}}});
 return{root,base,file,parent,child,pane,reader,service,spawn,set verified(v:boolean){verified=v;},source:{paneId,instanceId:instance,kind:"grok",sessionId:parent} as NativeSubagentSource};
}
it("publishes Grok creation/session models and effort through the real service, CLI view and shared Web/TUI label",async()=>{
 const f=await fixture();try{
  await f.service.refresh();expect(f.pane.agent?.subagents).toMatchObject({count:1,countBasis:"alive",items:[{id:f.child,model:"grok-4",modelBasis:"creation",state:"unknown"}]});
  const at=f.spawn.params._meta.agentTimestampMs+100;
  const change=(model:string,effort?:string)=>JSON.stringify({method:"_x.ai/session/update",params:{sessionId:f.child,_meta:{agentTimestampMs:at},update:{sessionUpdate:"model_changed",model_id:model,reasoning_effort:effort}}})+"\n";
  await mkdir(join(f.base,f.child));await writeFile(join(f.base,f.child,"updates.jsonl"),change("child-session-model","high"));
  await f.service.refresh();let item=f.pane.agent!.subagents!.items[0]!;expect(item).toMatchObject({model:"child-session-model",modelBasis:"session",reasoningEffort:"high",reasoningEffortBasis:"session"});
  const cli=toAgentView({paneId:f.pane.id,tabId:f.pane.tabId,workspaceId:null},f.pane.agent as AgentInfo);expect(JSON.parse(JSON.stringify(cli)).subagents.items[0]).toMatchObject({model:"child-session-model",modelBasis:"session",reasoningEffort:"high"});expect(subagentModelLabel(item)).toBe("child-session-model high");
  await appendFile(join(f.base,f.child,"updates.jsonl"),change("new-child-model"));await f.service.refresh();item=f.pane.agent!.subagents!.items[0]!;
  expect(item.model).toBe("new-child-model");expect(item).not.toHaveProperty("reasoningEffort");expect(subagentModelLabel(item)).toBe("new-child-model");
 }finally{f.service.close();}
});
it("rejects in-flight model results when the parent fresh proof or reference kind is lost",async()=>{
 const f=await fixture();try{
  await f.service.refresh();expect(f.pane.agent?.subagents?.count).toBe(1);
  const reading=f.service.refresh();f.verified=false;await reading;expect(f.pane.agent).not.toHaveProperty("subagents");
  f.verified=true;await f.service.refresh();expect(f.pane.agent?.subagents?.count).toBe(1);
  f.pane.agentSession={kind:"cursor",sessionId:f.parent,reportedAt:1};await f.service.refresh();expect(f.pane.agent).not.toHaveProperty("subagents");expect(f.reader.progress(f.source)).toBeUndefined();
 }finally{f.service.close();}
});
it("retires a Grok in-flight family on other-provider reads, forget and close",async()=>{
 const f=await fixture();try{
  const old=f.reader.read(f.source);await f.reader.read({...f.source,kind:"muse"});expect(await old).toBeUndefined();expect(f.reader.progress(f.source)).toBeUndefined();
  const forgotten=f.reader.read(f.source);f.reader.forget(f.pane.id);expect(await forgotten).toBeUndefined();
  const closed=f.reader.read(f.source);f.reader.close();expect(await closed).toBeUndefined();
 }finally{f.service.close();}
});
