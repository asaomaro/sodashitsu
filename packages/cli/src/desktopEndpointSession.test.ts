import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,rm,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
import {once} from "node:events";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {formatDesktopAgentGrant} from "@sodashitsu/protocol";
import {DesktopEncryptedAgentSession} from "./desktopEndpointSession.js";
import {runDesktop} from "./commands/desktop.js";
import {parseArgs,type Command} from "./cliArgs.js";
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{vi.unstubAllEnvs();vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"soda-agent-no-auth-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));let requests=0;
 const server=createServer((_req,res)=>{requests++;res.writeHead(500);res.end();});server.listen(0,"127.0.0.1");await once(server,"listening");cleanup.push(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const origin=`http://127.0.0.1:${(server.address() as{port:number}).port}`,sessions={get:vi.fn(async()=>undefined),set:vi.fn(async()=>{}),clear:vi.fn(async()=>{})};
 const grant={version:1 as const,machineId:"a".repeat(32),origin,provider:"a".repeat(64),recipient:"b".repeat(64),scope:"s".repeat(43),ticket:"t".repeat(43),expiresAt:Date.now()+30000};
 return{root,origin,sessions,grant,requests:()=>requests,options:{opts:{url:origin,token:"generated",urlExplicit:true},sessions,code:formatDesktopAgentGrant(grant),fingerprint:grant.provider,identityDir:join(root,"identity"),signal:new AbortController().signal}};
}
it("requires an independent provider pin and matching Root origin before auth or key initialization",async()=>{
 const f=await fixture();for(const fingerprint of [undefined,"c".repeat(64)])await expect(DesktopEncryptedAgentSession.open({...f.options,fingerprint})).rejects.toThrow("independent provider fingerprint");
 await expect(DesktopEncryptedAgentSession.open({...f.options,opts:{...f.options.opts,url:"http://127.0.0.1:9"}})).rejects.toThrow("origin");expect(f.sessions.get).not.toHaveBeenCalled();expect(f.requests()).toBe(0);expect(await readdir(f.root)).toEqual([]);
});
it.skipIf(process.platform==="win32")("never initializes a missing key and checks recipient before authentication",async()=>{
 const f=await fixture();await expect(DesktopEncryptedAgentSession.open(f.options)).rejects.toThrow("Initialize");expect(await readdir(f.root)).toEqual([]);
 const store=new DesktopEndpointStore({stateDir:f.options.identityDir});await store.prepareDirectory();await store.initialize();store.close();await store.settled();await expect(DesktopEncryptedAgentSession.open(f.options)).rejects.toThrow("recipient");expect(f.sessions.get).not.toHaveBeenCalled();expect(f.requests()).toBe(0);
});
it("rejects every reserved encrypted code version without entering plaintext Root RPC",async()=>{
 const f=await fixture(),command=parseArgs(["desktop","session","--url",f.origin,"--token","generated"],{}) as Extract<Command,{kind:"desktop"}>;
 for(const code of ["soda-e2e-agent-"+"x".repeat(43-"soda-e2e-agent-".length),"soda-e2e-agent-v99.invalid","soda-e2e-agent-v1.invalid"]){vi.stubEnv("SODA_DESKTOP_GRANT",code);await expect(runDesktop(command,f.sessions)).rejects.toThrow("Invalid encrypted");}
 expect(f.sessions.get).not.toHaveBeenCalled();expect(f.requests()).toBe(0);
});
it.skipIf(process.platform==="win32")("relogs an expired cookie only before authentication and rejects malformed results without orphaning a pending request",async()=>{
 const {WebSocketServer}=await import("ws"),{DesktopEndpointIdentity}=await import("@sodashitsu/client-core/desktop/DesktopE2e"),{DesktopEndpointWire}=await import("@sodashitsu/client-core/desktop/DesktopEndpointWire");
 const f=await fixture(),store=new DesktopEndpointStore({stateDir:f.options.identityDir});await store.prepareDirectory();const local=await store.initialize();store.close();await store.settled();const provider=await DesktopEndpointIdentity.create(crypto),pin=await provider.fingerprint();
 let logins=0;const upgrades:string[]=[],paths:string[]=[],wires:InstanceType<typeof DesktopEndpointWire>[]=[];
 const server=createServer((req,res)=>{paths.push(req.url??"");if(req.url==="/api/login"){logins++;res.writeHead(204,{"set-cookie":"soda_session=fresh-generated; HttpOnly"});res.end();}else{res.writeHead(404);res.end();}}),wss=new WebSocketServer({noServer:true});
 server.on("upgrade",(req,socket,head)=>{upgrades.push(req.headers.cookie??"");if(req.headers.cookie!=="soda_session=fresh-generated"){socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));});
 wss.on("connection",socket=>{let wire:InstanceType<typeof DesktopEndpointWire>|undefined;socket.on("error",()=>{});socket.on("message",(raw,binary)=>{if(!wire){const metadata=JSON.parse(raw.toString());wire=new DesktopEndpointWire({crypto,identity:provider,session:metadata.session,role:"provider",peerRole:"agent",expectedFingerprint:local.fingerprint,active:()=>true,sendRaw:value=>socket.send(value),onReady:()=>{},onRecord:(lane,record)=>{
    expect(lane).toBe("agent");expect(record[0]).toBe(1);const request=JSON.parse(new TextDecoder().decode(record.subarray(1))),result=request.method==="desktop.agent.attach"?{leaseId:"l".repeat(43),expiresAt:Date.now()+30000.25}:{malformed:"not an observation"};const payload=new TextEncoder().encode(JSON.stringify({id:request.id,result})),out=new Uint8Array(payload.length+1);out[0]=1;out.set(payload,1);void wire!.send("agent",out).catch(()=>socket.terminate());
   },onClose:()=>socket.terminate()});wires.push(wire);void wire.start().then(()=>wire!.receive(JSON.stringify({type:"hello",hello:metadata.hello}))).catch(()=>socket.terminate());}else void wire.receive(binary?new Uint8Array(raw as Buffer):raw.toString()).catch(()=>socket.terminate());});socket.on("close",()=>wire?.close());});
 server.listen(0,"127.0.0.1");await once(server,"listening");cleanup.push(async()=>{for(const wire of wires)wire.close();for(const socket of wss.clients)socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const origin=`http://127.0.0.1:${(server.address() as{port:number}).port}`,sessions={get:vi.fn(async()=>"soda_session=expired-generated"),set:vi.fn(async()=>{}),clear:vi.fn(async()=>{})};
 const session=await DesktopEncryptedAgentSession.open({...f.options,opts:{url:origin,token:"generated",urlExplicit:true},sessions,code:formatDesktopAgentGrant({...f.grant,origin,provider:pin,recipient:local.fingerprint}),fingerprint:pin});
 try{expect(logins).toBe(1);expect(sessions.clear).toHaveBeenCalledOnce();expect(sessions.set).toHaveBeenCalledOnce();await expect(session.observe()).rejects.toThrow();expect(session.abort.signal.aborted).toBe(true);expect(upgrades).toEqual(["soda_session=expired-generated","soda_session=fresh-generated"]);expect(paths).toEqual(["/api/login"]);}
 finally{session.close();}
},15000);
it.skipIf(process.platform==="win32")("SIGTERM during the encrypted handshake closes the socket before any grant or action is sent",async()=>{
 const {spawn}=await import("node:child_process"),{fileURLToPath}=await import("node:url"),{WebSocketServer}=await import("ws");const f=await fixture(),store=new DesktopEndpointStore({stateDir:f.options.identityDir});await store.prepareDirectory();const local=await store.initialize();store.close();await store.settled();let metadata=false,closed=false;const packets:string[]=[],paths:string[]=[];
 const server=createServer((req,res)=>{paths.push(req.url??"");res.writeHead(204,{"set-cookie":"soda_session=generated; HttpOnly"});res.end();}),wss=new WebSocketServer({server});wss.on("connection",socket=>{socket.on("message",raw=>{packets.push(raw.toString());const value=JSON.parse(raw.toString());metadata=value.type==="viewer"&&value.hello?.role==="agent";});socket.on("close",()=>{closed=true;});});server.listen(0,"127.0.0.1");await once(server,"listening");cleanup.push(async()=>{for(const socket of wss.clients)socket.terminate();await new Promise<void>(resolve=>wss.close(()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const origin=`http://127.0.0.1:${(server.address() as{port:number}).port}`,code=formatDesktopAgentGrant({...f.grant,origin,recipient:local.fingerprint}),child=spawn(process.execPath,[fileURLToPath(new URL("../dist/main.js",import.meta.url)),"desktop","session","--url",origin,"--endpoint-fingerprint",f.grant.provider,"--identity-dir",f.options.identityDir],{env:{...process.env,HOME:f.root,USERPROFILE:f.root,SODACTL_TOKEN:"generated",SODA_DESKTOP_GRANT:code},stdio:["pipe","pipe","pipe"]});let stdout="";child.stdout.on("data",data=>stdout+=data);child.stderr.resume();const exited=once(child,"close");
 try{await vi.waitFor(()=>expect(metadata).toBe(true),{timeout:5000});child.kill("SIGTERM");await vi.waitFor(()=>expect(closed).toBe(true),{timeout:3000});await exited;expect(stdout).not.toContain('"ready":true');expect(packets.some(packet=>packet.includes(f.grant.ticket)||packet.includes("desktop.agent."))).toBe(false);expect(paths).toEqual(["/api/login"]);}
 finally{child.kill();}
},15000);

it("rejects encrypted-only options on a legacy grant before Root access",async()=>{
 const f=await fixture(),command=parseArgs(["desktop","session","--url",f.origin,"--endpoint-fingerprint",f.grant.provider],{}) as Extract<Command,{kind:"desktop"}>;vi.stubEnv("SODA_DESKTOP_GRANT","t".repeat(43));await expect(runDesktop(command,f.sessions)).rejects.toThrow("require an encrypted grant");expect(f.sessions.get).not.toHaveBeenCalled();expect(f.requests()).toBe(0);
});
