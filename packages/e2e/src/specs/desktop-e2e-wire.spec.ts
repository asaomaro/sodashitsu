import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {WebSocket,WebSocketServer} from "ws";
import {DesktopEndpointIdentity,DESKTOP_E2E_LANES} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {DesktopEndpointWire} from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import {expect,test} from "../support/fixtures.js";

// Generated endpoint transport, not the product route. Two real browser sockets
// cross an opaque WS relay; only endpoint code owns identities/plaintext. DOM
// receipts prove browser delivery through repeated rekeys. No desktop or audio.
test("two browser endpoints keep every lane through rotation and isolated revocation",async({page,context})=>{
 const files=new Map<string,string>();
 for(const name of ["DesktopE2e","DesktopEndpointWire"])files.set(`/${name}.js`,await readFile(new URL(`../../../client-core/dist/desktop/${name}.js`,import.meta.url),"utf8"));
 const server=createServer((req,res)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type",files.has(req.url??"")?"text/javascript":"text/html");res.end(files.get(req.url??"")??'<!doctype html><body><p id="ready">waiting</p><p id="received">0</p><p id="last"></p><p id="closed">false</p></body>');});
 const relay=new WebSocketServer({server,maxPayload:4*1024*1024}),pairs=new Map<string,{provider?:WebSocket;viewer?:WebSocket}>(),ciphertexts:Buffer[]=[],publicGenerations:number[]=[],endpointWires:DesktopEndpointWire[]=[],errors:Error[]=[];
 relay.on("connection",(socket,request)=>{
  const url=new URL(request.url!,"http://localhost"),id=url.searchParams.get("id")!,role=url.searchParams.get("role")!;
  const pair=pairs.get(id)??{};pairs.set(id,pair);
  if(role==="provider")pair.provider=socket;else pair.viewer=socket;
  socket.on("message",(raw,binary)=>{
   const peer=role==="provider"?pair.viewer:pair.provider;
   if(binary)ciphertexts.push(Buffer.from(raw as Buffer));
   else {const msg=JSON.parse(raw.toString());if(msg.hello)publicGenerations.push(msg.hello.generation);}
   if(peer?.readyState===WebSocket.OPEN)peer.send(raw,{binary});
  });
  socket.on("close",()=>{(role==="provider"?pair.viewer:pair.provider)?.close();});
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,identity=await DesktopEndpointIdentity.create(crypto),pin=await identity.fingerprint(),second=await context.newPage();
 const providers:WebSocket[]=[],owners:{active:boolean}[]=[];
 try {
  for(const browser of [page,second]) {
   const id=randomUUID(),owner={active:true};owners.push(owner);await browser.goto(origin);
   const viewer=await browser.evaluate(async()=>{const path="/DesktopE2e.js",module=await import(path),identity=await module.DesktopEndpointIdentity.create(crypto);(window as any).__generated={identity};return {pin:await identity.fingerprint()};});
   const socket=new WebSocket(origin.replace("http:","ws:")+`/?role=provider&id=${id}`);providers.push(socket);
   await new Promise<void>((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
   const wire=new DesktopEndpointWire({crypto,identity,session:id,role:"provider",peerRole:"viewer",expectedFingerprint:viewer.pin,active:()=>owner.active,rotateRecords:2,sendRaw:raw=>socket.send(raw),onReady:()=>{},onRecord:(lane,bytes)=>{void wire.send(lane,bytes).catch(error=>errors.push(error));},onClose:()=>socket.close()});endpointWires.push(wire);await wire.start();
   socket.on("message",(raw,binary)=>{void wire.receive(binary?new Uint8Array(raw as Buffer):raw.toString()).catch(error=>{if(owner.active)errors.push(error);});});
   await browser.evaluate(async({id,pin,origin})=>{
    const path="/DesktopEndpointWire.js",{DesktopEndpointWire}=await import(path),state=(window as any).__generated,socket=new WebSocket(origin.replace("http:","ws:")+`/?role=viewer&id=${id}`);socket.binaryType="arraybuffer";
    await new Promise<void>((resolve,reject)=>{socket.onopen=()=>resolve();socket.onerror=()=>reject(Error("Generated viewer socket failed"));});
    const wire=new DesktopEndpointWire({crypto,identity:state.identity,session:id,role:"viewer",peerRole:"provider",expectedFingerprint:pin,active:()=>true,rotateRecords:2,sendRaw:(raw:string|Uint8Array)=>socket.send(raw),onReady:()=>{document.querySelector("#ready")!.textContent="ready";},onRecord:(lane:string,bytes:Uint8Array)=>{state.count=(state.count??0)+1;document.querySelector("#received")!.textContent=String(state.count);document.querySelector("#last")!.textContent=lane+":"+new TextDecoder().decode(bytes);},onClose:()=>{document.querySelector("#closed")!.textContent="true";socket.close();}});
    state.wire=wire;socket.onmessage=event=>{void wire.receive(typeof event.data==="string"?event.data:new Uint8Array(event.data)).catch(()=>{});};socket.onclose=()=>wire.close();await wire.start();
   },{id,pin,origin});
   await expect(browser.locator("#ready")).toHaveText("ready");
  }
  let count=0;
  for(let generation=0;generation<3;generation++)for(const lane of DESKTOP_E2E_LANES) {
   count++;
   for(const browser of [page,second]) {
    const plain="generated-private-"+generation+"-"+lane;
    await browser.evaluate(async({lane,plain})=>{await (window as any).__generated.wire.send(lane,new TextEncoder().encode(plain));},{lane,plain});
    await expect(browser.locator("#received")).toHaveText(String(count));await expect(browser.locator("#last")).toHaveText(lane+":"+plain);
   }
  }
  expect(publicGenerations.some(value=>value>=3)).toBe(true);expect(ciphertexts.length).toBeGreaterThan(100);expect(ciphertexts.some(packet=>packet.includes(Buffer.from("generated-private-")))).toBe(false);
  owners[0]!.active=false;endpointWires[0]!.poll();await expect(page.locator("#closed")).toHaveText("true");await expect(second.locator("#closed")).toHaveText("false");
  await second.evaluate(async()=>{await (window as any).__generated.wire.send("control",new TextEncoder().encode("surviving-viewer"));});await expect(second.locator("#received")).toHaveText("28");await expect(second.locator("#last")).toHaveText("control:surviving-viewer");expect(errors).toEqual([]);
 }finally{
  for(const wire of endpointWires)wire.close();for(const socket of providers)socket.terminate();for(const socket of relay.clients)socket.terminate();
  await second.close();await page.goto("about:blank");await new Promise<void>(resolve=>relay.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
