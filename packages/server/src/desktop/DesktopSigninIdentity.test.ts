import {inspect} from "node:util";
import {beforeAll,afterEach,expect,it,vi} from "vitest";
import {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import type {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import {DesktopSigninIdentity} from "./DesktopSigninIdentity.js";
import type {DesktopSigninCallScope} from "./DesktopSigninDispatch.js";

type Store = Pick<DesktopEndpointStore,"status"|"endpoint"|"close"|"settled">;
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
  const store={status:vi.fn<Store["status"]>(async()=>state()),endpoint:vi.fn<Store["endpoint"]>(async()=>({identity,active:()=>local})),close:vi.fn(()=>{local=false;}),settled:vi.fn(async()=>{})};
  const gate=new DesktopSigninIdentity({enrollment,store,active:()=>{hook?.();return owner;},signal:abort.signal,now:()=>now});gates.push(gate);
  const scope:DesktopSigninCallScope={revision,provider,allowInput,signal:callAbort.signal,active:()=>!callAbort.signal.aborted};
  return {gate,store,scope,state,abort,callAbort,clock:(value:number)=>{now=value;},loseOwner:()=>{owner=false;},local:(value:boolean)=>{local=value;},hook:(value:()=>void)=>{hook=value;}};
}
it("restores only a viewer permit approved by enrollment and local trust",async()=>{
  const f=fixture(),permit=await f.gate.endpoint(peer,f.scope);
  expect(f.store.status).toHaveBeenCalledTimes(2);expect(f.store.endpoint).toHaveBeenCalledExactlyOnceWith(peer,"viewer");
  expect(permit.identity).toBe(identity);expect(permit.allowInput).toBe(false);expect(permit.active()).toBe(true);expect(Object.isFrozen(permit)).toBe(true);
  const message=new TextEncoder().encode("Generated signing check"),signature=await permit.identity.sign(message);
  const key=await crypto.subtle.importKey("raw",Buffer.from(identity.publicKey,"hex"),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  expect(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,Buffer.from(signature,"hex"),message)).toBe(true);
  f.gate.close();expect(permit.active()).toBe(false);expect(f.store.close).toHaveBeenCalledOnce();
});
it.each(["unregistered","bad-fingerprint","revision","provider","input-ceiling","pre-abort","lost-owner"])("refuses %s before touching a key store",async mode=>{
  const f=fixture();let fingerprint=peer;let scope=f.scope;
  if(mode==="unregistered")fingerprint="3".repeat(64);if(mode==="bad-fingerprint")fingerprint="private-invalid";
  if(mode==="revision")scope={...scope,revision:"22222222-2222-4222-8222-222222222222"};if(mode==="provider")scope={...scope,provider:"3".repeat(64)};if(mode==="input-ceiling")scope={...scope,allowInput:true};
  if(mode==="pre-abort")f.callAbort.abort();if(mode==="lost-owner")f.loseOwner();
  await expect(f.gate.endpoint(fingerprint,scope)).rejects.toThrow("Signin endpoint identity is unavailable");expect(f.store.status).not.toHaveBeenCalled();expect(f.store.endpoint).not.toHaveBeenCalled();
});
it.each(["uninitialized","not-required","wrong-pin","untrusted","agent-only"])("requires a live local %s policy match",async mode=>{
  const f=fixture();const state=f.state();if(!state.initialized)throw Error("fixture");
  if(mode==="uninitialized")f.store.status.mockResolvedValue({initialized:false});
  else {if(mode==="not-required")state.required=false;if(mode==="wrong-pin")state.fingerprint="3".repeat(64);if(mode==="untrusted")state.peers=[];if(mode==="agent-only")state.peers[0]!.role="agent";f.store.status.mockResolvedValue(state);}
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");expect(f.store.endpoint).not.toHaveBeenCalled();
});
it("does not reuse another identity even when public status advertises the configured pin",async()=>{
  const f=fixture(),other=await DesktopEndpointIdentity.create(crypto);f.store.endpoint.mockResolvedValue({identity:other,active:()=>true});
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");
});
it.each(["store-revoked","owner","abort","scope","active-throws"])("permanently revokes an issued permit on %s",async mode=>{
  const f=fixture();let active=true;const scope={...f.scope,active:()=>active};const permit=await f.gate.endpoint(peer,scope);
  expect(permit.active()).toBe(true);
  if(mode==="store-revoked")f.local(false);if(mode==="owner")f.loseOwner();if(mode==="abort")f.callAbort.abort();if(mode==="scope")active=false;
  if(mode==="active-throws")scope.active=()=>{throw Error("private");};
  expect(permit.active()).toBe(false);f.local(true);active=true;scope.active=()=>true;expect(permit.active()).toBe(false);
});
it.each(["abort","owner"].flatMap(loss=>["first-status","endpoint","identity","last-status"].map(stage=>({loss,stage}))))("discards a result on $loss loss during $stage",async({loss,stage})=>{
  const f=fixture(),invalidate=()=>{if(loss==="abort")f.callAbort.abort();else f.loseOwner();};
  if(stage==="first-status")f.store.status.mockImplementationOnce(async()=>{invalidate();return f.state();});
  if(stage==="endpoint")f.store.endpoint.mockImplementation(async()=>{invalidate();return {identity,active:()=>true};});
  if(stage==="identity")f.store.endpoint.mockResolvedValue({identity:{fingerprint:async()=>{invalidate();return provider;}} as DesktopEndpointIdentity,active:()=>true});
  if(stage==="last-status")f.store.status.mockResolvedValueOnce(f.state()).mockImplementationOnce(async()=>{invalidate();return f.state();});
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");
});
it("checks both the pending read and the issued permit after reentrant host abort",async()=>{
  const f=fixture();f.store.status.mockImplementationOnce(async()=>{f.hook(()=>f.abort.abort());return f.state();});
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");expect(f.store.endpoint).not.toHaveBeenCalled();
  const g=fixture(),permit=await g.gate.endpoint(peer,g.scope);g.hook(()=>g.abort.abort());expect(permit.active()).toBe(false);expect(g.store.close).toHaveBeenCalledOnce();
});
it("latches synchronous revocation from the local permit callback",async()=>{
  const f=fixture();let revoke=false;
  f.store.endpoint.mockResolvedValue({identity,active:()=>{if(revoke)f.abort.abort();return true;}});
  const permit=await f.gate.endpoint(peer,f.scope);revoke=true;expect(permit.active()).toBe(false);expect(f.store.close).toHaveBeenCalledOnce();
});
it("does not publish after local trust is removed during restoration",async()=>{
  const f=fixture(),last=f.state();if(!last.initialized)throw Error("fixture");last.peers=[];
  f.store.status.mockResolvedValueOnce(f.state()).mockResolvedValueOnce(last);
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");
});
it("checks a monotonic deadline before a late timer callback",async()=>{
  const f=fixture();f.store.status.mockImplementationOnce(async()=>{f.clock(5000);return f.state();});
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");expect(f.store.endpoint).not.toHaveBeenCalled();
});
it.each(["revision","provider","allowInput"])("rejects a caller scope whose %s changes during restoration",async field=>{
  const f=fixture(true);f.store.status.mockImplementationOnce(async()=>{Object.assign(f.scope,{[field]:field==="allowInput"?false:"changed"});return f.state();});
  await expect(f.gate.endpoint(peer,f.scope)).rejects.toThrow("Signin endpoint identity is unavailable");expect(f.store.endpoint).not.toHaveBeenCalled();
});
it("bounds live reads even when callers cancel before the underlying read settles",async()=>{
  const f=fixture(),releases:Array<(state:Awaited<ReturnType<Store["status"]>>)=>void>=[];
  f.store.status.mockImplementation(()=>new Promise(resolve=>releases.push(resolve)));
  const results:Promise<unknown>[]=[];
  for(let i=0;i<8;i++){const abort=new AbortController();results.push(f.gate.endpoint(peer,{...f.scope,signal:abort.signal}).catch(error=>error));abort.abort();}
  const extraAbort=new AbortController(),extra=f.gate.endpoint(peer,{...f.scope,signal:extraAbort.signal}).catch(error=>error);
  try {expect(f.store.status).toHaveBeenCalledTimes(8);}
  finally {extraAbort.abort();for(const release of releases)release(f.state());await Promise.all(results);await extra;}
  expect(await extra).toBeInstanceOf(Error);await flush();
  f.store.status.mockResolvedValue(f.state());expect((await f.gate.endpoint(peer,f.scope)).active()).toBe(true);
});
it("cancels stalled callers on the timer but waits for actual reads before releasing ownership",async()=>{
  vi.useFakeTimers();const f=fixture();let release!:(state:Awaited<ReturnType<Store["status"]>>)=>void;
  f.store.status.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const outcome=f.gate.endpoint(peer,f.scope).catch(error=>error);await vi.advanceTimersByTimeAsync(5000);expect(await outcome).toBeInstanceOf(Error);
  await expect(f.gate.settled()).rejects.toThrow();f.gate.close();let settled=false;const done=f.gate.settled().then(()=>{settled=true;});await flush();expect(settled).toBe(false);
  release(f.state());await done;expect(settled).toBe(true);expect(f.store.settled).toHaveBeenCalledOnce();
});
it("requires explicit input ceilings without granting input by key possession",async()=>{
  const f=fixture(true);expect((await f.gate.endpoint(peer,f.scope)).allowInput).toBe(true);expect((await f.gate.endpoint(peer,{...f.scope,allowInput:false})).allowInput).toBe(false);
});
it("contains storage diagnostics and does not log private error text",async()=>{
  const f=fixture(),log=vi.spyOn(console,"log"),error=vi.spyOn(console,"error"),warn=vi.spyOn(console,"warn");
  f.store.status.mockRejectedValue(new Error("private-key-or-path-diagnostic"));
  const outcome=await f.gate.endpoint(peer,f.scope).catch(error=>error);expect(inspect(outcome)).not.toContain("private-key-or-path-diagnostic");expect(outcome.cause).toBeUndefined();
  expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();
});
