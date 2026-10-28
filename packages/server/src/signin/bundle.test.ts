import {resolve} from "node:path";
import {expect,it} from "vitest";
// Build and evaluate only; deliberately invalid startup args prevent every
// platform from launching a native broker or touching an enrollment/key.
it("builds a single builtin-only bundle that the installed bootstrap can load",async()=>{
 const {buildSigninBundle}=await import(new URL("../../../../scripts/remote-desktop/build-signin-bundle.mjs",import.meta.url).href);
 const {loadSigninBundle}=await import(new URL("../../../../scripts/remote-desktop/signin-bootstrap.mjs",import.meta.url).href);
 const code=await buildSigninBundle();expect(Buffer.byteLength(code)).toBeLessThanOrEqual(16777216);expect(code).not.toContain("import.meta");
 const loaded=loadSigninBundle(code,resolve("node_modules/.cache/signin-test/packages/server/dist/signin/main.bundle.cjs")),saved=process.argv;
 process.argv=[saved[0]!,"generated-bootstrap","--unexpected"];
 try{await expect(loaded.main()).rejects.toThrow("Signin agent is unavailable");await expect(loaded.main()).rejects.toThrow("Signin agent is unavailable");}finally{process.argv=saved;}
});
