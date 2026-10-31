import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {expect,it,vi} from 'vitest';
import {DesktopProvider} from './DesktopProvider.js';
it('keeps generated Portal receipts private across loopback endpoints and clears permission epochs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-native-monitor-provider-')),record=join(dir,'generated');
 const received:any[]=[],servers:WebSocketServer[]=[];
 async function relay(){const server=new WebSocketServer({host:'127.0.0.1',port:0});servers.push(server);await new Promise<void>(r=>server.once('listening',r));server.on('connection',ws=>ws.on('message',(raw,binary)=>{if(binary)return;const m=JSON.parse(raw.toString());received.push(m);if(m.type==='provider')ws.send(JSON.stringify({type:'attached'}));}));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
 const first=await relay(),second=await relay();
 const cfg={command:[process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--monitors','--native-platform','linux-portal','--record',record],nativePlatform:'linux-portal' as const,allowInput:false,allowMonitors:true,origins:()=>[]};
 const provider=new DesktopProvider(cfg),scopes:ReturnType<typeof provider.endpointScope>[]=[];
 const state=provider as any;
 async function run(loopback:string,controller:string){const scope=provider.endpointScope(loopback,()=>true,controller);scopes.push(scope);await scope.start('generated-owner',{url:loopback.replace(/^http/,'ws')+'/desktop-share',ticket:'a'.repeat(43),options:{nativePlatform:'linux-portal',width:1280,fps:10,quality:65,features:true,monitors:true}});await vi.waitFor(()=>expect(state.active?.ready).toBe(true));await vi.waitFor(()=>expect(state.nativeMonitorRestores.records.has(controller)).toBe(true));const configured=JSON.parse(await readFile(record+'.configure.json','utf8'));scope.close();await vi.waitFor(()=>expect(state.physicalHelpers.size).toBe(0));return configured;}
 try{
  expect((await run(first,'https://a.example')).nativeMonitorRestoreToken).toBeUndefined();
  expect((await run(second,'https://b.example')).nativeMonitorRestoreToken).toBeUndefined();
  expect((await run(second,'https://a.example')).nativeMonitorRestoreToken).toMatch(/^generated-portal-/);
  expect(received.some(m=>m.type==='native_monitor_restore'||'nativeMonitorRestoreToken'in m)).toBe(false);
  provider.configure({...cfg,allowMonitors:false});expect(state.nativeMonitorRestores.records.size).toBe(0);
  await expect(scopes[0]!.start('expired',{url:first.replace(/^http/,'ws')+'/desktop-share',ticket:'a'.repeat(43),options:{width:1280,fps:10,quality:65,features:true,monitors:true}})).rejects.toThrow(/expired/);
  provider.configure(cfg);expect((await run(first,'https://a.example')).nativeMonitorRestoreToken).toBeUndefined();
 }finally{for(const scope of scopes)scope.close();provider.dispose();for(const server of servers){for(const ws of server.clients)ws.terminate();await new Promise<void>(r=>server.close(()=>r()));}await rm(dir,{recursive:true,force:true});}
},15000);
