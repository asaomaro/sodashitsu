import{chmod,mkdir,mkdtemp,writeFile,rm}from'node:fs/promises';
import{existsSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{fileURLToPath}from'node:url';
import{expect,it,vi}from'vitest';
import WebSocket from'ws';
import{composeServerOnFreePort}from'./composeServerOnFreePort.js';
import{assertPaneResolvesFake}from'./testing/fakeAgentGuard.js';
it.skipIf(process.platform!=='linux'||!existsSync('/bin/bash'))('publishes a verified Grok ledger through the production agent.usage route without a model call',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-grok-usage-it-'));
 const saved={HOME:process.env.HOME,GROK_HOME:process.env.GROK_HOME,PATH:process.env.PATH,ENV:process.env.ENV,CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR,CODEX_HOME:process.env.CODEX_HOME,COPILOT_HOME:process.env.COPILOT_HOME,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const bin=join(dir,'bin'),grokHome=join(dir,'.grok'),script=join(dir,'fake-grok.mjs');await mkdir(bin);
  // agent.usage may query account providers too; every unrelated CLI is a no-model fixture.
  for(const name of ['muse','agy','copilot','claude','codex','cursor-agent']){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write("Grok fixture ready\\r\\n");function report(){const child=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL('../assets/agent-hook-report.cjs',import.meta.url)))},'grok'],{stdio:['pipe','ignore','ignore']});child.stdin.end(JSON.stringify({session_id:'7ac02d11-7e63-4a27-8845-b43b6fd4032f',source:'resume',cwd:process.cwd()}));}process.stdin.on("data",d=>{const text=String(d);if(text.includes("q"))process.exit(0);if(text.includes("h"))report();});`);
  await writeFile(join(bin,'grok'),`#!/bin/bash\nexec -a grok ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,'grok'),0o755);
  process.env.HOME=dir;process.env.GROK_HOME=grokHome;process.env.CLAUDE_CONFIG_DIR=join(dir,'.claude');process.env.CODEX_HOME=join(dir,'.codex');process.env.COPILOT_HOME=join(dir,'.copilot');process.env.XDG_DATA_HOME=join(dir,'data');process.env.PATH=`${bin}:${saved.PATH}`;delete process.env.ENV;
  server=await composeServerOnFreePort({host:'127.0.0.1',stateDir:join(dir,'state'),origin:[],shell:'/bin/bash'});
  const live=server,paneId=live.session.snapshot().panes[0]!.id,id='7ac02d11-7e63-4a27-8845-b43b6fd4032f';
  const records=join(grokHome,'sessions',encodeURIComponent(live.session.getPane(paneId)!.cwd),id);await mkdir(records,{recursive:true});
  await writeFile(join(records,'summary.json'),'{}');await writeFile(join(records,'usage.json'),JSON.stringify({sessionId:id,updatedAt:'2026-11-07T00:00:00Z',session:{inputTokens:100,outputTokens:20,cachedReadTokens:30,cacheCreationTokens:10,reasoningTokens:5,totalTokens:120,modelCalls:1,costUsdTicks:123456789}}));
  const origin=`http://127.0.0.1:${live.options.port}`;const login=await fetch(`${origin}/api/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(`ws://127.0.0.1:${live.options.port}/ws`,{headers:{origin,cookie:login.headers.get('set-cookie')!.split(';')[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once('open',resolve);ws!.once('error',reject);});
  const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on('message',(raw,binary)=>{if(binary)return;const r=JSON.parse(raw.toString());if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}});
  const rpc=(method:string,params:unknown)=>new Promise<any>((resolve,reject)=>{const id=`usage-${++seq}`;const timer=setTimeout(()=>{pending.delete(id);reject(Error('fixture RPC timeout'));},5000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});socket.send(JSON.stringify({id,method,params}));});
  await rpc('client.hello',{protocol:1,kind:'desktop'});
  expect((await rpc('agent.usage',{paneId})).result.panes[paneId]).toBeNull();
  await assertPaneResolvesFake({write:input=>live.terminals.get(paneId)!.write(input),name:'grok',fakeDir:bin,scratchDir:dir});
  live.terminals.get(paneId)!.write(`grok --resume ${id}\r`);
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.kind).toBe('grok'),{timeout:12000,interval:50});
  expect((await rpc('agent.usage',{paneId})).result.panes[paneId]).toBeNull();
  live.terminals.get(paneId)!.write('h');
  await vi.waitFor(()=>{const agent=live.session.getPane(paneId)?.agent;expect(agent&&live.session.hasVerifiedAgentSession(paneId,agent.instanceId,id)).toBe(true);},{timeout:12000,interval:50});
  const result=await rpc('agent.usage',{paneId});expect(result.result.panes[paneId]).toMatchObject({kind:'grok',source:'grok-usage',tokens:{basis:'cumulative',input:60,output:20,cacheRead:30,cacheWrite:10,total:120},costUsd:0.0123456789});
 }finally{
  ws?.close();await server?.close();for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 }
},25000);
