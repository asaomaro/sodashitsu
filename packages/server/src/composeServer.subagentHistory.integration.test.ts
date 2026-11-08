import WebSocket from "ws";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile,chmod,rm} from "node:fs/promises";
import {dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {existsSync} from "node:fs";
import {expect,it,vi} from "vitest";
import {composeServerOnFreePort} from "./composeServerOnFreePort.js";
import {assertPaneResolvesFake} from "./testing/fakeAgentGuard.js";
import {CursorChildObservations} from "./agent/CursorChildObservations.js";
vi.mock("./surface/methods/WslHostResources.js",()=>({isWslHost:()=>false,WslHostResourcesCache:class{get(){return undefined;}}}));
it.skipIf(process.platform!=="linux"||!existsSync("/bin/bash"))("formal Cursor Stop reaches separate authenticated history/transcript RPC and never revives active counts",async()=>{
 const root=await mkdtemp(join(tmpdir(),"soda-cursor-child-compose-")),parent=randomUUID(),child=randomUUID();
 const keys=["HOME","CURSOR_CONFIG_DIR","CURSOR_DATA_DIR","CLAUDE_CONFIG_DIR","CODEX_HOME","COPILOT_HOME","GROK_HOME","MUSE_HOME","XDG_DATA_HOME","PATH","ENV","BASH_ENV","NODE_OPTIONS","SODA_ASSISTANT_ENABLED"] as const;
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),offer=vi.spyOn(CursorChildObservations.prototype,"offer");
 let ws:WebSocket|undefined;let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined;
 try{
  const bin=join(root,"bin"),config=join(root,"config"),data=join(root,"data"),script=join(root,"fake-cursor.mjs");await mkdir(bin);
  for(const name of["muse","agy","copilot","claude","codex","grok"]){await writeFile(join(bin,name),"#!/bin/sh\nexit 1\n");await chmod(join(bin,name),0o755);}
  const hook=fileURLToPath(new URL("../assets/agent-hook-report.cjs",import.meta.url));
  const started={hook_event_name:"sessionStart",session_id:parent,source:"resume"};
  const self={hook_event_name:"afterAgentResponse",parent_conversation_id:parent,child_conversation_id:child,conversation_id:child,session_id:child,subagent_id:"generated-task",generation_id:"generated-generation",model_id:"observed-child-model",model_params:[{id:"effort",value:"low"}],prompt:"GENERATED-DISCARDED"};
  const stopped={hook_event_name:"subagentStop",parent_conversation_id:parent,child_conversation_id:child,conversation_id:parent,session_id:parent,subagent_id:"generated-task",subagent_type:"Explore",status:"completed",model_id:"parent-common-model",model_params:[{id:"effort",value:"high"}]};
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write('Cursor fixture ready\\r\\n');process.stdin.on('data',b=>{const s=String(b);if(s.includes('q'))process.exit(0);const p=s.includes('h')?${JSON.stringify(started)}:s.includes('a')?${JSON.stringify(self)}:s.includes('s')?${JSON.stringify(stopped)}:undefined;if(p){const c=spawn(process.execPath,[${JSON.stringify(hook)},'cursor'],{stdio:['pipe','ignore','ignore']});c.stdin.end(JSON.stringify({...p,cwd:process.cwd()}));}});`);
  await writeFile(join(bin,"cursor-agent"),`#!/bin/bash\nexec -a cursor-agent ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,"cursor-agent"),0o755);
  for(const key of["HOME","CLAUDE_CONFIG_DIR","CODEX_HOME","COPILOT_HOME","GROK_HOME","MUSE_HOME","XDG_DATA_HOME"] as const)process.env[key]=join(root,key);
  process.env.CURSOR_CONFIG_DIR=config;process.env.CURSOR_DATA_DIR=data;process.env.PATH=`${bin}:${saved.PATH}`;process.env.SODA_ASSISTANT_ENABLED="0";delete process.env.ENV;delete process.env.BASH_ENV;delete process.env.NODE_OPTIONS;
  const group=join(config,"chats",createHash("md5").update("/generated/project").digest("hex")),parentDb=join(group,parent,"store.db"),childDb=join(group,child,"store.db"),parentFile=join(data,"projects","generated","agent-transcripts",parent,`${parent}.jsonl`),childFile=join(dirname(parentFile),"subagents",`${child}.jsonl`);
  for(const file of[parentDb,childDb,parentFile,childFile])await mkdir(dirname(file),{recursive:true});
  for(const[file,value]of[[parentDb,{agentId:parent,createdAt:1}],[childDb,{agentId:child,createdAt:1000,subagentInfo:{parentAgentId:parent,rootParentAgentId:parent,toolCallId:"tool",typeName:"Explore"}}]] as const){const sql=new DatabaseSync(file);sql.exec("CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT);");sql.prepare("INSERT INTO meta VALUES ('0',?)").run(Buffer.from(JSON.stringify(value)).toString("hex"));sql.close();}
  await writeFile(parentFile,'{"role":"user","message":{"content":[]}}\n');await writeFile(childFile,'{"role":"assistant","message":{"content":[{"type":"text","text":"Generated child answer"}]}}\n{"type":"turn_ended","status":"success"}\n');
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(root,"state"),origin:[],shell:"/bin/bash"});
  const live=server,paneId=live.session.snapshot().panes[0]!.id,write=(s:string)=>live.terminals.get(paneId)!.write(s);
  const origin=`http://127.0.0.1:${live.options.port}`,login=await fetch(origin+"/api/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(origin.replace("http","ws")+"/ws",{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once("open",resolve);ws!.once("error",reject);});const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const value=JSON.parse(raw.toString());if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}});
  const request=(method:string,params:any)=>new Promise<any>((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error("generated RPC timeout"));},5000);pending.set(id,value=>{clearTimeout(timer);if(value.error)reject(Error("generated RPC refused"));else resolve(value.result);});socket.send(JSON.stringify({id,method,params}));});

  await assertPaneResolvesFake({write,name:"cursor-agent",fakeDir:bin,scratchDir:root});write(`cursor-agent --resume ${parent}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.kind).toBe("cursor"),{timeout:12000,interval:50});write("h");
  await vi.waitFor(()=>{const a=live.session.getPane(paneId)?.agent;expect(a&&live.session.hasVerifiedAgentSession(paneId,a.instanceId,parent)).toBe(true);},{timeout:12000,interval:50});
  write("a");await vi.waitFor(()=>expect(offer).toHaveBeenCalled(),{timeout:5000});
  const controller=offer.mock.contexts.find(c=>c instanceof CursorChildObservations)!;
  await vi.waitFor(()=>expect(controller.binding(paneId,child)?.settings).toEqual({model:"observed-child-model",modelBasis:"session",reasoningEffort:"low",reasoningEffortBasis:"session"}),{timeout:5000});
  expect(live.session.getPane(paneId)?.agent?.subagents).toBeUndefined();write("s");
  await vi.waitFor(()=>expect(controller.terminals(paneId).items).toHaveLength(1),{timeout:5000});
  const binding=controller.terminals(paneId).items[0]!;expect(binding.settings.model).toBe("observed-child-model");expect(binding.settings.reasoningEffort).toBe("low");const record=await binding.openRecord();expect(record).toBeDefined();await record?.fd.close();expect(live.session.getPane(paneId)?.agent?.subagents).toBeUndefined();

  const listing=await request("agent.subagent_history",{paneId});expect(listing).toMatchObject({status:"ok",incomplete:true,items:[{id:child,model:"observed-child-model",terminalStatus:"completed",hasTranscript:true}]});const entryId=listing.items[0].entryId;
  const selection={paneId,agentId:child,entryId};expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"ok",terminalStatus:"completed",running:false,entries:[{kind:"say",text:"Generated child answer"}]});
  expect(await request("agent.subagent_history_usage",selection)).toMatchObject({status:"unavailable"});expect(live.session.getPane(paneId)?.agent?.subagents).toBeUndefined();
  expect(await request("agent.subagent_history_transcript",{...selection,entryId:randomUUID()})).toMatchObject({status:"unreadable"});
  await writeFile(childFile,'{"role":"user","message":{"content":[{"type":"text","text":"Generated later run"}]}}\n');expect(await request("agent.subagent_history_transcript",selection)).toMatchObject({status:"unreadable",entries:[]});
 }finally{ws?.close();await server?.close();offer.mockRestore();for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
},35000);
