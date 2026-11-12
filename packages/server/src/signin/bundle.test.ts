import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {expect,it} from "vitest";
// Invalid args stop before a native broker, enrollment or key is accessed.
it("builds a self-contained bundle loadable by Node",async()=>{
 const {buildSigninBundle}=await import(new URL("../../../../scripts/remote-desktop/build-signin-bundle.mjs",import.meta.url).href);
 const code=await buildSigninBundle();expect(Buffer.byteLength(code)).toBeLessThanOrEqual(16777216);expect(code).not.toContain("import.meta");
 const root=await mkdtemp(join(tmpdir(),"soda-signin-bundle-")),filename=join(root,"main.bundle.cjs"),saved=process.argv;
 try{
  await writeFile(filename,code);
  const loaded=await import(pathToFileURL(filename).href);
  process.argv=[saved[0]!,"generated-bootstrap","--unexpected"];
  await expect(loaded.main()).rejects.toThrow("Signin agent is unavailable");
 }finally{process.argv=saved;await rm(root,{recursive:true,force:true});}
});
