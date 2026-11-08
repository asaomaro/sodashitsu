import {chmod,mkdir,mkdtemp,readFile,writeFile,appendFile,rm} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,it,vi} from "vitest";
import WebSocket from "ws";
import {composeServerOnFreePort} from "./composeServerOnFreePort.js";
import {assertPaneResolvesFake} from "./testing/fakeAgentGuard.js";
import {toAgentView} from "../../cli/dist/agentStatus.js";
import {subagentModelLabel} from "@sodashitsu/client-core";

// Never run a Windows host sampler or an account/model provider in this fixture.
vi.mock("./surface/methods/WslHostResources.js",()=>({isWslHost:()=>false,WslHostResourcesCache:class{get(){return undefined;}}}));

it.skipIf(process.platform!=="linux"||!existsSync("/bin/bash"))("publishes Grok native child settings through production snapshot, CLI serialization and shared labels",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-grok-subagent-wire-"));
 const keys=["HOME","GROK_HOME","PATH","ENV","CLAUDE_CONFIG_DIR","CODEX_HOME","COPILOT_HOME","XDG_DATA_HOME","SODA_ASSISTANT_ENABLED"] as const;
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const native=JSON.parse(await readFile(new URL("../../../.aidev/works/20261107-grok-cursor-native-children/installed-grok-native-fixture.json",import.meta.url),"utf8")),spawn=native.nativeEnvelopes[0].row,id=spawn.params.sessionId,child=spawn.params.update.child_session_id;
  const bin=join(dir,"bin"),grokHome=join(dir,".grok"),script=join(dir,"fake-grok.mjs");await mkdir(bin);
  for(const name of ["muse","agy","copilot","claude","codex","cursor-agent"]){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  // One generated SessionStart report after detection; no real provider/model.
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write("Grok fixture ready\\r\\n");process.stdin.on('data',d=>{const s=String(d);if(s.includes('q'))process.exit(0);if(s.includes('h')){const c=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL("../assets/agent-hook-report.cjs",import.meta.url)))},'grok'],{stdio:['pipe','ignore','ignore']});c.stdin.end(JSON.stringify({session_id:${JSON.stringify(id)},source:'resume',cwd:process.cwd()}));}});`);
  await writeFile(join(bin,"grok"),`#!/bin/bash\nexec -a grok ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,"grok"),0o755);
  process.env.HOME=dir;process.env.GROK_HOME=grokHome;process.env.CLAUDE_CONFIG_DIR=join(dir,".claude");process.env.CODEX_HOME=join(dir,".codex");process.env.COPILOT_HOME=join(dir,".copilot");process.env.XDG_DATA_HOME=join(dir,"data");process.env.PATH=`${bin}:${saved.PATH}`;process.env.SODA_ASSISTANT_ENABLED="0";delete process.env.ENV;
  server=await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"state"),origin:[],shell:"/bin/bash"});
  const live=server,paneId=live.session.snapshot().panes[0]!.id,base=join(grokHome,"sessions",encodeURIComponent(live.session.getPane(paneId)!.cwd)),parentDir=join(base,id),parentFile=join(parentDir,"updates.jsonl");
  await mkdir(parentDir,{recursive:true});await writeFile(parentFile,JSON.stringify(spawn)+"\n");
  const origin=`http://127.0.0.1:${live.options.port}`,login=await fetch(`${origin}/api/login`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(`ws://127.0.0.1:${live.options.port}/ws`,{headers:{origin,cookie:login.headers.get("set-cookie")!.split(";")[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once("open",resolve);ws!.once("error",reject);});
  const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on("message",(raw,binary)=>{if(binary)return;const r=JSON.parse(raw.toString());if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}});
  const hello=()=>new Promise<any>((resolve,reject)=>{const requestId=`grok-${++seq}`,timer=setTimeout(()=>{pending.delete(requestId);reject(Error("fixture RPC timeout"));},5000);pending.set(requestId,value=>{clearTimeout(timer);resolve(value.result.snapshot);});socket.send(JSON.stringify({id:requestId,method:"client.hello",params:{protocol:1,kind:"desktop"}}));});
  await hello();await assertPaneResolvesFake({write:input=>live.terminals.get(paneId)!.write(input),name:"grok",fakeDir:bin,scratchDir:dir});live.terminals.get(paneId)!.write(`grok --resume ${id}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.kind).toBe("grok"),{timeout:12000,interval:50});
  expect(live.session.getPane(paneId)?.agent?.subagents).toBeUndefined();live.terminals.get(paneId)!.write("h");
  await vi.waitFor(()=>{const a=live.session.getPane(paneId)?.agent;expect(a&&live.session.hasVerifiedAgentSession(paneId,a.instanceId,id)).toBe(true);},{timeout:12000,interval:50});
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.subagents?.items[0]).toMatchObject({model:"grok-4",modelBasis:"creation",state:"unknown"}),{timeout:8000,interval:50});
  const at=spawn.params._meta.agentTimestampMs+100,change=(model:string,effort?:string)=>JSON.stringify({method:"_x.ai/session/update",params:{sessionId:child,_meta:{agentTimestampMs:at},update:{sessionUpdate:"model_changed",model_id:model,reasoning_effort:effort}}})+"\n";
  await mkdir(join(base,child));await writeFile(join(base,child,"updates.jsonl"),change("grok-observed-child","high"));
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.subagents?.items[0]).toMatchObject({model:"grok-observed-child",modelBasis:"session",reasoningEffort:"high"}),{timeout:8000,interval:50});
  const snapshot=await hello(),pane=snapshot.panes.find((p:any)=>p.id===paneId),value=toAgentView({paneId,tabId:pane.tabId,workspaceId:null},pane.agent);
  expect(JSON.parse(JSON.stringify(value)).subagents.items[0]).toMatchObject({model:"grok-observed-child",modelBasis:"session",reasoningEffort:"high"});expect(subagentModelLabel(pane.agent.subagents.items[0])).toBe("grok-observed-child high");
  // Optional owned-fixture artifact for a real component render, never auth/config/body.
  if(process.env.SODA_GROK_WIRING_PUBLIC_FIXTURE)await writeFile(process.env.SODA_GROK_WIRING_PUBLIC_FIXTURE,JSON.stringify({kind:pane.agent.kind,subagents:pane.agent.subagents})+"\n");
  await appendFile(join(base,child,"updates.jsonl"),change("grok-child-next"));await vi.waitFor(()=>{const item=live.session.getPane(paneId)?.agent?.subagents?.items[0];expect(item?.model).toBe("grok-child-next");expect(item).not.toHaveProperty("reasoningEffort");},{timeout:8000,interval:50});
 }finally{
  ws?.close();await server?.close();for(const key of keys){const v=saved[key];if(v===undefined)delete process.env[key];else process.env[key]=v;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 }
},40000);
