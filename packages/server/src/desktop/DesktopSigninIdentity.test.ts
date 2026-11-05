import {inspect} from "node:util";
import {beforeAll,afterEach,expect,it,vi} from "vitest";
import {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import type {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import {DesktopSigninIdentity} from "./DesktopSigninIdentity.js";
import type {DesktopSigninCallScope} from "./DesktopSigninDispatch.js";

type Store = Pick<DesktopEndpointStore,"status"|"verifiedEndpoint"|"close"|"settled">;
const revision="11111111-1111-4111-8111-111111111111",peer="1".repeat(64),ownerSid="S-1-5-21-1-2-3-1001";
let identity:DesktopEndpointIdentity,provider:string;
beforeAll(async()=>{identity=await DesktopEndpointIdentity.create(crypto);provider=await identity.fingerprint();});
const gates:DesktopSigninIdentity[]=[];
afterEach(()=>{for(const gate of gates)gate.close();gates.length=0;vi.restoreAllMocks();vi.useRealTimers();});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(allowInput=false) {
  let owner=true,local=true,now=0,hook:(()=>void)|undefined;
  const abort=new AbortController(),callAbort=new AbortController();
  const enrollment=DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision,ownerSid,origin:"https://root.invalid",machineId:"a".repeat(32),token:"t".repeat(43),provider,allowSignin:true,allowInput,peers:[{fingerprint:peer,label:"Generated viewer"}]})),ownerSid);
  const state=():Awaited<ReturnType<Store["status"]>>=>({initialized:true,required:true,fingerprint:provider,peers:[{fingerprint:peer,role:"viewer",label:"Local trust"}]});
  const snapshot=()=>({identity,active:()=>local,status:state() as Extract<Awaited<ReturnType<Store["status"]>>,{initialized:true}>});
  const store={status:vi.fn<Store["status"]>(async()=>state()),verifiedEndpoint:vi.fn<Store["verifiedEndpoint"]>(async()=>snapshot()),close:vi.fn(()=>{local=false;}),settled:vi.fn(async()=>{})};
  const gate=new DesktopSigninIdentity({enrollment,store,active:()=>{hook?.();return owner;},signal:abort.signal,now:()=>now});gates.push(gate);
  const scope:DesktopSigninCallScope={revision,provider,allowInput,signal:callAbort.signal,active:()=>!callAbort.signal.aborted};
  return {gate,store,scope,state,snapshot,abort,callAbort,clock:(value:number)=>{now=value;},loseOwner:()=>{owner=false;},local:(value:boolean)=>{local=value;},hook:(value:()=>void)=>{hook=value;}};
}
it("restores a single verified viewer snapshot approved by enrollment and local trust",async()=>{
 const f=fixture(),permit=await f.gate.endpoint(peer,f.scope);expect(f.store.verifiedEndpoint).toHaveBeenCalledExactlyOnceWith(peer,"viewer");expect(f.store.status).not.toHaveBeenCalled();expect(permit.identity).toBe(identity);expect(permit.allowInput).toBe(false);expect(permit.active()).toBe(true);expect(Object.isFrozen(permit)).toBe(true);
 const message=new TextEncoder().encode("Generated signing check"),signature=await permit.identity.sign(message),key=await crypto.subtle.importKey("raw",Buffer.from(identity.publicKey,"hex"),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);expect(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,Buffer.from(signature,"hex"),message)).toBe(true);f.gate.close();expect(permit.active()).toBe(false);expect(f.store.close).toHaveBeenCalledOnce();
});
it.each(["unregistered","bad-fingerprint","revision","provider","input-ceiling","pre-abort","lost-owner"])("refuses %s before touching a key store",async mode=>{
 const f=fixture();let fingerprint=peer;let scope=f.scope;if(mode==="unregistered")fingerprint="3".repeat(64);if(mode==="bad-fingerprint")fingerprint="invalid";if(mode==="revision")scope={...scope,revision:"22222222-2222-4222-8222-222222222222"};if(mode==="provider")scope={...scope,provider:"3".repeat(64)};if(mode==="input-ceiling")scope={...scope,allowInput:true};if(mode==="pre-abort")f.callAbort.abort();if(mode==="lost-owner")f.loseOwner();await expect(f.gate.endpoint(fingerprint,scope)).rejects.toThrow();expect(f.store.verifiedEndpoint).not.toHaveBeenCalled();
});
it.each(["uninitialized","not-required","wrong-pin","untrusted","agent-only"])("requires verified snapshot policy: %s",async mode=>{
 const f=fixture(),snapshot=f.snapshot();if(mode==="uninitialized")snapshot.status={initialized:false} as never;if(mode==="not-required")snapshot.status.required=false;if(mode==="wrong-pin")snapshot.status.fingerprint="3".repeat(64);if(mode==="untrusted")snapshot.status.peers=[];if(mode==="agent-only")snapshot.status.peers[0]!.role="agent";f.store.verifiedEndpoint.mockResolvedValue(snapshot);await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();
});
it("rejects another identity despite an advertised configured fingerprint",async()=>{const f=fixture(),other=await DesktopEndpointIdentity.create(crypto);f.store.verifiedEndpoint.mockResolvedValue({...f.snapshot(),identity:other});await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();});
it.each(["store-revoked","owner","abort","scope","active-throws"])("permanently revokes an issued permit on %s",async mode=>{
 const f=fixture();let live=true;const scope={...f.scope,active:()=>live},permit=await f.gate.endpoint(peer,scope);if(mode==="store-revoked")f.local(false);if(mode==="owner")f.loseOwner();if(mode==="abort")f.callAbort.abort();if(mode==="scope")live=false;if(mode==="active-throws")scope.active=()=>{throw Error("private");};expect(permit.active()).toBe(false);f.local(true);live=true;scope.active=()=>true;expect(permit.active()).toBe(false);
});
it.each(["abort","owner"].flatMap(loss=>["snapshot","identity"].map(stage=>({loss,stage}))))("discards a result on $loss loss during $stage",async({loss,stage})=>{
 const f=fixture(),invalidate=()=>loss==="abort"?f.callAbort.abort():f.loseOwner();if(stage==="snapshot")f.store.verifiedEndpoint.mockImplementationOnce(async()=>{invalidate();return f.snapshot();});else f.store.verifiedEndpoint.mockResolvedValue({...f.snapshot(),identity:{fingerprint:async()=>{invalidate();return provider;}} as DesktopEndpointIdentity});await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();
});
it("latches reentrant host and local-permit revocation",async()=>{
 const f=fixture();f.store.verifiedEndpoint.mockImplementationOnce(async()=>{f.hook(()=>f.abort.abort());return f.snapshot();});await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();
 const g=fixture();let revoke=false;g.store.verifiedEndpoint.mockResolvedValue({...g.snapshot(),active:()=>{if(revoke)g.abort.abort();return true;}});const permit=await g.gate.endpoint(peer,g.scope);revoke=true;expect(permit.active()).toBe(false);expect(g.store.close).toHaveBeenCalledOnce();
});
it("keeps the original five second restoration deadline",async()=>{const f=fixture();f.store.verifiedEndpoint.mockImplementationOnce(async()=>{f.clock(5000);return f.snapshot();});await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();});
it.each(["revision","provider","allowInput"])("rejects changing scope %s during snapshot restoration",async field=>{const f=fixture(true);f.store.verifiedEndpoint.mockImplementationOnce(async()=>{Object.assign(f.scope,{[field]:field==="allowInput"?false:"changed"});return f.snapshot();});await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow();});
it("bounds canceled in-flight snapshot reads and waits for them before ownership release",async()=>{
 const f=fixture(),releases:Array<(value:ReturnType<typeof f.snapshot>)=>void>=[];f.store.verifiedEndpoint.mockImplementation(()=>new Promise(resolve=>releases.push(resolve)));const outcomes:Promise<unknown>[]=[];
 for(let i=0;i<8;i++){const abort=new AbortController();outcomes.push(f.gate.endpoint(peer,{...f.scope,signal:abort.signal}).catch(e=>e));abort.abort();}
 const extra=f.gate.endpoint(peer,f.scope).catch(e=>e);expect(f.store.verifiedEndpoint).toHaveBeenCalledTimes(8);f.gate.close();let settled=false;const done=f.gate.settled().then(()=>{settled=true;});await flush();expect(settled).toBe(false);for(const release of releases)release(f.snapshot());await Promise.all(outcomes);expect(await extra).toBeInstanceOf(Error);await done;expect(settled).toBe(true);
});
it("times out a stalled snapshot while retaining ownership until it settles",async()=>{
 vi.useFakeTimers();const f=fixture();let release!:(value:ReturnType<typeof f.snapshot>)=>void;f.store.verifiedEndpoint.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));const outcome=f.gate.endpoint(peer,f.scope).catch(e=>e);await vi.advanceTimersByTimeAsync(5000);expect(await outcome).toBeInstanceOf(Error);await expect(f.gate.settled()).rejects.toThrow();f.gate.close();let settled=false;const done=f.gate.settled().then(()=>{settled=true;});await flush();expect(settled).toBe(false);release(f.snapshot());await done;expect(settled).toBe(true);
});
it("preserves explicit input ceilings",async()=>{const f=fixture(true);expect((await f.gate.endpoint(peer,f.scope)).allowInput).toBe(true);expect((await f.gate.endpoint(peer,{...f.scope,allowInput:false})).allowInput).toBe(false);});
it("contains private storage errors",async()=>{const f=fixture(),log=vi.spyOn(console,"log"),error=vi.spyOn(console,"error");f.store.verifiedEndpoint.mockRejectedValue(Error("private-key-or-path"));const result=await f.gate.endpoint(peer,f.scope).catch(e=>e);expect(inspect(result)).not.toContain("private-key-or-path");expect(result.cause).toBeUndefined();expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();});
it("finishes a bounded verified snapshot without redundant status restorations",async()=>{
 vi.useFakeTimers();const f=fixture(),delay=async<T>(value:T,ms:number)=>{await new Promise(resolve=>setTimeout(resolve,ms));return value;};
 f.store.status.mockImplementation(()=>delay(f.state(),2000));const snapshot={...f.snapshot(),identity:{fingerprint:async()=>provider} as DesktopEndpointIdentity};const legacy=vi.fn(()=>delay({identity:snapshot.identity,active:()=>true},2800));Object.assign(f.store,{endpoint:legacy});
 f.store.verifiedEndpoint.mockImplementationOnce(()=>delay(snapshot,3400));const outcome=f.gate.endpoint(peer,f.scope).catch(e=>e);
 try{for(let i=0;i<10;i++){await vi.advanceTimersByTimeAsync(500);await flush();}const result=await outcome;if(result instanceof Error)console.log({legacyStatusCalls:f.store.status.mock.calls.length,legacyEndpointCalls:legacy.mock.calls.length,elapsed:5000,deadlineRejected:true});expect(result).not.toBeInstanceOf(Error);expect(result.active()).toBe(true);expect(f.store.status).not.toHaveBeenCalled();}
 finally{f.gate.close();await vi.advanceTimersByTimeAsync(2000);await f.gate.settled();}
});
