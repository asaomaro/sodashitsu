import {afterEach,expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,appendFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {Pane} from "@sodashitsu/protocol";
import type {Subagents} from "./SubagentTracker.js";
import {NativeSubagentReader} from "./NativeSubagentReader.js";
import {NativeSubagentService} from "./NativeSubagentService.js";
import {SubagentHistoryService} from "./SubagentHistoryService.js";
const parent="12345678-1234-4234-8234-123456789012",child="12345678-1234-4234-8234-123456789013",paneId="12345678-1234-4234-8234-123456789014",instance="12345678-1234-4234-8234-123456789015";
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const event=(kind:string,index:number,extra:Record<string,unknown>={})=>JSON.stringify({method:"_x.ai/session/update",params:{sessionId:parent,update:{sessionUpdate:kind,subagent_id:child,child_session_id:child,attempt_id:"first-attempt",...extra},_meta:{eventId:"event-"+index,agentTimestampMs:index*1000}}})+"\n";
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-grok-terminal-native-"));dirs.push(root);const base=join(root,"sessions",encodeURIComponent("/generated")),parentDir=join(base,parent),childDir=join(base,child);await mkdir(parentDir,{recursive:true});await mkdir(childDir);
 const file=join(parentDir,"updates.jsonl");await writeFile(file,event("subagent_spawned",1,{parent_session_id:parent,model:"effective-child"})+event("subagent_finished",2,{status:"completed"}));await writeFile(join(childDir,"chat_history.jsonl"),JSON.stringify({type:"assistant",content:"Generated ended child answer"})+"\n");
 const ledger=(id:string,total:number)=>({sessionId:id,updatedAt:new Date(2500).toISOString(),session:{inputTokens:total-20,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:total,modelCalls:1,costUsdTicks:123456789}});
 await writeFile(join(childDir,"usage.json"),JSON.stringify(ledger(child,120)));await writeFile(join(parentDir,"usage.json"),JSON.stringify(ledger(parent,99999)));
 const pane:Pane={id:paneId,tabId:parent,label:"Generated",cwd:"/generated",shell:"node",cols:80,rows:24,status:"running",failure:null,busy:false,title:"Generated",rightClick:"pane",agent:{instanceId:instance,kind:"grok",label:"Grok",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1},agentSession:{kind:"grok",sessionId:parent,reportedAt:1}};let verified=true;
 const session={snapshot:()=>({panes:[pane]}),getPane:()=>pane,hasVerifiedAgentSession:()=>verified,setAgentSubagents:(_id:string,value:Subagents|undefined)=>{if(value)pane.agent!.subagents=value;else delete pane.agent!.subagents;return true;}};
 const native=new NativeSubagentService({session,bus:{subscribe:()=>({dispose(){}})},reader:new NativeSubagentReader({grokHome:root})});
 const history=new SubagentHistoryService({session,collect:source=>native.grokTerminals(source.paneId)});
 return{root,file,pane,native,history,session,set verified(v:boolean){verified=v;}};
}
it("feeds verified native ended attempts into exact history text and child-only reported usage",async()=>{
 const f=await fixture();try{
  expect((await f.history.read({paneId})).status).toBe("unavailable");await f.native.refresh();expect(f.pane.agent?.subagents?.count).toBe(0);
  const list=await f.history.read({paneId});expect(list).toMatchObject({status:"ok",items:[{id:child,terminalStatus:"completed",model:"effective-child",modelBasis:"creation"}]});const selection={paneId,agentId:child,entryId:list.items[0]!.entryId};
  expect(await f.history.transcript(selection)).toMatchObject({status:"ok",running:false,terminalStatus:"completed",entries:[{kind:"say",text:"Generated ended child answer"}]});
  const usage=await f.history.usageRead(selection);expect(usage).toMatchObject({status:"ok",usage:{source:"grok-usage",consumptionScope:"subtree",tokens:{total:120},costUsd:0.0123456789,costBasis:"reported"}});expect(usage.usage).not.toHaveProperty("contextTokens");expect(f.pane.agent?.subagents?.count).toBe(0);
  f.verified=false;expect(await f.history.usageRead(selection)).toMatchObject({status:"unavailable"});expect(await f.history.transcript(selection)).toMatchObject({status:"unreadable"});
 }finally{f.history.close();f.native.close();}
});
it("never uses an old history selection for a new child attempt before or after native catchup",async()=>{
 const f=await fixture();try{
  await f.native.refresh();const old=(await f.history.read({paneId})).items[0]!,selection={paneId,agentId:child,entryId:old.entryId};
  await appendFile(f.file,event("subagent_spawned",3,{parent_session_id:parent,attempt_id:"next-attempt",model:"new-effective-child"}));
  expect(await f.history.usageRead(selection)).toMatchObject({status:"unavailable"});expect(await f.history.transcript(selection)).toMatchObject({status:"unreadable"});
  await f.native.refresh();expect(f.pane.agent?.subagents?.count).toBe(1);expect((await f.history.read({paneId})).items).toEqual([]);
  await appendFile(f.file,event("subagent_finished",4,{attempt_id:"next-attempt",status:"completed"}));await f.native.refresh();const next=(await f.history.read({paneId})).items[0]!;expect(next.entryId).not.toBe(old.entryId);expect(await f.history.transcript(selection)).toMatchObject({status:"unreadable"});
 }finally{f.history.close();f.native.close();}
});
