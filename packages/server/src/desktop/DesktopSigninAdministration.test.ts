import {readFileSync} from "node:fs";
import {afterEach,expect,it,vi} from "vitest";
import {DesktopSigninAdminRequest,type DesktopSigninAdminOperation} from "./DesktopSigninAdminRequest.js";
import {desktopSigninAdministration,type DesktopSigninAdminBackend,type DesktopSigninAdministrationDependencies} from "./DesktopSigninAdministration.js";
const ownerSid='S-1-5-21-1-2-3-1001',nonce='11111111-1111-4111-8111-111111111111',fp='a'.repeat(64),peer={fingerprint:'b'.repeat(64),label:'Generated viewer',role:'viewer' as const};
const enrolled={kind:'enroll' as const,origin:'https://root.example',machineId:'c'.repeat(32),token:'t'.repeat(43),allowInput:false,peers:[{fingerprint:peer.fingerprint,label:peer.label}]};
afterEach(()=>vi.useRealTimers());
function fixture(operation:DesktopSigninAdminOperation={kind:'status'},duration=1000){let wall=10000,active=true;const abort=new AbortController(),request=DesktopSigninAdminRequest.decode(Buffer.from(JSON.stringify({version:1,purpose:'desktop-signin-admin',ownerSid,nonce,issuedAt:10000,expiresAt:10000+duration,operation})),{ownerSid,nonce},{wall:()=>wall,monotonic:()=>wall-10000});
 const status=vi.fn(async():Promise<unknown>=>({initialized:true,required:true,fingerprint:fp,peers:[peer]}));const backend={status,initialize:vi.fn(async()=>{}),requireEncryption:vi.fn(async()=>{}),trust:vi.fn(async()=>{}),revoke:vi.fn(async()=>{}),enrollment:vi.fn<DesktopSigninAdminBackend["enrollment"]>(async()=>{}),disable:vi.fn(async()=>{}),close:vi.fn(),settled:vi.fn(async()=>{})} satisfies DesktopSigninAdminBackend;
 const results:unknown[]=[],deps:DesktopSigninAdministrationDependencies={backend:vi.fn(()=>backend),result:vi.fn<DesktopSigninAdministrationDependencies["result"]>(async bytes=>{results.push(JSON.parse(Buffer.from(bytes).toString()));}),uuid:()=> '22222222-2222-4222-8222-222222222222',unsafeStop:vi.fn()};
 const run=()=>desktopSigninAdministration({request,cipherSha256:'d'.repeat(64)},{active:()=>active,signal:abort.signal},deps);return {request,abort,backend,deps,results,run,lose:()=>{active=false;},expire:()=>{wall=10000+duration;}};
}
it("reports sanitized status without initializing keys",async()=>{const f=fixture();await f.run();expect(f.results).toHaveLength(1);expect(f.results[0]).toMatchObject({outcome:'success',nonce,cipherSha256:'d'.repeat(64),status:{fingerprint:fp}});expect(f.backend.initialize).not.toHaveBeenCalled();expect(f.backend.close).toHaveBeenCalledOnce();expect(f.request.current(()=>true)).toBe(false);});
it.each(['initialize','trust','revoke','disable'] as const)("dispatches only fixed local %s operation",async kind=>{const operation=kind==='trust'?{kind,peer:{fingerprint:peer.fingerprint,label:peer.label}}:kind==='revoke'?{kind,fingerprint:peer.fingerprint}:{kind};const f=fixture(operation);await f.run();expect(f.results[0]).toMatchObject({outcome:'success'});if(kind==='initialize'){expect(f.backend.initialize).toHaveBeenCalledOnce();expect(f.backend.requireEncryption).toHaveBeenCalledOnce();}else expect(f.backend[kind]).toHaveBeenCalledOnce();});
it("binds enrollment to actual SYSTEM provider, new revision and trusted viewers",async()=>{const f=fixture(enrolled);let captured:unknown;f.backend.enrollment.mockImplementation(async(bytes,permit)=>{expect(permit.active()).toBe(true);captured=JSON.parse(Buffer.from(bytes).toString());});await f.run();expect(captured).toMatchObject({ownerSid,provider:fp,revision:'22222222-2222-4222-8222-222222222222',token:enrolled.token,allowSignin:true});expect(JSON.stringify(f.results)).not.toContain(enrolled.token);});
it("refuses an enrollment peer before writing when not in actual trust",async()=>{const f=fixture(enrolled);f.backend.status.mockResolvedValue({initialized:true,required:true,fingerprint:fp,peers:[]});await f.run();expect(f.backend.enrollment).not.toHaveBeenCalled();expect(f.results[0]).toMatchObject({outcome:'incomplete'});});
it("does not add a ninth viewer",async()=>{const f=fixture({kind:'trust',peer:{fingerprint:peer.fingerprint,label:peer.label}});f.backend.status.mockResolvedValue({initialized:true,required:true,fingerprint:fp,peers:Array.from({length:8},(_,i)=>({...peer,fingerprint:i.toString(16).repeat(64)}))});await f.run();expect(f.backend.trust).not.toHaveBeenCalled();expect(f.results[0]).toMatchObject({outcome:'incomplete'});});
it("allows explicit disable even without an initialized key",async()=>{const f=fixture({kind:'disable'});f.backend.status.mockResolvedValue({initialized:false});await f.run();expect(f.backend.disable).toHaveBeenCalledOnce();expect(f.results[0]).toMatchObject({outcome:'success',status:{initialized:false}});});
it("does not claim rollback after an initialization step fails",async()=>{const f=fixture({kind:'initialize'});f.backend.requireEncryption.mockRejectedValue(Error('generated sensitive error'));await f.run();expect(f.backend.initialize).toHaveBeenCalledOnce();expect(f.results[0]).toEqual(expect.objectContaining({outcome:'incomplete'}));expect(JSON.stringify(f.results)).not.toContain('sensitive');expect(f.backend.initialize).toHaveBeenCalledOnce();});
it.each(['owner','abort','expiry'])("cannot publish success or continue after %s during an await",async mode=>{const f=fixture({kind:'initialize'});f.backend.initialize.mockImplementation(async()=>{if(mode==='owner')f.lose();else if(mode==='abort')f.abort.abort();else f.expire();});await expect(f.run()).rejects.toThrow();expect(f.backend.requireEncryption).not.toHaveBeenCalled();expect(f.results).toEqual([]);expect(f.backend.close).toHaveBeenCalledOnce();});
it("reaps a backend constructed during synchronous cancellation",async()=>{const f=fixture();f.deps.backend=()=>{f.abort.abort();return f.backend;};await expect(f.run()).rejects.toThrow();expect(f.backend.status).not.toHaveBeenCalled();expect(f.backend.close).toHaveBeenCalledOnce();});
it("treats failed close as unsafe teardown",async()=>{const f=fixture();f.backend.close.mockImplementation(()=>{throw Error('generated');});await expect(f.run()).rejects.toThrow();expect(f.deps.unsafeStop).toHaveBeenCalledOnce();});
it("bounds a hung operation and refuses to forget its pending completion",async()=>{vi.useFakeTimers();const f=fixture();let release!:()=>void;f.backend.status.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({initialized:false});}));const work=f.run(),result=expect(work).rejects.toThrow();await vi.advanceTimersByTimeAsync(30000);expect(f.results).toEqual([]);release();await result;expect(f.backend.close).toHaveBeenCalledOnce();expect(f.deps.unsafeStop).not.toHaveBeenCalled();});
it("uses unsafe stop when pending work never settles after cancellation",async()=>{vi.useFakeTimers();const f=fixture();f.backend.status.mockImplementation(()=>new Promise(()=>{}));const work=f.run(),result=expect(work).rejects.toThrow();await vi.advanceTimersByTimeAsync(38000);await result;expect(f.deps.unsafeStop).toHaveBeenCalledOnce();});

it("never retries an uncertain result write",async()=>{const f=fixture();f.deps.result=vi.fn(async()=>{throw Error('write outcome unknown');});await expect(f.run()).rejects.toThrow();expect(f.deps.result).toHaveBeenCalledOnce();expect(f.backend.close).toHaveBeenCalledOnce();});

it("retains explicit CA in claim-bound enrollment without publishing it",async()=>{const caPem=readFileSync(new URL("../../../tui/src/testing/tls/cert.pem",import.meta.url),"utf8"),f=fixture({...enrolled,caPem});let written:unknown;f.backend.enrollment.mockImplementation(async bytes=>{written=JSON.parse(Buffer.from(bytes).toString());});await f.run();expect(written).toMatchObject({caPem});expect(JSON.stringify(f.results)).not.toContain("BEGIN CERTIFICATE");});

it("finishes a committed Windows initialization whose checks take more than five seconds",async()=>{
 vi.useFakeTimers();const f=fixture({kind:'initialize'},120000);let committed=false;
 f.backend.initialize.mockImplementation(async()=>{committed=true;await new Promise(resolve=>setTimeout(resolve,6000));});
 const result=f.run().then(()=>({ok:true}),()=>({ok:false}));
 await vi.advanceTimersByTimeAsync(6000);expect(await result).toEqual({ok:true});
 expect(committed).toBe(true);expect(f.backend.initialize).toHaveBeenCalledOnce();
 expect(f.backend.requireEncryption).toHaveBeenCalledOnce();expect(f.results).toMatchObject([{outcome:'success'}]);
});

it("expires the request during a slow committed operation without continuing",async()=>{
 vi.useFakeTimers();const f=fixture({kind:'initialize'},120000);let release!:()=>void;
 f.backend.initialize.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
 const result=f.run().then(()=>({ok:true}),()=>({ok:false}));await vi.advanceTimersByTimeAsync(6000);f.expire();
 await vi.advanceTimersByTimeAsync(100);release();expect(await result).toEqual({ok:false});
 expect(f.backend.requireEncryption).not.toHaveBeenCalled();expect(f.results).toEqual([]);
});
it("bounds the entire multi-step administration without refreshing its request",async()=>{
 vi.useFakeTimers();const f=fixture({kind:'initialize'},120000);
 const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,21000));
 f.backend.initialize.mockImplementation(delay);f.backend.requireEncryption.mockImplementation(delay);
 f.backend.status.mockImplementation(async()=>{await delay();return {initialized:false};});
 const result=f.run().then(()=>({ok:true}),()=>({ok:false}));
 await vi.advanceTimersByTimeAsync(63000);expect(await result).toEqual({ok:false});expect(f.results).toEqual([]);
 expect(f.backend.close).toHaveBeenCalledOnce();expect(f.deps.unsafeStop).not.toHaveBeenCalled();
});
it("does not continue when a committed initialization settles after its step timeout",async()=>{
 vi.useFakeTimers();const f=fixture({kind:'initialize'},120000);
 f.backend.initialize.mockImplementation(()=>new Promise<void>(resolve=>setTimeout(resolve,31000)));
 const result=f.run().then(()=>({ok:true}),()=>({ok:false}));
 await vi.advanceTimersByTimeAsync(31000);expect(await result).toEqual({ok:false});
 expect(f.backend.initialize).toHaveBeenCalledOnce();expect(f.backend.requireEncryption).not.toHaveBeenCalled();
 expect(f.results).toEqual([]);expect(f.deps.unsafeStop).not.toHaveBeenCalled();
});

it.each(['step','overall'])("rejects %s clock expiry before a delayed timer is delivered",async mode=>{
 const f=fixture({kind:'initialize'},120000);let tick=0;f.deps.now=()=>tick;
 f.backend.initialize.mockImplementation(async()=>{tick=mode==='step'?30000:25000;});
 if(mode==='overall')f.backend.requireEncryption.mockImplementation(async()=>{tick=50000;});
 if(mode==='overall')f.backend.status.mockImplementation(async()=>{tick=60000;return {initialized:false};});
 await expect(f.run()).rejects.toThrow();expect(f.results).toEqual([]);
 if(mode==='step')expect(f.backend.requireEncryption).not.toHaveBeenCalled();
 expect(f.backend.close).toHaveBeenCalledOnce();
});
