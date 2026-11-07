import{chmod,mkdir,mkdtemp,writeFile,rm}from'node:fs/promises';
import{existsSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{fileURLToPath}from'node:url';
import{expect,it,vi}from'vitest';
import WebSocket from'ws';
import{composeServerOnFreePort}from'./composeServerOnFreePort.js';
import{assertPaneResolvesFake}from'./testing/fakeAgentGuard.js';
it.skipIf(process.platform!=='linux'||!existsSync('/bin/bash'))('routes generated Cursor hook usage to the current verified parent and deduplicates generations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-cursor-usage-it-'));
 const saved={HOME:process.env.HOME,PATH:process.env.PATH,ENV:process.env.ENV,CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR,CODEX_HOME:process.env.CODEX_HOME,COPILOT_HOME:process.env.COPILOT_HOME,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
 let server:Awaited<ReturnType<typeof composeServerOnFreePort>>|undefined,ws:WebSocket|undefined;
 try{
  const bin=join(dir,'bin'),script=join(dir,'fake-cursor.mjs');await mkdir(bin);
  for(const name of ['muse','agy','copilot','claude','codex','grok']){await writeFile(join(bin,name),'#!/bin/sh\nexit 1\n');await chmod(join(bin,name),0o755);}
  const id='93400255-ad63-45dd-9b1d-8252630156cc';
  await writeFile(script,`import{spawn}from'node:child_process';process.stdin.setRawMode(true);process.stdout.write("Cursor Agent fixture ready\\r\\n");function report(payload){const child=spawn(process.execPath,[${JSON.stringify(fileURLToPath(new URL('../assets/agent-hook-report.cjs',import.meta.url)))},'cursor'],{stdio:['pipe','ignore','ignore']});child.stdin.end(JSON.stringify(payload));}process.stdin.on('data',d=>{const text=String(d);if(text.includes('q'))process.exit(0);if(text.includes('h'))report({session_id:'${id}',hook_event_name:'sessionStart',cwd:process.cwd()});for(const key of ['u','v','c'])if(text.includes(key))report({hook_event_name:'afterAgentResponse',conversation_id:key==='c'?'8e4a4432-aa3f-4ce6-8c66-2425c944cb28':'${id}',...(key==='c'?{parent_conversation_id:'${id}'}:{}),generation_id:key==='v'?'generation-2':'generation-1',model_id:'fixture-model',model_params:[{id:'effort',value:'low'}],input_tokens:100,output_tokens:20,cache_read_tokens:30,cache_write_tokens:10,text:'PRIVATE GENERATED TEXT'});});`);
  await writeFile(join(bin,'cursor-agent'),`#!/bin/bash\nexec -a cursor-agent ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);await chmod(join(bin,'cursor-agent'),0o755);
  process.env.HOME=dir;process.env.CLAUDE_CONFIG_DIR=join(dir,'.claude');process.env.CODEX_HOME=join(dir,'.codex');process.env.COPILOT_HOME=join(dir,'.copilot');process.env.XDG_DATA_HOME=join(dir,'data');process.env.PATH=`${bin}:${saved.PATH}`;delete process.env.ENV;
  server=await composeServerOnFreePort({host:'127.0.0.1',stateDir:join(dir,'state'),origin:[],shell:'/bin/bash'});const live=server,paneId=live.session.snapshot().panes[0]!.id;
  const origin=`http://127.0.0.1:${live.options.port}`;const login=await fetch(`${origin}/api/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:live.freshToken})});expect(login.status).toBe(204);
  ws=new WebSocket(`ws://127.0.0.1:${live.options.port}/ws`,{headers:{origin,cookie:login.headers.get('set-cookie')!.split(';')[0]!}});await new Promise<void>((resolve,reject)=>{ws!.once('open',resolve);ws!.once('error',reject);});
  const socket=ws;let seq=0;const pending=new Map<string,(value:any)=>void>();socket.on('message',(raw,binary)=>{if(binary)return;const r=JSON.parse(raw.toString());if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}});
  const rpc=(method:string,params:unknown)=>new Promise<any>((resolve,reject)=>{const id=`usage-${++seq}`;const timer=setTimeout(()=>{pending.delete(id);reject(Error('fixture RPC timeout'));},5000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});socket.send(JSON.stringify({id,method,params}));});
  await rpc('client.hello',{protocol:1,kind:'desktop'});const usage=async()=>(await rpc('agent.usage',{paneId})).result.panes[paneId];
  await assertPaneResolvesFake({write:input=>live.terminals.get(paneId)!.write(input),name:'cursor-agent',fakeDir:bin,scratchDir:dir});live.terminals.get(paneId)!.write('cursor-agent\r');
  await vi.waitFor(()=>expect(live.session.getPane(paneId)?.agent?.kind).toBe('cursor'),{timeout:12000,interval:50});live.terminals.get(paneId)!.write('h');
  await vi.waitFor(()=>{const agent=live.session.getPane(paneId)?.agent;expect(agent&&live.session.hasVerifiedAgentSession(paneId,agent.instanceId,id)).toBe(true);},{timeout:5000,interval:50});expect(await usage()).toBeNull();
  live.terminals.get(paneId)!.write('u');await vi.waitFor(async()=>expect(await usage()).toMatchObject({kind:'cursor',model:'fixture-model',tokens:{basis:'transcript',input:60,output:20,total:120},reasoningEffort:'low',source:'hook',partial:true}),{timeout:5000,interval:50});
  live.terminals.get(paneId)!.write('uvc');await vi.waitFor(async()=>expect((await usage()).tokens.total).toBe(240),{timeout:5000,interval:50});
  const result=await usage();expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(result).not.toHaveProperty('contextTokens');
 }finally{ws?.close();await server?.close();for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
},25000);
