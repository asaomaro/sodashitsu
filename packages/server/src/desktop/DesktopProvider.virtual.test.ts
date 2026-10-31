import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {expect,it,vi} from 'vitest';
import {DesktopProvider} from './DesktopProvider.js';
it.each([true,false])('requires the generated helper virtual source proof before publishing: %s',async proof=>{
 const relay=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise<void>(r=>relay.once('listening',r));const origin=`http://127.0.0.1:${(relay.address() as {port:number}).port}`,messages:any[]=[];let closed=false;
 relay.on('connection',ws=>{ws.on('close',()=>{closed=true;});ws.on('message',(bytes,binary)=>{if(binary)return;const m=JSON.parse(bytes.toString());messages.push(m);if(m.type==='provider')ws.send(JSON.stringify({type:'attached'}));});});
 const provider=new DesktopProvider({command:[process.execPath,fileURLToPath(new URL('../../../../scripts/remote-desktop/synthetic-helper.mjs',import.meta.url)),'--static','--native-platform','linux-portal',...(proof?['--virtual-display']:[])],nativePlatform:'linux-portal',allowInput:false,allowVirtualDisplay:true,origins:()=>[origin]});
 try{await provider.start('generated',{url:origin.replace(/^http/,'ws')+'/desktop-share',ticket:'a'.repeat(43),options:{nativePlatform:'linux-portal',width:320,fps:10,quality:65,features:true,virtualDisplay:true}});
  if(proof)await vi.waitFor(()=>expect(messages.find(m=>m.type==='ready')).toMatchObject({virtualDisplay:true,backend:'linux-portal'}));
  else{await vi.waitFor(()=>expect(closed).toBe(true));expect(messages.some(m=>m.type==='ready')).toBe(false);await vi.waitFor(()=>expect((provider as any).physicalHelpers.size).toBe(0));}
 }finally{provider.dispose();for(const ws of relay.clients)ws.terminate();await new Promise<void>(r=>relay.close(()=>r()));}
},10000);
