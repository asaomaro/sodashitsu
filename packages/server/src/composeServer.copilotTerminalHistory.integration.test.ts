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
it.skipIf(process.platform!=="linux"||!existsSync("/bin/bash"))("publishes formally completed Copilot history through strict authenticated entry APIs without active resurrection",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-copilot-terminal-public-")),originalCwd=process.cwd();
 const keys=["HOME","USERPROFILE","CODEX_HOME","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME","PATH","ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH","NODE_REPL_HISTORY","SODA_ASSISTANT_ENABLED"] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const bin=join(dir,"bin"),home=join(dir,".copilot"),script=join(dir,"fake-copilot.mjs"),parent=randomUUID(),child=randomUUID(),born=Date.parse("2026-11-08T00:00:00Z");await mkdir(bin);
  for(const name of ["claude","agy","codex","muse","grok","cursor-agent","bob"]){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write('Copilot usage fixture ready\\r\\n');process.stdin.on('data',d=>{if(String(d).includes('h')){const c=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL("../assets/agent-hook-report.cjs",import.meta.url)))},'copilot'],{stdio:['pipe','ignore','ignore']});c.stdin.end(JSON.stringify({session_id:${JSON.stringify(parent)},hook_event_name:'SessionStart',source:'resume',cwd:process.cwd()}));}});`);
  await writeFile(join(bin,"copilot"),`#!/bin/bash\nexec -a copilot ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,"copilot"),0o755);
  for(const key of ["HOME","USERPROFILE","GROK_HOME","COPILOT_HOME","CLAUDE_CONFIG_DIR","XDG_DATA_HOME"] as const)process.env[key]=join(dir,key);process.env.COPILOT_HOME=home;process.env.PATH=bin+":"+saved.PATH;process.env.SODA_ASSISTANT_ENABLED="0";process.env.NODE_REPL_HISTORY="";for(const key of ["ENV","BASH_ENV","NODE_OPTIONS","NODE_PATH"] as const)delete process.env[key];process.chdir(dir);
  const recordDir=join(home,"session-state",parent);await mkdir(recordDir,{recursive:true});
  const lifecycle=(phase:string,id:string)=>JSON.stringify({id,type:"subagent."+phase,timestamp:new Date(born+(phase==="started"?0:1000)).toISOString(),data:{toolCallId:child,agentName:"explore",agentDescription:"Generated Copilot child"}})+"\n",parentFile=join(recordDir,"events.jsonl");
  await writeFile(parentFile,JSON.stringify({type:"session.start",timestamp:new Date(born).toISOString(),data:{sessionId:parent,model:"PARENT_MODEL",totalTokens:999999,text:"PARENT_BODY_NOT_CHILD"}})+"\n"+lifecycle("started","generated-start"));
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"state"),origin:[],shell:"/bin/bash"});const live=server,pane=live.session.snapshot().panes[0]!.id,origin=`http://127.0.0.1:${live.options.port}`;
  const login=await fetch(origin+"/api/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(origin.replace("http","ws")+"/ws",{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once("open",resolve);ws!.once("error",reject);});const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const value=JSON.parse(raw.toString());if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}});
  const request=(method:string,params:any)=>new Promise<any>((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error("fixture timeout"));},5000);pending.set(id,value=>{clearTimeout(timer);resolve(value.result);});socket.send(JSON.stringify({id,method,params}));});
  const hello=()=>request("client.hello",{protocol:1,kind:"desktop"});await hello();await assertPaneResolvesFake({write:input=>live.terminals.get(pane)!.write(input),name:"copilot",fakeDir:bin,scratchDir:dir});live.terminals.get(pane)!.write(`copilot --resume ${parent}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(pane)?.agent?.kind).toBe("copilot"),{timeout:12000,interval:50});expect((await request("agent.subagent_usage",{paneId:pane,agentId:child})).status).toBe("unavailable");live.terminals.get(pane)!.write("h");
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot,p=snapshot.panes.find((p:any)=>p.id===pane);expect(p?.agent?.subagents?.items?.some((i:any)=>i.id===child)).toBe(true);},{timeout:12000,interval:50});
  expect(await request("agent.subagent_history",{paneId:pane})).toMatchObject({status:"ok",items:[]});
  await appendFile(parentFile,lifecycle("completed","generated-finish"));await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(0);},{timeout:8000,interval:50});
  const list=await request("agent.subagent_history",{paneId:pane});expect(list).toMatchObject({status:"ok",items:[{id:child,terminalStatus:"completed"}]});const selection={paneId:pane,agentId:child,entryId:list.items[0].entryId};
  expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"unreadable",entries:[],reason:expect.stringContaining("Copilot")});
  expect(list.items[0]).not.toHaveProperty("hasTranscript");expect(list.items[0]).not.toHaveProperty("model");expect(list.items[0]).not.toHaveProperty("reasoningEffort");
  const result=await request("agent.subagent_history_usage",selection);expect(result).toMatchObject({status:"unavailable",reason:expect.stringContaining("まだ接続されていません")});expect(result).not.toHaveProperty("usage");
  expect(await request("agent.subagent_history_usage",{...selection,entryId:randomUUID()})).toMatchObject({status:"unavailable"});
  expect((await request("agent.subagent_history",{paneId:pane})).items[0].entryId).toBe(selection.entryId);
  await appendFile(parentFile,lifecycle("started","generated-restart"));expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"unreadable"});expect(await request("agent.subagent_history_usage",selection)).toMatchObject({status:"unavailable"});
  await vi.waitFor(async()=>{const snapshot=(await hello()).snapshot;expect(snapshot.panes.find((p:any)=>p.id===pane)?.agent?.subagents?.count).toBe(1);},{timeout:8000,interval:50});expect((await request("agent.subagent_history",{paneId:pane})).items).toHaveLength(0);

 }finally{ws?.close();await server?.close();process.chdir(originalCwd);for(const key of keys){const value=saved[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
},40000);
