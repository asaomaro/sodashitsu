import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,readFile,readdir,rename,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {DesktopEndpointStore} from "./DesktopEndpointStore.node.js";
import {desktopSecretProtector} from "./DesktopEndpointProtector.node.js";
import {DesktopEndpointIdentity,DesktopEndpointHandshake} from "./DesktopE2e.js";

const directories:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(directories.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
async function fixture(){
  const stateDir=await mkdtemp(join(tmpdir(),"soda-local-identity-"));directories.push(stateDir);
  const options={stateDir,...(process.platform==="win32"?{platform:"win32" as const,protector:{...desktopSecretProtector("linux"),mode:"dpapi-user" as const},checkWindowsPath:async()=>{},commitWindowsVault:rename}:{})};
  return{stateDir,store:new DesktopEndpointStore(options),reopen:()=>new DesktopEndpointStore(options)};
}
function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}

it("does not initialize or grant a peer implicitly, and restores the same agent identity",async()=>{
  const f=await fixture();await expect(f.store.localIdentity()).rejects.toThrow();expect(await readdir(f.stateDir)).toEqual([]);
  const initialized=await f.store.initialize(),permit=await f.store.localIdentity();
  expect(await permit.identity.fingerprint()).toBe(initialized.fingerprint);expect(permit.active()).toBe(true);
  expect(await f.store.status()).toMatchObject({peers:[],required:false});f.store.close();await f.store.settled();expect(permit.active()).toBe(false);
  const next=f.reopen(),restored=await next.localIdentity();expect(await restored.identity.fingerprint()).toBe(initialized.fingerprint);next.close();
});
it("uses the restored identity for a pinned agent/provider handshake without exporting a key",async()=>{
  const f=await fixture();await f.store.initialize();const permit=await f.store.localIdentity(),provider=await DesktopEndpointIdentity.create(crypto),session=randomUUID();
  const agent=await DesktopEndpointHandshake.create(crypto,permit.identity,{session,role:"agent",peerRole:"provider",generation:1,expectedFingerprint:await provider.fingerprint()});
  const peer=await DesktopEndpointHandshake.create(crypto,provider,{session,role:"provider",peerRole:"agent",generation:1,expectedFingerprint:await permit.identity.fingerprint()});
  const ap=await agent.proof(peer.hello),pp=await peer.proof(agent.hello),left=await agent.finish(peer.hello,pp),right=await peer.finish(agent.hello,ap);
  try{
    const plaintext=new TextEncoder().encode("generated agent record"),sealed=await left.seal("agent",plaintext);
    expect(await right.open("agent",sealed)).toEqual(plaintext);expect(Buffer.from(sealed).includes(Buffer.from(plaintext))).toBe(false);
  }finally{left.close();right.close();f.store.close();}
});
it("invalidates local identity permits immediately on owner policy change or close",async()=>{
  const f=await fixture();await f.store.initialize();const first=await f.store.localIdentity();
  const changing=f.store.setRequired(true);expect(first.active()).toBe(false);await changing;
  const second=await f.store.localIdentity();expect(second.active()).toBe(true);f.store.close();expect(second.active()).toBe(false);
  await expect(f.store.localIdentity()).rejects.toThrow();
});
it("rejects a local identity restored across a completed policy change",async()=>{
  const f=await fixture();await f.store.initialize();const begun=gate(),release=gate(),original=DesktopEndpointIdentity.restore.bind(DesktopEndpointIdentity);let held=false;
  const restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplementation(async(...args)=>{if(!held){held=true;begun.resolve();await release.promise;}return original(...args);});
  const pending=f.store.localIdentity(),rejected=expect(pending).rejects.toThrow();
  try{await begun.promise;await f.store.setRequired(true);release.resolve();await rejected;}
  finally{release.resolve();await Promise.allSettled([pending]);restore.mockRestore();}
});
it("rejects a vault replacement completed during key restore",async()=>{
  const f=await fixture(),other=await fixture();await f.store.initialize();await other.store.initialize();
  const begun=gate(),release=gate(),original=DesktopEndpointIdentity.restore.bind(DesktopEndpointIdentity);
  const restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplementation(async(...args)=>{begun.resolve();await release.promise;return original(...args);});
  const pending=f.store.localIdentity(),rejected=expect(pending).rejects.toThrow();
  try{await begun.promise;await writeFile(join(f.store.directory,"identity.json"),await readFile(join(other.store.directory,"identity.json")),{mode:0o600});release.resolve();await rejected;}
  finally{release.resolve();await Promise.allSettled([pending]);restore.mockRestore();}
});
it("rechecks owner lifetime after the final asynchronous vault read",async()=>{
  const f=await fixture();await f.store.initialize();const local=f.store as unknown as{load():Promise<unknown>},read=local.load.bind(local);let reads=0;
  const restore=vi.spyOn(local,"load").mockImplementation(async()=>{const data=await read();if(++reads===2)f.store.close();return data;});
  try{await expect(f.store.localIdentity()).rejects.toThrow();}finally{restore.mockRestore();}
});

it("returns a verified viewer identity with policy from its post-restoration vault",async()=>{
 const f=await fixture(),initialized=await f.store.initialize(),fingerprint="a".repeat(64);await f.store.setRequired(true);await f.store.trust({fingerprint,role:"viewer",label:"Generated viewer"});
 const value=await f.store.verifiedEndpoint(fingerprint,"viewer");expect(value.status).toEqual({initialized:true,required:true,fingerprint:initialized.fingerprint,peers:[{fingerprint,role:"viewer",label:"Generated viewer"}]});expect(await value.identity.fingerprint()).toBe(initialized.fingerprint);expect(value.active()).toBe(true);
 const revoked=f.store.revoke(fingerprint,"viewer");expect(value.active()).toBe(false);await revoked;await expect(f.store.verifiedEndpoint(fingerprint,"viewer")).rejects.toThrow();
});
it.each(["revoke","policy","close","replacement","peer-removed"])("rejects a verified snapshot across %s during restoration",async mode=>{
 const f=await fixture(),other=await fixture(),fingerprint="b".repeat(64);await f.store.initialize();await other.store.initialize();await f.store.trust({fingerprint,role:"viewer",label:"Generated viewer"});
 const begun=gate(),release=gate(),original=DesktopEndpointIdentity.restore.bind(DesktopEndpointIdentity);let held=false;
 const restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplementation(async(...args)=>{if(!held){held=true;begun.resolve();await release.promise;}return original(...args);});
 const pending=f.store.verifiedEndpoint(fingerprint,"viewer"),rejected=expect(pending).rejects.toThrow();
 try{await begun.promise;
  if(mode==="revoke")await f.store.revoke(fingerprint,"viewer");if(mode==="policy")await f.store.setRequired(true);if(mode==="close")f.store.close();
  if(mode==="replacement")await writeFile(join(f.store.directory,"identity.json"),await readFile(join(other.store.directory,"identity.json")),{mode:0o600});
  if(mode==="peer-removed"){const editor=f.reopen();try{await editor.revoke(fingerprint,"viewer");}finally{editor.close();}}
  release.resolve();await rejected;
 }finally{release.resolve();await Promise.allSettled([pending]);restore.mockRestore();}
});
it("requires viewer role and validates the required marker in a verified snapshot",async()=>{
 const f=await fixture(),fingerprint="c".repeat(64);await f.store.initialize();await f.store.trust({fingerprint,role:"agent",label:"Generated agent"});await expect(f.store.verifiedEndpoint(fingerprint,"viewer")).rejects.toThrow();await f.store.trust({fingerprint,role:"viewer",label:"Generated viewer"});
 expect((await f.store.verifiedEndpoint(fingerprint,"viewer")).status.required).toBe(false);
 await writeFile(join(f.stateDir,"desktop-endpoint-required.json"),JSON.stringify({version:1,required:true}),{mode:0o600});expect((await f.store.verifiedEndpoint(fingerprint,"viewer")).status.required).toBe(true);
 await writeFile(join(f.stateDir,"desktop-endpoint-required.json"),'{"version":1,"required":"false"}',{mode:0o600});await expect(f.store.verifiedEndpoint(fingerprint,"viewer")).rejects.toThrow();
});
