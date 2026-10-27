import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {WebSocket as NodeWebSocket,WebSocketServer} from "ws";
import {DesktopEndpointBackplane,DesktopProvider} from "@sodashitsu/server";
import {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {DesktopEndpointWire} from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import {DESKTOP_INPUT_PROTOCOL} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";

// Generated helper only. This joins the actual provider/private backplane to
// the actual crypto wire, through an opaque relay and a real browser. The test
// page reads the documented u16+JSON frame envelope to paint its generated PNG;
// it does not replace or claim to test the product viewer/production route.
test("encrypted browser paints generated B frames and sends raw Ctrl+Space through local permissions",async({page})=>{
 const directory=await mkdtemp(join(tmpdir(),"soda-endpoint-browser-")),inputFile=join(directory,"inputs.jsonl"),machine=randomUUID(),session=randomUUID(),errors:Error[]=[],opaque:Buffer[]=[],generations:number[]=[];
 const modules=new Map<string,string>();for(const name of ["DesktopE2e","DesktopEndpointWire"])modules.set(`/${name}.js`,await readFile(new URL(`../../../client-core/dist/desktop/${name}.js`,import.meta.url),"utf8"));
 const server=createServer((req,res)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type",modules.has(req.url??"")?"text/javascript":"text/html");res.end(modules.get(req.url??"")??'<!doctype html><body><canvas></canvas><p id="ready"></p><p id="frames">0</p><p id="control">false</p><p id="ack">0</p><p id="closed">false</p></body>');});
 const relay=new WebSocketServer({server,maxPayload:4*1024*1024});let providerSocket:NodeWebSocket|undefined,viewerSocket:NodeWebSocket|undefined;
 relay.on("connection",(socket,req)=>{
  const provider=req.url==="/provider";if(provider)providerSocket=socket;else viewerSocket=socket;
  socket.on("message",(raw,binary)=>{if(binary)opaque.push(Buffer.from(raw as Buffer));else {const message=JSON.parse(raw.toString());if(message.hello)generations.push(message.hello.generation);}(provider?viewerSocket:providerSocket)?.send(raw,{binary});});
  socket.on("close",()=>{(provider?viewerSocket:providerSocket)?.close();});
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const provider=new DesktopProvider({command:[process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input","--record",inputFile],allowInput:true,origins:()=>[]});provider.requireEndpoint(true);
 const plane=await DesktopEndpointBackplane.create(provider),root=plane.root(machine,()=>true),identity=await DesktopEndpointIdentity.create(crypto);let wire:DesktopEndpointWire|undefined,transport:NodeWebSocket|undefined;
 try {
  await page.goto(origin);const pin=await identity.fingerprint(),peer=await page.evaluate(async()=>{const path="/DesktopE2e.js",module=await import(path),identity=await module.DesktopEndpointIdentity.create(crypto);(window as any).__endpoint={identity};return {pin:await identity.fingerprint()};});
  const local=await root.open([DESKTOP_INPUT_PROTOCOL],(bytes,binary)=>{const record=new Uint8Array(bytes.length+1);record[0]=binary?0:1;record.set(bytes,1);void wire!.send(binary?"image":"control",record).catch(error=>{errors.push(error);wire?.close();});},()=>wire?.close());
  transport=new NodeWebSocket(origin.replace(/^http/,"ws")+"/provider");await new Promise<void>((resolve,reject)=>{transport!.once("open",resolve);transport!.once("error",reject);});
  wire=new DesktopEndpointWire({crypto,identity,session,role:"provider",peerRole:"viewer",expectedFingerprint:peer.pin,active:()=>root.active(),rotateRecords:3,sendRaw:raw=>transport!.send(raw),onRecord:(lane,bytes)=>{if(lane!=="control")throw Error("Generated input lane");local.send(new TextDecoder("utf-8",{fatal:true}).decode(bytes));},onReady:()=>{},onClose:()=>{root.close();transport?.close();}});
  await wire.start();transport.on("message",(raw,binary)=>{void wire!.receive(binary?new Uint8Array(raw as Buffer):raw.toString()).catch(error=>{if(root.active())errors.push(error);});});
  await page.evaluate(async({origin,pin,session,machine})=>{
   const path="/DesktopEndpointWire.js",{DesktopEndpointWire}=await import(path),state=(window as any).__endpoint,socket=new WebSocket(origin.replace(/^http/,"ws")+"/viewer");socket.binaryType="arraybuffer";
   await new Promise<void>((resolve,reject)=>{socket.onopen=()=>resolve();socket.onerror=()=>reject(Error("Generated browser transport"));});
   const wire=new DesktopEndpointWire({crypto,identity:state.identity,session,role:"viewer",peerRole:"provider",expectedFingerprint:pin,active:()=>true,rotateRecords:3,sendRaw:(raw:string|Uint8Array)=>socket.send(typeof raw==="string"?raw:new Uint8Array(raw)),onReady:()=>{document.querySelector("#ready")!.textContent="authenticated";void wire.send("control",new TextEncoder().encode(JSON.stringify({type:"start",machineId:machine,options:{width:320,fps:10,quality:65}})));},onRecord:(_lane:string,borrowed:Uint8Array)=>{
    const record=new Uint8Array(borrowed);
    if(record[0]===1){const msg=JSON.parse(new TextDecoder().decode(record.subarray(1)));if(msg.type==="control")document.querySelector("#control")!.textContent=String(msg.enabled);if(msg.type==="input_ack")document.querySelector("#ack")!.textContent=String(msg.seq);return;}
    const frame=record.subarray(1),length=new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint16(0),info=JSON.parse(new TextDecoder().decode(frame.subarray(2,2+length))),image=new Uint8Array(frame.subarray(2+length));
    void createImageBitmap(new Blob([image],{type:info.format})).then(bitmap=>{if(!wire.isReady){bitmap.close();return;}const canvas=document.querySelector("canvas")!;canvas.width=info.width;canvas.height=info.height;canvas.getContext("2d")!.drawImage(bitmap,0,0);bitmap.close();state.frameSeq=info.seq;state.frames=(state.frames??0)+1;document.querySelector("#frames")!.textContent=String(state.frames);});
   },onClose:()=>{document.querySelector("#closed")!.textContent="true";socket.close();}});
   state.wire=wire;state.send=(message:unknown)=>wire.send("control",new TextEncoder().encode(JSON.stringify(message)));socket.onmessage=event=>{void wire.receive(typeof event.data==="string"?event.data:new Uint8Array(event.data)).catch(()=>{});};socket.onclose=()=>wire.close();await wire.start();
  },{origin,pin,session,machine});
  await expect(page.locator("#ready")).toHaveText("authenticated");await expect(page.locator("#frames")).toHaveText("1");
  expect(await page.locator("canvas").evaluate(canvas=>{const c=canvas as HTMLCanvasElement;return {width:c.width,height:c.height,alpha:c.getContext("2d")!.getImageData(100,80,1,1).data[3]};})).toEqual({width:320,height:180,alpha:255});
  await page.evaluate(async()=>{await (window as any).__endpoint.send({type:"control",enabled:true});});await expect(page.locator("#control")).toHaveText("true");
  await page.evaluate(async()=>{const s=(window as any).__endpoint,inputs=[{kind:"key",code:"ControlLeft",down:true},{kind:"key",code:"Space",down:true},{kind:"key",code:"Space",down:false},{kind:"key",code:"ControlLeft",down:false}];for(let n=0;n<inputs.length;n++)await s.send({type:"input",seq:n+1,frameSeq:s.frameSeq,input:inputs[n]});});await expect(page.locator("#ack")).toHaveText("4");
  expect((await readFile(inputFile,"utf8")).trim().split("\n").map(row=>JSON.parse(row))).toEqual([{kind:"key",code:"ControlLeft",down:true},{kind:"key",code:"Space",down:true},{kind:"key",code:"Space",down:false},{kind:"key",code:"ControlLeft",down:false}]);
  for(let n=2;n<=5;n++){await page.evaluate(async()=>{const s=(window as any).__endpoint;await s.send({type:"ack",seq:s.frameSeq});});await expect(page.locator("#frames")).toHaveText(String(n));}
  expect(generations.some(value=>value>=3)).toBe(true);expect(opaque.some(packet=>packet.includes(Buffer.from("ControlLeft"))||packet.includes(Buffer.from([137,80,78,71,13,10,26,10])))).toBe(false);
  root.close();await expect(page.locator("#closed")).toHaveText("true");expect(errors).toEqual([]);
 }finally{
  wire?.close();root.close();transport?.terminate();for(const socket of relay.clients)socket.terminate();await plane.close();provider.dispose();await page.goto("about:blank");await new Promise<void>(resolve=>relay.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});
 }
});
