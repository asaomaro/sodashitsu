import {afterEach,expect,it} from "vitest";
import {mkdtemp,readdir,rm,symlink,mkdir,chmod,stat,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {desktopIdentity} from "./desktopIdentity.js";
import {parseArgs} from "../cliArgs.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(join(tmpdir(),"soda-cli-identity-"));dirs.push(root);return root;}
it("parses identity as a serverless local command and rejects session or forwarding flags",()=>{
 expect(parseArgs(["desktop","identity"],{})).toEqual({kind:"desktop-identity",initialize:false,identityDir:undefined});
 expect(parseArgs(["desktop","identity","--initialize","--identity-dir","/tmp/private"],{})).toEqual({kind:"desktop-identity",initialize:true,identityDir:"/tmp/private"});
 for(const flags of [["--url","http://example.test"],["--token","secret"],["--auto-act"],["--machine","local"],["extra"]])expect(()=>parseArgs(["desktop","identity",...flags],{})).toThrow();
 expect(()=>parseArgs(["--machine","sr-pc","desktop","identity"],{})).toThrow();
 expect(()=>parseArgs(["--machine","local","desktop","identity"],{})).toThrow();
});
it.skipIf(process.platform==="win32")("does not create missing directories on status and initializes only explicitly with stable public metadata",async()=>{
 const root=await fixture(),identityDir=join(root,"nested","identity");
 expect(await desktopIdentity({initialize:false,identityDir})).toEqual({initialized:false,role:"agent"});expect(await readdir(root)).toEqual([]);
 const initialized=await desktopIdentity({initialize:true,identityDir});expect(initialized).toEqual({initialized:true,role:"agent",fingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(await desktopIdentity({initialize:false,identityDir})).toEqual(initialized);expect(await desktopIdentity({initialize:true,identityDir})).toEqual(initialized);
 expect((await stat(identityDir)).mode&0o777).toBe(0o700);
 await writeFile(join(identityDir,"desktop-endpoint","write.lock"),"another owner",{mode:0o600});await expect(desktopIdentity({initialize:false,identityDir})).rejects.toThrow("busy");
});
it.skipIf(process.platform==="win32")("rejects unsafe ancestors and symlinks before creating a child and never repairs existing permissions",async()=>{
 const root=await fixture(),unsafe=join(root,"unsafe");await mkdir(unsafe,{mode:0o777});await chmod(unsafe,0o777);
 await expect(desktopIdentity({initialize:true,identityDir:join(unsafe,"new")})).rejects.toThrow();expect(await readdir(unsafe)).toEqual([]);expect((await stat(unsafe)).mode&0o777).toBe(0o777);
 const alias=join(root,"alias");await symlink(root,alias);await expect(desktopIdentity({initialize:true,identityDir:join(alias,"new")})).rejects.toThrow();expect(await readdir(root)).toEqual(["alias","unsafe"]);
 const safe=join(root,"existing");await mkdir(safe,{mode:0o755});await desktopIdentity({initialize:true,identityDir:safe});expect((await stat(safe)).mode&0o777).toBe(0o755);
});
it("rejects relative, empty and NUL paths",async()=>{
 for(const identityDir of ["relative","","/bad\0path","x".repeat(4097)])await expect(desktopIdentity({initialize:true,identityDir})).rejects.toThrow("absolute local path");
});

it.skipIf(process.platform==="win32")("rejects dangling links and file ancestors rather than treating them as uninitialized",async()=>{
 const root=await fixture();await symlink(join(root,"missing"),join(root,"dangling"));await writeFile(join(root,"file"),"not a directory");
 for(const child of ["dangling","file"])await expect(desktopIdentity({initialize:false,identityDir:join(root,child,"state")})).rejects.toThrow();
 expect(await readdir(root)).toEqual(["dangling","file"]);
});
