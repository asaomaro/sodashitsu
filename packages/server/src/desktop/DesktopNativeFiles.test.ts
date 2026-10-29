import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {DesktopNativeFiles,type NativeFileHooks} from "./DesktopNativeFiles.js";
import {DesktopFiles} from "./DesktopFiles.js";
const clean:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
async function setup(){
 const root=await mkdtemp(join(tmpdir(),"soda-native-file-route-"));clean.push(()=>rm(root,{recursive:true,force:true}));
 const path=join(root,"選択.txt");await writeFile(path,"immutable selected bytes");
 let now=0,valid=true,granted=true;const generation=randomUUID(),gesture=randomUUID();
 const runtime={prepare:vi.fn(async()=>{}),capture:vi.fn(async()=>[path])};
 const release=vi.fn(async()=>{valid=false;return {id:randomUUID(),epoch:generation};});
 const hooks:NativeFileHooks={origin:"https://a.example",runtime,pointer:seq=>seq===7?{seq,point:{epoch:generation,x:-400,y:50,window:42,pid:123},at:0,valid:()=>valid,release}:undefined};
 const files=new DesktopNativeFiles(root,randomUUID(),hooks,()=>now);clean.push(()=>files.close());
 const fence=()=>{if(!granted)throw Error("revoked grant");};
 const run=(request:unknown)=>files.run(request,fence),prepare=()=>run({action:"native_prepare",gesture,origin:"https://a.example",seq:7});
 return {root,path,files,runtime,release,hooks,generation,gesture,run,prepare,clock:(v:number)=>{now=v;},invalidate:()=>{valid=false;},revoke:()=>{granted=false;},fence};
}
it("publishes an immutable manifest and reads only after exact control epoch release",async()=>{
 const f=await setup(),offer=(await f.prepare() as any).native;
 expect(offer).toEqual({lease:expect.any(String),generation:f.generation,entries:[{name:"選択.txt",directory:false,bytes:24,sha256:createHash("sha256").update("immutable selected bytes").digest("hex")}]});
 const read={action:"native_read",gesture:f.gesture,lease:offer.lease,request:randomUUID(),index:0,offset:0,length:24};
 await expect(f.run(read)).rejects.toThrow("まだ開始");expect(f.release).not.toHaveBeenCalled();
});
it("keeps file authority after intentional input release and returns exact copied bytes",async()=>{
 const f=await setup(),offer=(await f.prepare() as any).native;
 await f.run({action:"native_activate",gesture:f.gesture,lease:offer.lease});expect(f.release).toHaveBeenCalledOnce();
 const result=await f.run({action:"native_read",gesture:f.gesture,lease:offer.lease,request:randomUUID(),index:0,offset:0,length:24});
 expect(result).toEqual({data:Buffer.from("immutable selected bytes").toString("base64"),offset:0});
 await expect(f.run({action:"native_heartbeat",gesture:f.gesture,lease:offer.lease})).resolves.toEqual({});
});
for(const mode of ["epoch","release-failure","release-expired","grant-during-release","abort-during-release"]){it(`refuses activation after ${mode}`,async()=>{
 const f=await setup(),offer=(await f.prepare() as any).native;
 f.release.mockImplementation(async()=>{if(mode==="release-failure")throw Error("cleanup failed");if(mode==="release-expired")f.clock(750);if(mode==="grant-during-release")f.revoke();if(mode==="abort-during-release")f.files.cancel();return {id:randomUUID(),epoch:mode==="epoch"?randomUUID():f.generation};});
 await expect(f.run({action:"native_activate",gesture:f.gesture,lease:offer.lease})).rejects.toThrow();
 await expect(f.run({action:"native_read",gesture:f.gesture,lease:offer.lease,request:randomUUID(),index:0,offset:0,length:1})).rejects.toThrow();
});}
for(const mode of ["seq","expired","invalid-pointer","revoked","backwards"]){it(`does not inspect B selection after ${mode}`,async()=>{
 const f=await setup();if(mode==="expired")f.clock(750);if(mode==="backwards")f.clock(-1);if(mode==="invalid-pointer")f.invalidate();if(mode==="revoked")f.revoke();
 await expect(f.run({action:"native_prepare",gesture:f.gesture,origin:"https://a.example",seq:mode==="seq"?8:7})).rejects.toThrow();expect(f.runtime.capture).not.toHaveBeenCalled();
});}
it("does not revive an asynchronously cancelled selection result",async()=>{
 const f=await setup();let complete!:(paths:string[])=>void;f.runtime.capture.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 const pending=f.prepare();await Promise.resolve();f.files.cancel(f.gesture);complete([f.path]);await expect(pending).rejects.toThrow();
 await expect(f.prepare()).rejects.toThrow();
});
it("rejects changed physical pointer after the trusted adapter returns",async()=>{
 const f=await setup();f.runtime.capture.mockImplementation(async()=>{f.invalidate();return [f.path];});await expect(f.prepare()).rejects.toThrow();
});
it("does not accept another gesture or lease and never releases input for it",async()=>{
 const f=await setup(),offer=(await f.prepare() as any).native;
 for(const change of [{gesture:randomUUID()},{lease:randomUUID()}])await expect(f.run({action:"native_activate",gesture:f.gesture,lease:offer.lease,...change})).rejects.toThrow();
 expect(f.release).not.toHaveBeenCalled();await f.run({action:"native_abort",gesture:randomUUID()});await f.run({action:"native_activate",gesture:f.gesture,lease:offer.lease});
});
it("confines trusted adapter paths to the explicitly approved folder",async()=>{
 const f=await setup(),other=await mkdtemp(join(tmpdir(),"soda-native-outside-"));clean.push(()=>rm(other,{recursive:true,force:true}));await writeFile(join(other,"outside.txt"),"private");f.runtime.capture.mockResolvedValue([join(other,"outside.txt")]);await expect(f.prepare()).rejects.toThrow();expect(f.release).not.toHaveBeenCalled();
});
it("requires the existing explicit file grant and revokes native bytes immediately",async()=>{
 const f=await setup();f.hooks.pointer=seq=>({seq,point:{epoch:f.generation,x:-400,y:50,window:42,pid:123},at:performance.now(),valid:()=>true,release:f.release});
 const files=await DesktopFiles.open(f.root,()=>true,undefined,()=>true,false,undefined,f.hooks);clean.push(()=>files.close());
 const run=(request:unknown)=>files.run({type:"desktop_file",id:randomUUID(),request});
 const prepare={action:"native_prepare",gesture:f.gesture,origin:"https://a.example",seq:7};
 expect((await run(prepare)).ok).toBe(false);expect(f.runtime.capture).not.toHaveBeenCalled();
 expect((await run({action:"grant",enabled:true})).ok).toBe(true);
 const offer=(await run(prepare)).result!.native!;expect(offer.generation).toBe(f.generation);
 expect((await run({action:"native_activate",gesture:f.gesture,lease:offer.lease})).ok).toBe(true);
 const revoked=run({action:"grant",enabled:false});
 expect((await run({action:"native_read",gesture:f.gesture,lease:offer.lease,request:randomUUID(),index:0,offset:0,length:1})).ok).toBe(false);await revoked;
});

it("remembers cancellation before selection preparation and refuses delayed replay",async()=>{
 const f=await setup();f.files.cancel(f.gesture);await expect(f.prepare()).rejects.toThrow();expect(f.runtime.capture).not.toHaveBeenCalled();await expect(f.prepare()).rejects.toThrow();
});
it("cancels a queued DesktopFiles preparation before its root guard completes",async()=>{
 const f=await setup();f.hooks.pointer=seq=>({seq,point:{epoch:f.generation,x:-400,y:50,window:42,pid:123},at:performance.now(),valid:()=>true,release:f.release});const files=await DesktopFiles.open(f.root,()=>true,undefined,()=>true,false,undefined,f.hooks);clean.push(()=>files.close());const run=(request:unknown)=>files.run({type:"desktop_file",id:randomUUID(),request});await run({action:"grant",enabled:true});
 let entered!:()=>void,unblock!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{unblock=resolve;});
 const target=files as unknown as {check():Promise<void>},original=target.check.bind(target);vi.spyOn(target,"check").mockImplementationOnce(async()=>{entered();await gate;await original();});
 const request={action:"native_prepare",gesture:f.gesture,origin:"https://a.example",seq:7};const preparing=run(request);await started;const aborted=run({action:"native_abort",gesture:f.gesture});unblock();expect((await preparing).ok).toBe(false);await aborted;expect(f.runtime.capture).not.toHaveBeenCalled();expect((await run(request)).ok).toBe(false);expect(f.runtime.capture).not.toHaveBeenCalled();
});
it("publishes canonical directory and empty-directory metadata within the file result schema",async()=>{
 const f=await setup(),folder=join(f.root,"folder");await mkdir(folder);await mkdir(join(folder,"empty"));await writeFile(join(folder,"data.txt"),"bytes");f.runtime.capture.mockResolvedValue([folder]);const offer=(await f.prepare() as any).native;const {DesktopFileResult}=await import("@sodashitsu/protocol");
 expect(DesktopFileResult.safeParse({type:"desktop_file_result",id:randomUUID(),ok:true,result:{native:offer}}).success).toBe(true);
 expect(offer.entries).toEqual(expect.arrayContaining([{name:"folder",directory:true,bytes:0,sha256:createHash("sha256").update("").digest("hex")},{name:"folder\\empty",directory:true,bytes:0,sha256:createHash("sha256").update("").digest("hex")}]));
});

it("does not inspect B selection for a forged browser origin",async()=>{
 const f=await setup();await expect(f.run({action:"native_prepare",gesture:f.gesture,origin:"https://other.example",seq:7})).rejects.toThrow("接続元");expect(f.runtime.capture).not.toHaveBeenCalled();
});
it("holds the process-wide snapshot slot until an aborted preparation has drained",async()=>{
 const a=await setup(),b=await setup();let entered!:()=>void,complete!:(paths:string[])=>void;const started=new Promise<void>(resolve=>{entered=resolve;});a.runtime.capture.mockImplementation(()=>{entered();return new Promise(resolve=>{complete=resolve;});});
 const preparing=a.prepare();await started;a.files.cancel();await expect(b.prepare()).rejects.toThrow("別のドラッグ");expect(b.runtime.capture).not.toHaveBeenCalled();complete([a.path]);await expect(preparing).rejects.toThrow();await a.files.close();
 const result=await b.run({action:"native_prepare",gesture:randomUUID(),origin:"https://a.example",seq:7});expect(result).toHaveProperty("native");
});
