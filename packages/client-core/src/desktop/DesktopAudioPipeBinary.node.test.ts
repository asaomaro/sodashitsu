import {afterEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,rm,lstat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const fixture=vi.hoisted(()=>({run:vi.fn()}));vi.mock("./DesktopOwnedChild.node.js",()=>({desktopOwnedChild:fixture.run}));
import {DesktopAudioPipeBinary} from "./DesktopAudioPipeBinary.node.js";
const clean:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();fixture.run.mockReset();});
async function setup(mode="success"){
 const root=await mkdtemp(join(tmpdir(),"soda-audio-binary-test-")),directory=join(root,"owned"),binary=join(directory,"audio-pipe.exe");await mkdir(directory);await writeFile(binary,"generated owned fixture");clean.push(()=>rm(root,{recursive:true,force:true}));
 const windows=String.raw`C:\Users\generated\AppData\Local\Temp\soda-audio-pipe-`+"a".repeat(32);
 fixture.run.mockImplementation(async(command:string,args:readonly string[])=>{
  if(command==="/usr/bin/wslpath")return args[0]==="-w"?String.raw`C:\fixed\build-audio-pipe.ps1`:directory;
  if(command.endsWith("powershell.exe"))return JSON.stringify({directory:mode==="bad-path"?"C:\\unexpected":windows,binary:windows+"\\audio-pipe.exe"});
  if(command===binary&&args.length===1&&args[0]==="--preflight")return mode==="bad-preflight"?"wrong product":"soda-audio-pipe-preflight-v1\r\n";
  throw Error("Unexpected program in generated fixture");
 });
 const product=new DesktopAudioPipeBinary("linux",{WSL_DISTRO_NAME:"generated"});clean.push(()=>product.close());return {product,directory,binary};
}
it("admits the fixed binary only after its exact successful preflight and cleans its retained artifact",async()=>{
 const f=await setup();expect(()=>f.product.executable).toThrow("準備");await f.product.prepare();expect(f.product.executable).toBe(f.binary);expect(fixture.run).toHaveBeenCalledWith(f.binary,["--preflight"],"",{timeout:15000,limit:128});await f.product.close();await expect(lstat(f.directory)).rejects.toMatchObject({code:"ENOENT"});
});
it("does not expose a compiled artifact whose product preflight failed",async()=>{
 const f=await setup("bad-preflight");await expect(f.product.prepare()).rejects.toThrow("事前");expect(()=>f.product.executable).toThrow("準備");await f.product.close();await expect(lstat(f.directory)).rejects.toMatchObject({code:"ENOENT"});
});
it("refuses unexpected builder paths before using or deleting them",async()=>{
 const f=await setup("bad-path");await expect(f.product.prepare()).rejects.toThrow("準備結果");expect(fixture.run.mock.calls.some(([command])=>command===f.binary)).toBe(false);expect((await lstat(f.binary)).isFile()).toBe(true);
});
