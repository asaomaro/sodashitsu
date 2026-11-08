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
it.skipIf(process.platform!=="linux"||!existsSync("/bin/bash"))("publishes formally completed Muse history through strict authenticated entry APIs without active resurrection",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-muse-terminal-public-")),originalCwd=process.cwd();
 const keys=["HOME","USERPROFILE","CODEX_HOME","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME","PATH","ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH","NODE_REPL_HISTORY","SODA_ASSISTANT_ENABLED"] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const bin=join(dir,"bin"),home=join(dir,".muse"),script=join(dir,"fake-muse.mjs"),parent="01a1b40b-85fb-7eb2-bacf-afa29c999bc9",child=randomUUID(),born=Date.parse("2026-11-08T00:00:00Z");await mkdir(bin);
  for(const name of ["claude","agy","codex","grok","copilot","cursor-agent","bob"]){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write('Muse usage fixture ready\\r\\n');process.stdin.on('data',d=>{if(String(d).includes('h')){const c=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL("../assets/agent-hook-report.cjs",import.meta.url)))},'muse'],{stdio:['pipe','ignore','ignore']});c.stdin.end(JSON.stringify({session_id:${JSON.stringify(parent)},hook_event_name:'SessionStart',source:'resume',cwd:process.cwd()}));}});`);
  await writeFile(join(bin,"muse"),`#!/bin/bash\nexec -a muse ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,"muse"),0o755);
  for(const key of ["HOME","USERPROFILE","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME"] as const)process.env[key]=join(dir,key);process.env.XDG_DATA_HOME=home;process.env.PATH=bin+":"+saved.PATH;process.env.SODA_ASSISTANT_ENABLED="0";process.env.NODE_REPL_HISTORY="";for(const key of ["ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH"] as const)delete process.env[key];process.chdir(dir);
  const recordDir=join(home,"muse","sessions","2026","11","07",parent),nested=join(recordDir,"subagent",child);await mkdir(nested,{recursive:true});
  const lifecycle=(kind:string,id:string)=>JSON.stringify({schema_version:1,id,stream:{kind:"session",id:parent},recorded_at:(born+(kind==="result_ready"?3000:0))*1000,record_type:"event",durability:"durable",payload_type:"subagent.control."+kind,payload_schema_version:kind==="spawn_accepted"?4:kind==="result_ready"?2:1,payload:{kind:"subagent_control",record:{kind,subagent_id:child,parent_session_id:parent,...(kind==="child_session_bound"?{child_session_id:child,schema_version:1,storage_layout:"nested_session_v1"}:{})}}})+"\n",parentFile=join(recordDir,"session.jsonl");
  await writeFile(parentFile,lifecycle("spawn_accepted","generated-spawn")+lifecycle("child_session_bound","generated-bind")+lifecycle("start_attested","generated-start"));
  const usage=(stream:string,input=100)=>JSON.stringify({schema_version:1,payload_schema_version:1,stream:{kind:"session",id:stream},recorded_at:(born+1000)*1000,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"goal_usage_attribution",record:{schema_version:1,usage_family:"provider",usage_id:"generated-call",model:"generated",quantity:{reported:true,unit:"tokens",input_tokens:input,output_tokens:20,cached_tokens:30}}}}})+"\n";
  await writeFile(join(nested,"session.jsonl"),usage(child)+usage(parent,999999)+JSON.stringify({schema_version:1,payload_schema_version:1,stream:{kind:"session",id:child},recorded_at:(born+2000)*1000,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"workflow_child_result_submitted",child_session_stream:{kind:"session",id:child},payload:{text:"Generated public Muse child result"}}}})+"\n");
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"state"),origin:[],shell:"/bin/bash"});const live=server,pane=live.session.snapshot().panes[0]!.id,origin=`http://127.0.0.1:${live.options.port}`;
  const login=await fetch(origin+"/api/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(origin.replace("http","ws")+"/ws",{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once("open",resolve);ws!.once("error",reject);});const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const value=JSON.parse(raw.toString());if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}});
  const request=(method:string,params:any)=>new Promise<any>((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error("fixture timeout"));},5000);pending.set(id,value=>{clearTimeout(timer);resolve(value.result);});socket.send(JSON.stringify({id,method,params}));});
  const hello=()=>request("client.hello",{protocol:1,kind:"desktop"});await hello();await assertPaneResolvesFake({write:input=>live.terminals.get(pane)!.write(input),name:"muse",fakeDir:bin,scratchDir:dir});live.terminals.get(pane)!.write(`muse resume ${parent}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(pane)?.agent?.kind).toBe("muse"),{timeout:12000,interval:50});expect((await request("agent.subagent_usage",{paneId:pane,agentId:child})).status).toBe("unavailable");live.terminals.get(pane)!.write("h");
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot,p=snapshot.panes.find((p:any)=>p.id===pane);expect(p?.agent?.subagents?.items?.some((i:any)=>i.id===child)).toBe(true);},{timeout:12000,interval:50});
  expect(await request("agent.subagent_history",{paneId:pane})).toMatchObject({status:"ok",items:[]});
  await appendFile(parentFile,lifecycle("result_ready","generated-finish"));await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(0);},{timeout:8000,interval:50});
  const list=await request("agent.subagent_history",{paneId:pane});expect(list).toMatchObject({status:"ok",items:[{id:child,terminalStatus:"completed"}]});const selection={paneId:pane,agentId:child,entryId:list.items[0].entryId};
  expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"ok",entries:[{kind:"say",text:"Generated public Muse child result"}]});
  const result=await request("agent.subagent_history_usage",selection);expect(result).toMatchObject({status:"ok",usage:{consumptionScope:"self",tokens:{input:70,cacheRead:30,output:20}}});expect(result.usage).not.toHaveProperty("weeklyCostUsd");expect(result.usage).not.toHaveProperty("costUsd");
  expect(await request("agent.subagent_history_usage",{...selection,entryId:randomUUID()})).toMatchObject({status:"unavailable"});
  expect((await request("agent.subagent_history",{paneId:pane})).items[0].entryId).toBe(selection.entryId);
  await appendFile(parentFile,lifecycle("resume_context_recorded","generated-followup")+lifecycle("start_attested","generated-restarted"));expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"unreadable"});expect(await request("agent.subagent_history_usage",selection)).toMatchObject({status:"unavailable"});
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(1);},{timeout:8000,interval:50});expect((await request("agent.subagent_history",{paneId:pane})).items).toHaveLength(0);

 }finally{ws?.close();await server?.close();process.chdir(originalCwd);for(const key of keys){const value=saved[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
},40000);
