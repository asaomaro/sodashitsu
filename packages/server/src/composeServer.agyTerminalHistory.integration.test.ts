import {chmod,mkdir,mkdtemp,writeFile,appendFile,rm} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {expect,it,vi} from "vitest";
import WebSocket from "ws";
import {composeServerOnFreePort} from "./composeServerOnFreePort.js";
import {assertPaneResolvesFake} from "./testing/fakeAgentGuard.js";
vi.mock("./surface/methods/WslHostResources.js",()=>({isWslHost:()=>false,WslHostResourcesCache:class{get(){return undefined;}}}));
it.skipIf(process.platform!=="linux"||!existsSync("/bin/bash"))("publishes formally completed Antigravity history through strict authenticated entry APIs without active resurrection",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-agy-terminal-public-")),originalCwd=process.cwd();
 const keys=["HOME","USERPROFILE","CODEX_HOME","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME","PATH","ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH","NODE_REPL_HISTORY","SODA_ASSISTANT_ENABLED"] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const bin=join(dir,"bin"),home=join(dir,".agy"),script=join(dir,"fake-agy.mjs"),parent="11111111-1111-4111-8111-111111111111",child="22222222-2222-4222-8222-222222222222",born=Date.parse("2026-11-08T00:00:00Z");await mkdir(bin);
  for(const name of ["claude","muse","codex","grok","copilot","cursor-agent","bob"]){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write('Antigravity usage fixture ready\\r\\n');process.stdin.on('data',d=>{if(String(d).includes('h')){const c=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL("../assets/agent-hook-report.cjs",import.meta.url)))},'agy'],{stdio:['pipe','ignore','ignore']});c.stdin.end(JSON.stringify({session_id:${JSON.stringify(parent)},hook_event_name:'SessionStart',source:'resume',cwd:process.cwd()}));}});`);
  await writeFile(join(bin,"agy"),`#!/bin/bash\nexec -a agy ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,"agy"),0o755);
  for(const key of ["HOME","USERPROFILE","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME"] as const)process.env[key]=join(dir,key);process.env.HOME=home;process.env.PATH=bin+":"+saved.PATH;process.env.SODA_ASSISTANT_ENABLED="0";process.env.NODE_REPL_HISTORY="";for(const key of ["ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH"] as const)delete process.env[key];process.chdir(dir);
  const system=join(home,".gemini/antigravity-cli/brain",parent,".system_generated"),recordDir=join(system,"logs"),descriptors=join(system,"subagents"),childDir=join(home,".gemini/antigravity-cli/brain",child,".system_generated/logs");await mkdir(recordDir,{recursive:true});await mkdir(descriptors);await mkdir(childDir,{recursive:true});
  const parentFile=join(recordDir,"transcript.jsonl"),descriptorFile=join(descriptors,child+".json"),descriptor={conversationId:child,spawnStepIndex:2,state:"SUBAGENT_STATE_ALIVE",subagentDescriptor:{role:"Generated child",typeName:"worker"}};
  await writeFile(parentFile,await import("node:fs/promises").then(fs=>fs.readFile(new URL("./agent/fixtures/agy-subagents/parent.jsonl",import.meta.url))));await appendFile(parentFile,JSON.stringify({step_index:99,source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",created_at:"2026-11-08T00:00:00Z",input_tokens:999999,output_tokens:999})+"\n");await writeFile(descriptorFile,JSON.stringify(descriptor));
  await writeFile(join(childDir,"transcript.jsonl"),JSON.stringify({step_index:1,source:"MODEL",type:"PLANNER_RESPONSE",status:"DONE",created_at:"2026-11-08T00:00:00Z",input_tokens:100,output_tokens:20,cache_read_tokens:30,tool_calls:[{name:"send_message",args:{Recipient:JSON.stringify(parent),Message:JSON.stringify("Generated public AGY child request")}}]})+"\n");
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"state"),origin:[],shell:"/bin/bash"});const live=server,pane=live.session.snapshot().panes[0]!.id,origin=`http://127.0.0.1:${live.options.port}`;
  const login=await fetch(origin+"/api/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(origin.replace("http","ws")+"/ws",{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once("open",resolve);ws!.once("error",reject);});const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const value=JSON.parse(raw.toString());if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}});
  const request=(method:string,params:any)=>new Promise<any>((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error("fixture timeout"));},5000);pending.set(id,value=>{clearTimeout(timer);resolve(value.result);});socket.send(JSON.stringify({id,method,params}));});
  const hello=()=>request("client.hello",{protocol:1,kind:"desktop"});await hello();await assertPaneResolvesFake({write:input=>live.terminals.get(pane)!.write(input),name:"agy",fakeDir:bin,scratchDir:dir});live.terminals.get(pane)!.write(`agy --conversation ${parent}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(pane)?.agent?.kind).toBe("agy"),{timeout:12000,interval:50});live.terminals.get(pane)!.write("h");
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot,p=snapshot.panes.find((p:any)=>p.id===pane);expect(p?.agent?.subagents?.items?.some((i:any)=>i.id===child)).toBe(true);},{timeout:12000,interval:50});
  expect(await request("agent.subagent_history",{paneId:pane})).toMatchObject({status:"ok",items:[]});
  await writeFile(descriptorFile,JSON.stringify({...descriptor,state:"SUBAGENT_STATE_KILLED"}));await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(0);},{timeout:8000,interval:50});
  const list=await request("agent.subagent_history",{paneId:pane});expect(list).toMatchObject({status:"ok",items:[{id:child,terminalStatus:"aborted"}]});expect(list.items[0]).not.toHaveProperty("endedAt");expect(list.items[0]).not.toHaveProperty("model");const selection={paneId:pane,agentId:child,entryId:list.items[0].entryId};
  expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"ok",entries:[{kind:"tool",name:"send_message",text:"【親への送信要求】\nGenerated public AGY child request"}]});
  const result=await request("agent.subagent_history_usage",selection);expect(result).toMatchObject({status:"ok",usage:{consumptionScope:"self",tokens:{input:100,cacheRead:30,output:20}}});expect(result.usage).not.toHaveProperty("weeklyCostUsd");expect(result.usage).not.toHaveProperty("costUsd");
  expect(await request("agent.subagent_history_usage",{...selection,entryId:randomUUID()})).toMatchObject({status:"unavailable"});
  expect((await request("agent.subagent_history",{paneId:pane})).items[0].entryId).toBe(selection.entryId);
  await writeFile(descriptorFile,JSON.stringify(descriptor));expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"unreadable"});expect(await request("agent.subagent_history_usage",selection)).toMatchObject({status:"unavailable"});
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(1);},{timeout:8000,interval:50});expect((await request("agent.subagent_history",{paneId:pane})).items).toHaveLength(0);

 }finally{ws?.close();await server?.close();process.chdir(originalCwd);for(const key of keys){const value=saved[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
},40000);
