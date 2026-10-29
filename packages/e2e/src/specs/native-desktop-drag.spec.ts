import {test,expect} from "@playwright/test";
import {createServer} from "node:http";
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {spawn,type SpawnOptionsWithoutStdio} from "node:child_process";
import {WebSocketServer} from "ws";
import ts from "typescript";
import {DesktopFiles} from "../../../server/dist/desktop/DesktopFiles.js";
import {DesktopNativeGateway} from "../../../client-core/dist/desktop/DesktopNativeGateway.node.js";
import {DesktopNativeHost} from "../../../client-core/dist/desktop/DesktopNativeHost.node.js";
import {DesktopEndpointIdentity} from "../../../client-core/dist/desktop/DesktopE2e.js";
import {DesktopEndpointWire} from "../../../client-core/dist/desktop/DesktopEndpointWire.js";
import {encodeDesktopFrame,DESKTOP_FILES_PROTOCOL} from "@sodashitsu/protocol";
// @ts-expect-error Existing generated PNG fixture is JavaScript-only.
import {syntheticFrame} from "../../../../scripts/remote-desktop/synthetic-helper.mjs";

// Fixed in-memory target: private worker framing, SHA verification and actual
// process close. Never enters OLE, reads desktop selection or writes target files.
const target=String.raw`
const {createInterface}=require('node:readline'),{randomUUID,createHash}=require('node:crypto');
let nonce,entry,offset=0;const request=randomUUID(),chunks=[];
const send=v=>process.stdout.write(JSON.stringify({...v,nonce})+'\n');
createInterface({input:process.stdin}).on('line',line=>{
 if(!nonce){nonce=line;send({type:'ready',now:0});return;}
 const v=JSON.parse(line);if(v.type==='cancel')process.exit(3);
 if(v.type==='entry')entry=v;
 if(v.type==='seal')send({type:'need',request,index:0,offset:0,length:Math.min(65536,entry.bytes)});
 if(v.type==='bytes'){
  const bytes=Buffer.from(v.data,'base64');if(v.offset!==offset||v.request!==request)process.exit(4);
  chunks.push(bytes);offset+=bytes.length;
  if(offset<entry.bytes)send({type:'need',request,index:0,offset,length:entry.bytes-offset});
  else if(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')!==entry.sha256)process.exit(5);
  else process.stdout.write(JSON.stringify({type:'finished',nonce,copy:true})+'\n',()=>process.exit(0));
 }
});`;

async function fixture(sealed:boolean,vue=false){
 const root=await mkdtemp(join(tmpdir(),"soda-native-ui-generated-")),path=join(root,"generated.bin"),bytes=Buffer.alloc(70000);
 for(let i=0;i<bytes.length;i++)bytes[i]=i%251;await writeFile(path,bytes);
 const base=fileURLToPath(new URL("../../../",import.meta.url)),require=createRequire(import.meta.url);
 const trees:Record<string,string>={"/core/":join(base,"client-core/dist"),"/protocol/":join(base,"protocol/dist"),"/zod/":dirname(require.resolve("zod/package.json"))};
 const modules=new Map<string,string>();
 for(const name of ["nativeDrag","fileClient"]){const source=await readFile(join(base,"web/src/desktop",name+".ts"),"utf8");modules.set("/"+name+".js",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
 let descriptor:ReturnType<DesktopNativeGateway["descriptor"]>,held=false,at=0,seq=0,released=false;const generation=randomUUID(),session=randomUUID(),actions:any[]=[],controls:any[]=[],wires:DesktopEndpointWire[]=[];
 const provider=await DesktopEndpointIdentity.create(crypto);
 let releaseReads!:()=>void;const readGate=new Promise<void>(resolve=>{releaseReads=resolve;});
 const web=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,"http://fixture");
   if(vue&&(url.pathname==="/desktop-view"||url.pathname.startsWith("/assets/")||url.pathname==="/theme-boot.js")){
    const file=join(base,"web/dist",url.pathname==="/desktop-view"?"index.html":url.pathname);res.setHeader("Content-Type",file.endsWith(".html")?"text/html":file.endsWith(".css")?"text/css":"text/javascript");res.end(await readFile(file));return;
   }
   if(modules.has(url.pathname)){res.setHeader("Content-Type","text/javascript");res.end(modules.get(url.pathname));return;}
   for(const [prefix,tree]of Object.entries(trees))if(url.pathname.startsWith(prefix)){
    const file=resolve(tree,url.pathname.slice(prefix.length));if(!file.startsWith(tree+sep))throw Error("outside fixed tree");res.setHeader("Content-Type","text/javascript");res.end(await readFile(file));return;
   }
   if(url.pathname==="/demo.js"){
    res.setHeader("Content-Type","text/javascript");res.end(`
import {DesktopNativeDrag} from '/nativeDrag.js';import {DesktopFileClient} from '/fileClient.js';
import {DesktopNativeBridge} from '/core/desktop/DesktopNativeBridge.js';
import {DesktopEndpointIdentity} from '/core/desktop/DesktopE2e.js';import {DesktopEndpointWire} from '/core/desktop/DesktopEndpointWire.js';
const sealed=${sealed},descriptor=${JSON.stringify(descriptor)},session=${JSON.stringify(session)},pin=${JSON.stringify(await provider.fingerprint())};
const socket=new WebSocket(location.origin.replace('http','ws')+'/files');socket.binaryType='arraybuffer';
const status=document.querySelector('#status'),canvas=document.querySelector('canvas');let bridge,core,wire,granted=false,control=true,sequence=0;
const send=value=>{if(socket.readyState!==1)return false;if(wire)void wire.send('files',new TextEncoder().encode(JSON.stringify(value)));else socket.send(JSON.stringify(value));return true;};
const files=new DesktopFileClient(send,()=>{status.textContent='file-closed'});
const receive=value=>{if(value.type==='input_ack')core?.ack(value.seq);else files.receive(value);};
socket.onmessage=e=>{if(wire)void wire.receive(typeof e.data==='string'?e.data:new Uint8Array(e.data));else receive(JSON.parse(e.data));};
socket.onopen=async()=>{if(!sealed){status.textContent='connected';return;}const identity=await DesktopEndpointIdentity.create(crypto);wire=new DesktopEndpointWire({crypto,identity,session,role:'viewer',peerRole:'provider',expectedFingerprint:pin,active:()=>true,sendRaw:v=>socket.send(v),onRecord:(lane,bytes)=>receive(JSON.parse(new TextDecoder().decode(bytes))),onReady:()=>status.textContent='connected',onClose:()=>status.textContent='wire-closed'});socket.send(JSON.stringify({pin:await identity.fingerprint()}));await wire.start();};
document.querySelector('#grant').onclick=async()=>{await files.request({action:'grant',enabled:true});granted=true;document.querySelector('#grant-state').textContent='allowed';};
document.querySelector('#connect').onclick=async()=>{bridge=await DesktopNativeBridge.connect(descriptor,{signal:new AbortController().signal,event:value=>core?.event(value),closed:()=>core?.stop()});core=new DesktopNativeDrag({files,origin:location.origin,send:v=>bridge.send(v),valid:fresh=>granted&&(!fresh||control),fallback:()=>status.textContent='fallback',handoff:()=>{control=false;document.querySelector('#handoff').textContent='released'},release:()=>{control=false},status:v=>status.textContent=v});status.textContent='ready';};
const point=e=>({x:e.offsetX/canvas.width,y:e.offsetY/canvas.height,clientX:e.clientX,clientY:e.clientY});
canvas.onpointerdown=e=>{if(!e.isTrusted)return;core.begin(point(e));core.sent(++sequence);send({type:'applied_down',seq:sequence});};
canvas.onpointermove=e=>{if(e.buttons===1)core?.pointer(point(e),'move',e.buttons)};
canvas.onpointerup=e=>core?.pointer(point(e),'up',e.buttons);
window.addEventListener('pagehide',()=>{core?.stop();bridge?.stop();files.stop();wire?.close();socket.close()});
`);return;
   }
   res.setHeader("Content-Type","text/html");res.end(`<!doctype html><script type="importmap">{"imports":{"@sodashitsu/protocol":"/protocol/index.js","zod":"/zod/index.js"}}</script><button id="grant">Allow generated files</button><button id="connect">Prepare generated helper</button><p id="grant-state">off</p><p id="status">opening</p><p id="handoff">held</p><canvas width="400" height="200" style="background:#357"></canvas><script type="module" src="/demo.js"></script>`);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(web.address()as{port:number}).port}`;
 const files=await DesktopFiles.open(root,()=>true,undefined,()=>true,false,undefined,{origin,runtime:{prepare:async()=>{},capture:async()=>[path]},pointer:id=>id===seq?{seq:id,at,point:{epoch:generation,x:10,y:10,window:42,pid:1},valid:()=>held,release:async()=>{held=false;released=true;return {id:randomUUID(),epoch:generation};}}:undefined});
 const gateway=await DesktopNativeGateway.listen(origin,{binary:{prepare:async()=>{},executable:"generated-memory-target",close:async()=>{}},nativeFactory:options=>new DesktopNativeHost({...options,spawn:((_exe:string,_args:unknown,options:SpawnOptionsWithoutStdio)=>spawn(process.execPath,["-e",target],options))as unknown as typeof spawn})});descriptor=gateway.descriptor();
 const sockets=new WebSocketServer({server:web}),publicFrames:Buffer[]=[];
 let main:import("ws").WebSocket|undefined;
 sockets.on("connection",(socket,request)=>{
  if(vue&&new URL(request.url!,origin).pathname==="/ws"){socket.on("message",()=>{});return;}
  if(vue&&new URL(request.url!,origin).pathname==="/desktop-share"&&socket.protocol!==DESKTOP_FILES_PROTOCOL){
   main=socket;socket.on("message",raw=>{const value=JSON.parse(String(raw));controls.push(value);
    if(value.type==="start"){
     socket.send(JSON.stringify({type:"ready",title:"Generated B",width:320,height:180,allowInput:true,files:true,backend:"synthetic"}));
     socket.send(JSON.stringify({type:"files_ticket",ticket:"a".repeat(43)}));
     const frame=syntheticFrame(320,180,1);socket.send(encodeDesktopFrame(frame.info,Buffer.from(frame.data,"base64")));
    }else if(value.type==="control")socket.send(JSON.stringify(value));
    else if(value.type==="input"){if(value.input.kind==="pointer"&&value.input.event==="down"){held=true;seq=value.seq;at=performance.now();}socket.send(JSON.stringify({type:"input_ack",seq:value.seq}));}
   });return;
  }
  let wire:DesktopEndpointWire|undefined;
  const send=(value:unknown)=>{const text=JSON.stringify(value);if(wire)void wire.send("files",new TextEncoder().encode(text));else socket.send(text);};
  const receive=async(value:any)=>{
   if(value.type==="video_viewer"){main!.send(JSON.stringify({type:"files_ready"}));return;}
   if(value.type==="applied_down"){held=true;seq=value.seq;at=performance.now();send({type:"input_ack",seq});return;}
   actions.push(value.request);if(vue&&value.request.action==="native_read")await readGate;send(await files.run(value));
  };
  socket.on("message",(raw,binary)=>{
   publicFrames.push(Buffer.from(raw as Buffer));
   if(!sealed){void receive(JSON.parse(String(raw)));return;}
   if(!wire){const pin=JSON.parse(String(raw)).pin;wire=new DesktopEndpointWire({crypto,identity:provider,session,role:"provider",peerRole:"viewer",expectedFingerprint:pin,active:()=>socket.readyState===1,sendRaw:v=>socket.send(v),onRecord:(_lane,bytes)=>{void receive(JSON.parse(new TextDecoder().decode(bytes)));},onReady:()=>{},onClose:()=>socket.close()});wires.push(wire);void wire.start();}
   else void wire.receive(binary?new Uint8Array(raw as Buffer):String(raw));
  });socket.on("close",()=>wire?.close());
 });
 return {origin,descriptor,actions,controls,publicFrames,releaseReads,released:()=>released,close:async()=>{releaseReads();for(const wire of wires)wire.close();for(const socket of sockets.clients)socket.terminate();await gateway.close();await files.close();await new Promise<void>(resolve=>sockets.close(()=>resolve()));web.closeAllConnections();await new Promise<void>(resolve=>web.close(()=>resolve()));await rm(root,{recursive:true,force:true});}};
}
for(const sealed of [false,true])test(`browser drag copies generated chunks through ${sealed?"encrypted":"plain"} file lane and real helper process`,async({page})=>{
 const f=await fixture(sealed),frames:string[]=[];page.on("websocket",socket=>socket.on("framereceived",frame=>frames.push(String(frame.payload))));
 try{
  await page.goto(f.origin);await expect(page.locator("#status")).toHaveText("connected");
  await page.getByRole("button",{name:"Allow generated files"}).click();await expect(page.locator("#grant-state")).toHaveText("allowed");
  await page.getByRole("button",{name:"Prepare generated helper"}).click();await expect(page.locator("#status")).toHaveText("ready");
  const box=(await page.locator("canvas").boundingBox())!;await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.mouse.move(box.x+60,box.y+40);
  await expect(page.locator("#status")).toHaveText("Explorerへのコピーが完了しました");await page.mouse.up();
  await expect(page.locator("#handoff")).toHaveText("released");expect(f.released()).toBe(true);
  const reads=f.actions.filter(v=>v.action==="native_read");expect(reads.map(v=>[v.offset,v.length])).toEqual([[0,65536],[65536,4464]]);expect(new Set(reads.map(v=>v.request)).size).toBe(2);
  expect(f.actions.slice(0,3).map(v=>v.action)).toEqual(["grant","native_prepare","native_activate"]);
  expect(frames.some(text=>{try{return JSON.parse(text).type==="done";}catch{return false;}})).toBe(true);
  if(sealed)expect(f.publicFrames.every(bytes=>!bytes.includes(Buffer.from("native_read"))&&!bytes.includes(Buffer.from("generated.bin")))).toBe(true);
 }finally{await page.close();await f.close();}
});
test("actual Vue desktop wires file permission, trusted drag, capture release and native completion",async({page})=>{
 const f=await fixture(false,true);
 try{
  await page.goto(f.origin+"/desktop-view#"+encodeURIComponent(JSON.stringify({machineId:"generated",label:"Generated B"})));
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面",{exact:true});await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  await view.getByRole("button",{name:"情報・設定",exact:true}).click();
  const files=view.locator("[data-desktop-files]"),native=view.locator("[data-native-desktop-transfer]");await files.locator("summary").click();await native.locator("summary").first().click();
  await expect(native.getByRole("button",{name:"このPCで直接ドラッグを準備",exact:true})).toBeDisabled();
  await files.getByRole("button",{name:"ファイル転送を許可",exact:true}).click();await expect(native.getByRole("button",{name:"このPCで直接ドラッグを準備",exact:true})).toBeEnabled();
  await native.getByText("補助プログラムを手動で起動する",{exact:true}).click();await native.locator("[data-native-helper-url]").fill(f.descriptor.url);await native.getByRole("button",{name:"手動の補助プログラムへ接続",exact:true}).click();await expect(native.locator("output")).toContainText("有効");
  await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");await view.getByRole("button",{name:"情報・設定",exact:true}).click();
  const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();
  const captured=await canvas.evaluate(el=>{let id:number|undefined;for(let i=0;i<16;i++)if(el.hasPointerCapture(i))id=i;return id;});expect(captured).toBeDefined();
  await page.mouse.move(box.x+65,box.y+40);await expect(native.locator("output")).toHaveText("Explorerへドラッグ転送中");
  await page.mouse.up();await canvas.evaluate(el=>(el as HTMLElement).blur());
  await expect(native.locator("output")).toHaveText("Explorerへドラッグ転送中");f.releaseReads();await expect(native.locator("output")).toHaveText("Explorerへのコピーが完了しました");
  await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");expect(await canvas.evaluate((el,id)=>el.hasPointerCapture(id!),captured)).toBe(false);
  expect(f.controls.some(v=>v.type==="control"&&v.enabled===false)).toBe(true);const down=f.controls.findIndex(v=>v.type==="input"&&v.input.event==="down");expect(down).toBeGreaterThanOrEqual(0);expect(f.controls.slice(down).filter(v=>v.type==="input"&&v.input.event==="move")).toEqual([]);
  await page.mouse.up();expect(f.actions.filter(v=>v.action==="native_read").map(v=>v.offset)).toEqual([0,65536]);
 }finally{await page.close();await f.close();}
});
