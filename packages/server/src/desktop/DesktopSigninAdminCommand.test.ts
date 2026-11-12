import * as childProcess from "node:child_process";
import {PassThrough} from "node:stream";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {afterEach,expect,it,vi} from 'vitest';
import {desktopSigninAdminCommand,type DesktopSigninAdminCommandDependencies} from './DesktopSigninAdminCommand.js';
const owner='S-1-5-21-1-2-3-1001',provider='a'.repeat(64),viewer='b'.repeat(64);
function fixture(){
 const state={initialized:true as const,required:true,fingerprint:provider,peers:[{fingerprint:viewer,role:'viewer' as const,label:'Existing viewer'}]};
 const store={status:vi.fn(async()=>state),initialize:vi.fn(async()=>({fingerprint:provider})),setRequired:vi.fn(async()=>{}),trust:vi.fn(async()=>{}),revoke:vi.fn(async()=>{}),close:vi.fn(),settled:vi.fn(async()=>{})};
 const deps={store:vi.fn(()=>store),enrollment:vi.fn(async(_owner:string,_operation:'enroll'|'disable',_bytes:Uint8Array)=>{}),uuid:()=> '11111111-1111-4111-8111-111111111111'} satisfies DesktopSigninAdminCommandDependencies;
 return {store,deps,state,run:(raw:unknown)=>desktopSigninAdminCommand(owner,'C:\\private\\runtime',raw,deps)};
}
it.each([{kind:'exec',command:'arbitrary'},{kind:'initialize',path:'elsewhere'},{kind:'trust',peer:{fingerprint:viewer,label:'viewer',role:'provider'}},{kind:'disable',token:'secret'}])('rejects unregistered operations before constructing a writable store: %j',async operation=>{
 const f=fixture();await expect(f.run(operation)).rejects.toThrow();expect(f.deps.store).not.toHaveBeenCalled();
});
it('uses the existing store for explicit initialization and mandatory encryption',async()=>{
 const f=fixture();await expect(f.run({kind:'initialize'})).resolves.toMatchObject({outcome:'success'});expect(f.store.initialize).toHaveBeenCalledOnce();expect(f.store.setRequired).toHaveBeenCalledWith(true);expect(f.store.close).toHaveBeenCalledOnce();expect(f.store.settled).toHaveBeenCalledOnce();
});
it('does not retry an uncertain mutation or erase existing identity',async()=>{
 const f=fixture();f.store.initialize.mockRejectedValue(Error('existing corrupt identity'));await expect(f.run({kind:'initialize'})).resolves.toEqual({outcome:'incomplete'});expect(f.store.initialize).toHaveBeenCalledOnce();expect(f.store.setRequired).not.toHaveBeenCalled();expect(f.deps.enrollment).not.toHaveBeenCalled();expect(f.store.close).toHaveBeenCalledOnce();
});
it('refuses to enroll a viewer absent from the existing trust store',async()=>{
 const f=fixture();await expect(f.run({kind:'enroll',origin:'https://example.test',machineId:'c'.repeat(32),token:'t'.repeat(43),allowInput:true,peers:[{fingerprint:'d'.repeat(64),label:'untrusted'}]})).resolves.toEqual({outcome:'incomplete'});expect(f.deps.enrollment).not.toHaveBeenCalled();expect(f.store.trust).not.toHaveBeenCalled();
});
it('preserves provider binding and DPAPI enrollment data format without returning credentials',async()=>{
 const f=fixture();let persisted:unknown;f.deps.enrollment.mockImplementation(async(_owner,_operation,bytes)=>{persisted=JSON.parse(Buffer.from(bytes).toString());});
 const result=await f.run({kind:'enroll',origin:'https://example.test',machineId:'c'.repeat(32),token:'t'.repeat(43),allowInput:true,peers:[{fingerprint:viewer,label:'viewer'}]});
 expect(persisted).toMatchObject({purpose:'desktop-signin',version:1,ownerSid:owner,provider,token:'t'.repeat(43),allowSignin:true});expect(JSON.stringify(result)).not.toContain('t'.repeat(43));expect(f.store.initialize).not.toHaveBeenCalled();expect(f.store.trust).not.toHaveBeenCalled();
});
it('disables enrollment without deleting or regenerating the existing endpoint identity/trust',async()=>{
 const f=fixture();await f.run({kind:'disable'});expect(f.deps.enrollment).toHaveBeenCalledWith(owner,'disable',new Uint8Array());expect(f.store.initialize).not.toHaveBeenCalled();expect(f.store.trust).not.toHaveBeenCalled();expect(f.store.revoke).not.toHaveBeenCalled();
});
it('keeps the existing eight-viewer limit',async()=>{
 const f=fixture();f.state.peers=Array.from({length:8},(_,i)=>({fingerprint:String(i).repeat(64),role:'viewer' as const,label:'viewer'}));await expect(f.run({kind:'trust',peer:{fingerprint:viewer,label:'new'}})).resolves.toEqual({outcome:'incomplete'});expect(f.store.trust).not.toHaveBeenCalled();
});

vi.mock("node:child_process",async importOriginal=>{const actual=await importOriginal<typeof import("node:child_process")>();return {...actual,execFile:vi.fn(actual.execFile)};});
vi.mock("@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node",()=>({desktopWindowsPowerShell:()=>"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"}));
afterEach(()=>{vi.restoreAllMocks();vi.mocked(childProcess.execFile).mockRestore();});
it("uses an embedded-helper process policy for the fixed enrollment writer",async()=>{
 vi.spyOn(DesktopEndpointStore.prototype,"status").mockResolvedValue({initialized:false});
 vi.spyOn(DesktopEndpointStore.prototype,"settled").mockResolvedValue();vi.spyOn(DesktopEndpointStore.prototype,"close").mockImplementation(()=>{});
 vi.mocked(childProcess.execFile).mockImplementation(((...args:unknown[])=>{
  const child={stdin:new PassThrough()};queueMicrotask(()=>(args[3] as (error:null,stdout:string,stderr:string)=>void)(null,"signin_enrollment_updated",""));
  return child as unknown as ReturnType<typeof childProcess.execFile>;
 }) as typeof childProcess.execFile);
 expect(await desktopSigninAdminCommand(owner,"/generated-unused-state",{kind:"disable"})).toMatchObject({outcome:"success"});
 const [executable,args,options]=vi.mocked(childProcess.execFile).mock.calls[0]!;
 expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
 expect(args!.slice(0,6)).toEqual(["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"]);
 expect(args![6]).toMatch(/write-signin-enrollment\.ps1$/);expect(args).not.toContain("-Command");
 expect(options).toMatchObject({windowsHide:true,cwd:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0",env:{PSModulePath:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules"}});
});
