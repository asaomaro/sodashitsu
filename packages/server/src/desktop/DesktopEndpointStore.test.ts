import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,readdir,readFile,writeFile,rm,chmod,symlink,rename} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {DesktopEndpointStore} from "./DesktopEndpointStore.js";
import {desktopSecretProtector,type DesktopSecretProtector} from "./DesktopEndpointProtector.js";
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function fixture(options:Partial<ConstructorParameters<typeof DesktopEndpointStore>[0]>={}){const dir=await mkdtemp(join(tmpdir(),"soda-endpoint-store-"));dirs.push(dir);const base={stateDir:dir,...(process.platform==="win32"?{platform:"win32" as const,protector:{...desktopSecretProtector("linux"),mode:"dpapi-user" as const},checkWindowsPath:async()=>{},commitWindowsVault:rename}:{}),...options};if(process.platform==="win32"&&base.protector?.mode==="owner-file")base.protector={...base.protector,mode:"dpapi-user"};const store=new DesktopEndpointStore(base);return {dir,store,reopen:()=>new DesktopEndpointStore(base),file:join(store.directory,"identity.json")};}
const peer={fingerprint:"a1".repeat(32),role:"viewer" as const,label:"Generated browser"};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
it("is read-only before explicit initialization and preserves one identity across restart",async()=>{
 const f=await fixture();expect(await f.store.status()).toEqual({initialized:false});expect(await readdir(f.dir)).toEqual([]);const first=await f.store.initialize();expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(await f.store.initialize()).toEqual(first);await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow("not trusted");await f.store.trust(peer);const again=f.reopen();expect(await again.status()).toMatchObject({initialized:true,...first,peers:[peer]});expect(await (await again.endpoint(peer.fingerprint,"viewer")).identity.fingerprint()).toBe(first.fingerprint);await expect(again.endpoint(peer.fingerprint,"agent")).rejects.toThrow("not trusted");
});
it("serializes changes, binds trust to roles, and durably revokes only the selected peer",async()=>{
 const revoke=vi.fn(),f=await fixture({revoke});await f.store.initialize();await Promise.all([f.store.trust(peer),f.store.trust({...peer,role:"agent",label:"Generated CLI"})]);expect((await f.store.status() as any).peers).toHaveLength(2);await f.store.revoke(peer.fingerprint,"viewer");expect(revoke).toHaveBeenCalledWith(expect.objectContaining({fingerprint:peer.fingerprint,role:"viewer"}));await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();expect(await f.store.endpoint(peer.fingerprint,"agent")).toBeDefined();const restarted=f.reopen();await expect(restarted.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();await restarted.trust(peer);expect(await restarted.endpoint(peer.fingerprint,"viewer")).toBeDefined();
});
it("never replaces a corrupt identity or a key/public mismatch with a newly trusted key",async()=>{
 const f=await fixture();await f.store.initialize();const saved=await readFile(f.file,"utf8");await writeFile(f.file,"corrupt");await expect(f.store.initialize()).rejects.toThrow("unavailable");expect(await readFile(f.file,"utf8")).toBe("corrupt");const envelope=JSON.parse(saved),vault=JSON.parse(Buffer.from(envelope.data,"base64").toString());vault.publicKey="04"+"00".repeat(64);envelope.data=Buffer.from(JSON.stringify(vault)).toString("base64");await writeFile(f.file,JSON.stringify(envelope));await expect(f.store.status()).rejects.toThrow("unavailable");
});
it.skipIf(process.platform==="win32")("rejects symlink and group-readable private storage without changing the target",async()=>{
 const f=await fixture();await f.store.initialize();const saved=await readFile(f.file);await chmod(f.file,0o644);await expect(f.store.status()).rejects.toThrow("unavailable");await chmod(f.file,0o600);await chmod(f.store.directory,0o755);await expect(f.store.status()).rejects.toThrow("unavailable");await chmod(f.store.directory,0o700);const target=join(f.dir,"outside");await writeFile(target,saved,{mode:0o600});await rm(f.file);await symlink(target,f.file);await expect(f.store.status()).rejects.toThrow("unavailable");expect(await readFile(target)).toEqual(saved);
});
it.skipIf(!process.getuid)("rejects a different owner without attempting to repair file ownership",async()=>{
 const f=await fixture();await f.store.initialize();const owner=vi.spyOn(process,"getuid").mockReturnValue(process.getuid!()+1);try{await expect(f.store.status()).rejects.toThrow("unavailable");}finally{owner.mockRestore();}
});
it("does not steal an existing writer lock or create a second identity from another instance",async()=>{
 const started=deferred(),release=deferred(),plain=desktopSecretProtector("linux"),protector:DesktopSecretProtector={...plain,protect:async value=>{started.resolve();await release.promise;return value.slice();}},f=await fixture({protector});const first=f.store.initialize();await started.promise;
 try{const other=f.reopen();await expect(other.initialize()).rejects.toThrow("busy");}finally{release.resolve();}const identity=await first;expect(await f.reopen().initialize()).toEqual(identity);expect(await readdir(f.store.directory)).toEqual(["identity.json"]);
});
it("keeps revocation effective even if an earlier trust write is completing",async()=>{
 const plain=desktopSecretProtector("linux"),begun=[deferred(),deferred()],release=[deferred(),deferred()];let armed=false,calls=0;const protector:DesktopSecretProtector={...plain,protect:async value=>{if(armed){const index=calls++;begun[index]!.resolve();await release[index]!.promise;}return value.slice();}},f=await fixture({protector});await f.store.initialize();await f.store.trust(peer);armed=true;
 const older=f.store.trust({...peer,label:"older write"});await begun[0]!.promise;const revoked=f.store.revoke(peer.fingerprint,"viewer");
 try{await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();release[0]!.resolve();await older;await begun[1]!.promise;await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();}finally{release[0]!.resolve();release[1]!.resolve();await Promise.allSettled([older,revoked]);}
});
it("fails closed for live revocation when persistence fails and refuses new trust on failed writes",async()=>{
 const plain=desktopSecretProtector("linux");let fail=false;const protector:DesktopSecretProtector={...plain,protect:async value=>{if(fail)throw Error("generated write failure");return value.slice();}},revoke=vi.fn(),f=await fixture({protector,revoke});await f.store.initialize();await f.store.trust(peer);fail=true;await expect(f.store.revoke(peer.fingerprint,"viewer")).rejects.toThrow();expect(revoke).toHaveBeenCalledTimes(1);await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();await expect(f.store.trust({...peer,role:"agent"})).rejects.toThrow();await expect(f.store.endpoint(peer.fingerprint,"agent")).rejects.toThrow();expect(await readdir(f.store.directory)).toEqual(["identity.json"]);
});
it("uses the Windows protector for the entire vault and never falls back to owner-file mode",async()=>{
 expect(()=>new DesktopEndpointStore({stateDir:"unused",platform:"win32",protector:desktopSecretProtector("linux")})).toThrow();
 const values=new Map<string,Uint8Array>(),protector:DesktopSecretProtector={mode:"dpapi-user",protect:async value=>{const token=randomUUID();values.set(token,value.slice());return new TextEncoder().encode(token);},unprotect:async value=>{const data=values.get(new TextDecoder().decode(value));if(!data)throw Error("generated wrong user");return data.slice();}},f=await fixture({platform:"win32",protector,checkWindowsPath:async()=>{},commitWindowsVault:rename});await f.store.initialize();await f.store.trust(peer);const envelope=JSON.parse(await readFile(f.file,"utf8"));expect(envelope.mode).toBe("dpapi-user");expect(Buffer.from(envelope.data,"base64").toString()).not.toContain(peer.fingerprint);expect(await new DesktopEndpointStore({stateDir:f.dir,platform:"win32",protector,checkWindowsPath:async()=>{},commitWindowsVault:rename}).endpoint(peer.fingerprint,"viewer")).toBeDefined();values.clear();await expect(f.store.initialize()).rejects.toThrow("unavailable");
});

it("rejects an endpoint restored after its trust was revoked",async()=>{
 const f=await fixture();await f.store.initialize();await f.store.trust(peer);const begun=deferred(),release=deferred(),original=DesktopEndpointIdentity.restore.bind(DesktopEndpointIdentity),restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplementation(async(...args)=>{begun.resolve();await release.promise;return original(...args);});const endpoint=f.store.endpoint(peer.fingerprint,"viewer");
 try{await begun.promise;await f.store.revoke(peer.fingerprint,"viewer");release.resolve();await expect(endpoint).rejects.toThrow("not trusted");}finally{release.resolve();await Promise.allSettled([endpoint]);restore.mockRestore();}
});
it.skipIf(process.platform==="win32")("checks unsafe ancestors and state-directory aliases on every read",async()=>{
 const f=await fixture();await f.store.initialize();await f.store.trust(peer);await chmod(f.dir,0o777);try{await expect(f.store.status()).rejects.toThrow("unavailable");await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow("unavailable");}finally{await chmod(f.dir,0o700);}const alias=join(f.dir,"alias");await symlink(f.dir,alias,"dir");await expect(new DesktopEndpointStore({stateDir:alias}).status()).rejects.toThrow("unavailable");
});
it("finishes durable pin removal even if the live-session hook throws",async()=>{
 const f=await fixture({revoke:()=>{throw Error("generated hook failure");}});await f.store.initialize();await f.store.trust(peer);await expect(f.store.revoke(peer.fingerprint,"viewer")).rejects.toThrow("was revoked");await expect(f.reopen().endpoint(peer.fingerprint,"viewer")).rejects.toThrow("not trusted");
});
it("does not expose a new pin to another store before directory sync completes",async()=>{
 const f=await fixture();await f.store.initialize();const begun=deferred(),release=deferred(),original=(f.store as any).syncDirectory.bind(f.store),sync=vi.spyOn(f.store as any,"syncDirectory").mockImplementation(async(path:unknown)=>{if(path===f.store.directory){begun.resolve();await release.promise;}await original(path);});const saving=f.store.trust(peer);
 try{await begun.promise;await expect(f.reopen().endpoint(peer.fingerprint,"viewer")).rejects.toThrow();}finally{release.resolve();await saving;sync.mockRestore();}expect(await f.reopen().endpoint(peer.fingerprint,"viewer")).toBeDefined();
});
it("rejects a stale Windows vault when its parent permission policy becomes unsafe",async()=>{
 const plain=desktopSecretProtector("linux"),protector:DesktopSecretProtector={...plain,mode:"dpapi-user"};let unsafe=false;const checkWindowsPath=vi.fn(async()=>{if(unsafe)throw Error("Generated unsafe ACL");}),f=await fixture({platform:"win32",protector,checkWindowsPath,commitWindowsVault:rename});await f.store.initialize();await f.store.trust(peer);const old=await readFile(f.file);await f.store.revoke(peer.fingerprint,"viewer");await writeFile(f.file,old);unsafe=true;await expect(new DesktopEndpointStore({stateDir:f.dir,platform:"win32",protector,checkWindowsPath}).endpoint(peer.fingerprint,"viewer")).rejects.toThrow();expect(checkWindowsPath).toHaveBeenCalled();
});

it("never reactivates an issued permit after revoke, retrust or owner close",async()=>{
 const f=await fixture();await f.store.initialize();await f.store.trust(peer);const first=await f.store.endpoint(peer.fingerprint,"viewer");expect(first.active()).toBe(true);const revoking=f.store.revoke(peer.fingerprint,"viewer");expect(first.active()).toBe(false);await revoking;await f.store.trust(peer);expect(first.active()).toBe(false);const second=await f.store.endpoint(peer.fingerprint,"viewer");expect(second.active()).toBe(true);f.store.close();expect(second.active()).toBe(false);await expect(f.store.endpoint(peer.fingerprint,"viewer")).rejects.toThrow();
});
