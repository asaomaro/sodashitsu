import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {WebSocket} from "ws";
import type {LinkChannel} from "../machine/MachineLink.js";
import {DESKTOP_FILES_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_SHARED_PROTOCOL,DesktopOptions,decodeDesktopFrame} from "@sodashitsu/protocol";
import {DesktopProvider,type DesktopProviderConfig} from "./DesktopProvider.js";
import {DesktopEndpointBackplane,type DesktopEndpointRoot} from "./DesktopEndpointBackplane.js";
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function fixture(allowInput=true) {
 const directory=await mkdtemp(join(tmpdir(),"soda-private-desktop-")),record=join(directory,"inputs.jsonl"),lifecycle=join(directory,"lifecycle.jsonl"),publicMachine=randomUUID();
 const config:DesktopProviderConfig={command:[process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input","--record",record,"--lifecycle-ledger",lifecycle],allowInput,origins:()=>[]};
 const provider=new DesktopProvider(config);provider.requireEndpoint(true);const plane=await DesktopEndpointBackplane.create(provider);
 cleanup.push(async()=>{await plane.close();provider.dispose();await rm(directory,{recursive:true,force:true});});
 async function log(path=record){try{return (await readFile(path,"utf8")).trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}}
 async function viewer(protocols:string[]=[],root=plane.root(publicMachine,()=>true)) {
  const messages:Record<string,unknown>[]=[],frames:Uint8Array[]=[],closed=vi.fn();
  const socket=await root.open(protocols,(bytes,binary)=>{if(binary)frames.push(bytes.slice());else messages.push(JSON.parse(new TextDecoder().decode(bytes)));},closed);
  return {root,socket,messages,frames,closed,send:(value:unknown)=>socket.send(JSON.stringify(value)),start:(shared=false)=>socket.send(JSON.stringify({type:"start",machineId:publicMachine,options:{width:320,fps:10,quality:65,...(shared?{features:true,sharedDesktop:true}:{})}}))};
 }
 return {provider,config,plane,record,lifecycle,publicMachine,log,viewer};
}
it("rejects legacy and forged endpoint starts before opening a provider socket",async()=>{
 const f=await fixture(),params={url:"ws://127.0.0.1:9/desktop-share",ticket:"x".repeat(43),options:DesktopOptions.parse({})};
 await expect(f.provider.start("legacy",params)).rejects.toThrow("Authenticated");
 await expect(f.provider.start("forged",params,{origin:"http://127.0.0.1:9",epoch:f.provider.epoch,active:()=>true})).rejects.toThrow("Authenticated");expect(await f.log(f.lifecycle)).toEqual([]);
});
it("runs the generated helper and raw input through the private permission backplane",async()=>{
 const f=await fixture(),v=await f.viewer([DESKTOP_INPUT_PROTOCOL]);v.start();await expect.poll(()=>v.frames.length).toBe(1);expect(v.messages).toContainEqual(expect.objectContaining({type:"ready",backend:"synthetic"}));
 const frameSeq=decodeDesktopFrame(v.frames[0]!).info.seq;v.send({type:"control",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);
 const inputs=[{kind:"key",code:"ControlLeft",down:true},{kind:"key",code:"Space",down:true},{kind:"key",code:"Space",down:false},{kind:"key",code:"ControlLeft",down:false}];
 inputs.forEach((input,index)=>v.send({type:"input",seq:index+1,frameSeq,input}));
 await expect.poll(()=>v.messages.some(m=>m.type==="input_ack"&&m.seq===4)).toBe(true);expect(await f.log()).toEqual(inputs);
 v.root.close();await expect.poll(()=>v.closed.mock.calls.length).toBe(1);expect(v.root.active()).toBe(false);
});
it("binds the public target before rewriting it to a private machine route",async()=>{
 const f=await fixture(),v=await f.viewer();expect(()=>v.send({type:"start",machineId:randomUUID(),options:{}})).toThrow();expect(v.root.active()).toBe(false);expect(await f.log(f.lifecycle)).toEqual([]);
});
it("stops input and helper ownership synchronously when the endpoint is revoked",async()=>{
 const f=await fixture();let active=true;const root=f.plane.root(f.publicMachine,()=>active),v=await f.viewer([DESKTOP_INPUT_PROTOCOL],root);v.start();await expect.poll(()=>v.frames.length).toBe(1);v.send({type:"control",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);
 active=false;root.close();expect(root.active()).toBe(false);expect(()=>v.send({type:"input",seq:1,frameSeq:1,input:{kind:"text",text:"denied"}})).toThrow();expect(await f.log()).toEqual([]);await expect.poll(()=>v.closed.mock.calls.length).toBe(1);
});
it("does not revive an old root after provider configure or handoff rollback",async()=>{
 const f=await fixture(),root=f.plane.root(f.publicMachine,()=>true);const before=f.provider.epoch;f.provider.configure(f.config);expect(f.provider.epoch).toBeGreaterThan(before);expect(root.active()).toBe(false);await expect(root.open([],()=>{},()=>{})).rejects.toThrow();
 f.provider.resumeUnlockLease();expect(root.active()).toBe(false);const newer=await f.viewer();newer.start();await expect.poll(()=>newer.frames.length).toBe(1);
});
it("supports the existing separate image lane without exposing its private cookie",async()=>{
 const f=await fixture(),v=await f.viewer([DESKTOP_INPUT_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL]);v.start();await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);
 const ticket=v.messages.find(m=>m.type==="image_ticket")!.ticket,frames:Uint8Array[]=[];
 const child=await v.root.open([DESKTOP_IMAGE_LANE_PROTOCOL],(bytes,binary)=>{expect(binary).toBe(true);frames.push(bytes.slice());},()=>{});child.send(JSON.stringify({type:"video_viewer",ticket}));v.send({type:"image_ready"});
 await expect.poll(()=>frames.length).toBe(1);expect(v.frames).toEqual([]);v.send({type:"ack",seq:decodeDesktopFrame(frames[0]!).info.seq});await expect.poll(()=>frames.length).toBeGreaterThan(1);
 v.root.close();expect(()=>child.send("{}")).toThrow();expect(Object.keys(v.root).sort()).toEqual(["active","close","grantAgent","open","revokeAgent"]);
});
it("rejects child-before-parent, duplicate parents and more than eight roots",async()=>{
 const f=await fixture(),root=f.plane.root(f.publicMachine,()=>true);
 await expect(root.open([DESKTOP_IMAGE_LANE_PROTOCOL],()=>{},()=>{})).rejects.toThrow();
 await root.open([],()=>{},()=>{});await expect(root.open([],()=>{},()=>{})).rejects.toThrow();
 for(let n=0;n<7;n++)f.plane.root(f.publicMachine,()=>true);expect(()=>f.plane.root(f.publicMachine,()=>true)).toThrow();
});
it("retains another viewer and its common helper when one endpoint closes",async()=>{
 const f=await fixture(),a=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]),b=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]);a.start(true);await expect.poll(()=>a.frames.length).toBe(1);b.start(true);await expect.poll(()=>b.frames.length).toBe(1);
 expect((await f.log(f.lifecycle)).filter(row=>row.type==="spawn")).toHaveLength(1);a.root.close();await expect.poll(()=>a.closed.mock.calls.length).toBe(1);expect(b.root.active()).toBe(true);b.send({type:"ack",seq:decodeDesktopFrame(b.frames[0]!).info.seq});await expect.poll(()=>b.frames.length).toBeGreaterThan(1);expect(b.closed).not.toHaveBeenCalled();
});
it("requires both the private cookie and the exact local origin for viewer upgrade",async()=>{
 const f=await fixture(),origin=(f.plane as unknown as {origin:string}).origin;
 f.plane.root(f.publicMachine,()=>true);
 async function denied(requestOrigin:string,cookie:string){
  const ws=new WebSocket(origin.replace(/^http/,"ws")+"/desktop-share",{headers:{origin:requestOrigin,cookie}});
  return new Promise<string>(resolve=>{ws.on("error",error=>resolve(error.message));ws.on("open",()=>{ws.terminate();resolve("unexpected upgrade");});});
 }
 expect(await denied(origin,"SodaDesktopEndpoint="+"a".repeat(64))).toContain("401");
 expect(await denied("https://attacker.invalid","SodaDesktopEndpoint="+"a".repeat(64))).toContain("403");expect(await f.log(f.lifecycle)).toEqual([]);
});
it("limits endpoint scopes to the exact registered loopback origin",async()=>{
 const f=await fixture();expect(()=>f.provider.endpointScope("https://attacker.invalid",()=>true)).toThrow();
 expect(()=>f.provider.endpointScope("http://127.0.0.1:12345/path",()=>true)).toThrow();
 const scope=f.provider.endpointScope("http://127.0.0.1:12345",()=>true);
 await expect(scope.start(randomUUID(),{url:"ws://127.0.0.1:12346/desktop-share",ticket:"x".repeat(43),options:DesktopOptions.parse({})})).rejects.toThrow("共有先");scope.close();expect(scope.active()).toBe(false);expect(await f.log(f.lifecycle)).toEqual([]);
});
it("closes the root on malformed parent JSON and coalesces shutdown promises",async()=>{
 const f=await fixture(),v=await f.viewer();expect(()=>v.socket.send("{")).toThrow();expect(v.root.active()).toBe(false);
 const closing=f.plane.close();expect(f.plane.close()).toBe(closing);await closing;
});
it("preserves the local input ceiling even if the helper advertises input",async()=>{
 const f=await fixture(false),v=await f.viewer([DESKTOP_INPUT_PROTOCOL]);v.start();await expect.poll(()=>v.frames.length).toBe(1);expect(v.messages.find(m=>m.type==="ready")!.allowInput).toBe(false);
 v.send({type:"control",enabled:true});v.send({type:"input",seq:1,frameSeq:decodeDesktopFrame(v.frames[0]!).info.seq,input:{kind:"text",text:"forbidden"}});v.send({type:"ack",seq:decodeDesktopFrame(v.frames[0]!).info.seq});
 await expect.poll(()=>v.frames.length).toBeGreaterThan(1);expect(v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(false);expect(await f.log()).toEqual([]);
});
it("rejects a provider start released after its root was revoked",async()=>{
 const f=await fixture();let resume!:()=>void,started!:()=>void,finished!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;}),done=new Promise<void>(resolve=>{finished=resolve;}),start=f.provider.start.bind(f.provider);
 const spy=vi.spyOn(f.provider,"start").mockImplementation(async(...args)=>{started();await gate;try{return await start(...args);}finally{finished();}});
 const v=await f.viewer();v.start();await begun;v.root.close();resume();await done;spy.mockRestore();expect(await f.log(f.lifecycle)).toEqual([]);expect(v.frames).toEqual([]);expect(v.messages.some(m=>m.type==="ready")).toBe(false);
});
it("completes all socket cleanup even if revocation and close callbacks throw",async()=>{
 const f=await fixture(),root=f.plane.root(f.publicMachine,()=>true);
 const internals=f.plane as unknown as {roots:Map<string,{channels:Set<LinkChannel>;sockets:Set<WebSocket>}>;revoked:Set<()=>void>};
 const socket=await root.open([],()=>{},()=>{throw Error("generated close failure");});const state=[...internals.roots.values()][0]!;
 socket.send(JSON.stringify({type:"start",machineId:f.publicMachine,options:{width:320,fps:10,quality:65}}));await expect.poll(()=>state.channels.size).toBe(1);[...state.channels][0]!.onClose(()=>{throw Error("generated channel close failure");});
 internals.revoked.add(()=>{throw Error("generated revocation failure");});expect(()=>root.close()).not.toThrow();expect(state.channels.size).toBe(0);expect(state.sockets.size).toBe(0);expect(internals.roots.size).toBe(0);await f.plane.close();
});
it("rejects another root's image ticket without consuming the legitimate attachment",async()=>{
 const f=await fixture(),a=await f.viewer([DESKTOP_INPUT_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL]),b=await f.viewer();a.start();await expect.poll(()=>a.messages.some(m=>m.type==="image_ticket")).toBe(true);
 const ticket=a.messages.find(m=>m.type==="image_ticket")!.ticket,closed=vi.fn();const attacker=await b.root.open([DESKTOP_IMAGE_LANE_PROTOCOL],()=>{},closed);attacker.send(JSON.stringify({type:"video_viewer",ticket}));await expect.poll(()=>closed.mock.calls.length).toBe(1);expect(a.root.active()).toBe(true);
 const frames:Uint8Array[]=[],legitimate=await a.root.open([DESKTOP_IMAGE_LANE_PROTOCOL],(bytes,binary)=>{if(binary)frames.push(bytes.slice());},()=>{});legitimate.send(JSON.stringify({type:"video_viewer",ticket}));a.send({type:"image_ready"});await expect.poll(()=>frames.length).toBe(1);expect(a.closed).not.toHaveBeenCalled();
});
it("binds a recipient grant to its own private viewer scope and forwards only permitted agent input",async()=>{
 const f=await fixture(),v=await f.viewer([DESKTOP_INPUT_PROTOCOL]),fingerprint="a".repeat(64);v.start();await expect.poll(()=>v.frames.length).toBe(1);
 const grant=v.root.grantAgent({fingerprint,active:()=>true}),rpc=f.plane.agent(fingerprint,grant.scope,()=>true);
 const call=async(id:number,method:string,params:unknown)=>JSON.parse(await rpc.request(JSON.stringify({id:String(id),method,params})));
 const {leaseId}=(await call(1,"desktop.agent.attach",{ticket:grant.ticket})).result,observed=(await call(2,"desktop.agent.observe",{leaseId})).result;
 const inputs=[{kind:"key",code:"ControlLeft",down:true},{kind:"key",code:"Space",down:true},{kind:"key",code:"Space",down:false},{kind:"key",code:"ControlLeft",down:false}];
 expect((await call(3,"desktop.agent.act",{leaseId,observationId:observed.observationId,inputs})).result.acknowledged).toBe(4);expect(await f.log()).toEqual(inputs);
 expect((await call(4,"desktop.agent.release",{leaseId})).result.released).toBe(true);expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(0);
});
it("rejects another root scope or recipient without consuming a rightful grant",async()=>{
 const f=await fixture(),a=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]),b=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]),fingerprint="a".repeat(64);a.start(true);await expect.poll(()=>a.frames.length).toBe(1);b.start(true);await expect.poll(()=>b.frames.length).toBe(1);
 const grant=a.root.grantAgent({fingerprint,active:()=>true}),other=b.root.grantAgent({fingerprint,active:()=>true});
 const wrongScope=f.plane.agent(fingerprint,other.scope,()=>true);await expect(wrongScope.request(JSON.stringify({id:"1",method:"desktop.agent.attach",params:{ticket:grant.ticket}}))).rejects.toThrow();
 const wrongRecipient=f.plane.agent("b".repeat(64),grant.scope,()=>true);await expect(wrongRecipient.request(JSON.stringify({id:"1",method:"desktop.agent.attach",params:{ticket:grant.ticket}}))).rejects.toThrow();
 const rightful=f.plane.agent(fingerprint,grant.scope,()=>true);expect(JSON.parse(await rightful.request(JSON.stringify({id:"1",method:"desktop.agent.attach",params:{ticket:grant.ticket}}))).result.leaseId).toHaveLength(43);rightful.close();
});
it("keeps a second root's agent alive when another root closes or its owner callback runs late",async()=>{
 const f=await fixture(),a=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]),b=await f.viewer([DESKTOP_SHARED_PROTOCOL,DESKTOP_INPUT_PROTOCOL]),fingerprint="a".repeat(64);a.start(true);await expect.poll(()=>a.frames.length).toBe(1);b.start(true);await expect.poll(()=>b.frames.length).toBe(1);
 const ag=a.root.grantAgent({fingerprint,active:()=>true}),bg=b.root.grantAgent({fingerprint,active:()=>true}),ar=f.plane.agent(fingerprint,ag.scope,()=>true),br=f.plane.agent(fingerprint,bg.scope,()=>true);
 const attach=(rpc:typeof ar,ticket:string)=>rpc.request(JSON.stringify({id:"1",method:"desktop.agent.attach",params:{ticket}}));await attach(ar,ag.ticket);const {leaseId}=JSON.parse(await attach(br,bg.ticket)).result;
 a.root.close();ar.close();expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(1);expect(JSON.parse(await br.request(JSON.stringify({id:"2",method:"desktop.agent.observe",params:{leaseId}}))).result.imageBase64).toBeTruthy();expect(b.root.active()).toBe(true);expect((await f.log(f.lifecycle)).filter(row=>row.type==="spawn")).toHaveLength(1);
 b.root.revokeAgent();await expect(br.request(JSON.stringify({id:"3",method:"desktop.agent.observe",params:{leaseId}}))).rejects.toThrow();expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(0);
});
it("preserves the input ceiling and reclaims the finite private owner capacity",async()=>{
 const denied=await fixture(false),v=await denied.viewer([DESKTOP_INPUT_PROTOCOL]);v.start();await expect.poll(()=>v.frames.length).toBe(1);expect(()=>v.root.grantAgent({fingerprint:"a".repeat(64),active:()=>true})).toThrow();expect(await denied.log()).toEqual([]);
 const f=await fixture(),allowed=await f.viewer([DESKTOP_INPUT_PROTOCOL]);allowed.start();await expect.poll(()=>allowed.frames.length).toBe(1);const grant=allowed.root.grantAgent({fingerprint:"a".repeat(64),active:()=>true}),owners=Array.from({length:8},()=>f.plane.agent("a".repeat(64),grant.scope,()=>true));
 expect(()=>f.plane.agent("a".repeat(64),grant.scope,()=>true)).toThrow();owners[0]!.close();const newer=f.plane.agent("a".repeat(64),grant.scope,()=>true);owners[0]!.close();expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(8);await f.plane.close();await expect(newer.request('{}')).rejects.toThrow();expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(0);
});
it("does not register an agent owner if its active callback invalidates the provider during construction",async()=>{
 const f=await fixture(),v=await f.viewer([DESKTOP_INPUT_PROTOCOL]);v.start();await expect.poll(()=>v.frames.length).toBe(1);const grant=v.root.grantAgent({fingerprint:"a".repeat(64),active:()=>true});
 expect(()=>f.plane.agent("a".repeat(64),grant.scope,()=>{f.provider.configure(f.config);return true;})).toThrow();expect((f.plane as unknown as{agentOwners:Map<unknown,unknown>}).agentOwners.size).toBe(0);
});

it("binds native file offers to the trusted outer origin across the private endpoint backplane",async()=>{
 const f=await fixture(),rootPath=join(f.record,".."),path=join(rootPath,"selected.txt"),origin="https://outer.example";await writeFile(path,"endpoint native");f.provider.configure({...f.config,fileRoot:rootPath,command:[...f.config.command,"--pointer-witness-generated"]});
 const runtime=(f.provider as any).nativeSelection;vi.spyOn(runtime,"prepare").mockResolvedValue(undefined);const capture=vi.spyOn(runtime,"capture").mockResolvedValue([path]);vi.spyOn(runtime,"paths").mockImplementation(async(paths:any)=>paths);
 const root=f.plane.root(f.publicMachine,()=>true,origin),v=await f.viewer([DESKTOP_FILES_PROTOCOL,DESKTOP_INPUT_PROTOCOL],root);
 v.send({type:"start",machineId:f.publicMachine,options:{width:320,fps:10,quality:65,files:true}});await expect.poll(()=>v.frames.length).toBeGreaterThan(0);await expect.poll(()=>v.messages.some(m=>m.type==="files_ticket")).toBe(true);
 const messages:any[]=[],child=await root.open([DESKTOP_FILES_PROTOCOL],(bytes,binary)=>{expect(binary).toBe(false);messages.push(JSON.parse(new TextDecoder().decode(bytes)));},()=>{});child.send(JSON.stringify({type:"video_viewer",ticket:v.messages.find(m=>m.type==="files_ticket")!.ticket}));await expect.poll(()=>v.messages.some(m=>m.type==="files_ready")).toBe(true);
 const run=async(request:unknown)=>{const id=randomUUID();child.send(JSON.stringify({type:"desktop_file",id,request}));await expect.poll(()=>messages.some(m=>m.id===id)).toBe(true);return messages.find(m=>m.id===id);};
 expect((await run({action:"grant",enabled:true})).ok).toBe(true);v.send({type:"control",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);v.send({type:"input",seq:1,frameSeq:decodeDesktopFrame(v.frames.at(-1)!).info.seq,input:{kind:"pointer",x:0.5,y:0.5,event:"down",button:0}});await expect.poll(()=>v.messages.some(m=>m.type==="input_ack"&&m.seq===1)).toBe(true);
 const forged=await run({action:"native_prepare",gesture:randomUUID(),origin:"https://forged.example",seq:1});expect(forged.ok).toBe(false);expect(capture).not.toHaveBeenCalled();
 const gesture=randomUUID(),prepared=await run({action:"native_prepare",gesture,origin,seq:1});expect(prepared.ok).toBe(true);const offer=prepared.result.native;expect((await run({action:"native_activate",gesture,lease:offer.lease})).ok).toBe(true);
 const read=await run({action:"native_read",gesture,lease:offer.lease,request:randomUUID(),index:0,offset:0,length:15});expect(read.ok).toBe(true);expect(Buffer.from(read.result.data,"base64").toString()).toBe("endpoint native");root.close();
});
