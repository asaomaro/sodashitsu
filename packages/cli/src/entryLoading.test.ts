import {spawn} from "node:child_process";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {expect,it} from "vitest";

const root=fileURLToPath(new URL("../../../",import.meta.url));
async function execute(entry:string,args:string[],options:{rejectModule?:string;code?:number;script?:string}={}) {
 const directory=await mkdtemp(join(tmpdir(),"soda-entry-load-")),loader=join(directory,"loader.mjs"),log=join(directory,"modules.log");
 await writeFile(loader,`import {appendFileSync} from 'node:fs';\nexport async function load(url,context,next){if(process.env.SODA_TEST_REJECT_MODULE && url.endsWith(process.env.SODA_TEST_REJECT_MODULE))throw Error('generated unavailable feature module');const result=await next(url,context);if(url.startsWith('file:'))appendFileSync(process.env.SODA_TEST_IMPORT_LOG,url+'\\n');return result;}\n`);
 const entryPath=options.script ? join(directory,"entry.mjs") : join(root,entry);
 if(options.script)await writeFile(entryPath,options.script);
 const child=spawn(process.execPath,["--no-warnings","--experimental-loader",pathToFileURL(loader).href,entryPath,...args],{env:{...process.env,SODA_TEST_IMPORT_LOG:log,SODA_TEST_REJECT_MODULE:options.rejectModule??""},stdio:["ignore","pipe","pipe"]});
 let output="",errors="";child.stdout.on("data",data=>{output+=String(data)});child.stderr.on("data",data=>{errors+=String(data)});
 let timeout=false;const timer=setTimeout(()=>{timeout=true;child.kill();},10000);
 try {
  const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve)});
  expect(timeout,"entry did not terminate").toBe(false);expect(code,errors).toBe(options.code??0);
  return {output,errors,modules:(await readFile(log,"utf8")).trim().split("\n")};
 }finally {clearTimeout(timer);child.kill();await rm(directory,{recursive:true,force:true})}
}
it.each(["packages/server/dist/main.js","packages/cli/dist/main.js"])("%s help never loads optional feature implementations",async entry=>{
 const result=await execute(entry,["--help"]);expect(result.output).toContain("soda");
 const features=result.modules.filter(url=>/\/packages\/server\/dist\/(?:composeServer\.js|assistant\/|desktop\/|preview\/|pty\/)/.test(url)||/\/packages\/cli\/dist\/(?:commands\/|workAgent[^/]*\.js|pluginPackage\.js)/.test(url));
 expect(features).toEqual([]);
});
it("skill selects only its command module without starting desktop, preview or work-agent implementations",async()=>{
 const result=await execute("packages/cli/dist/main.js",["skill"]);expect(result.output).toContain("sodactl");
 expect(result.modules.some(url=>url.endsWith("/packages/cli/dist/skill.js"))).toBe(true);
 expect(result.modules.filter(url=>/\/packages\/cli\/dist\/(?:commands\/|workAgent[^/]*\.js|pluginPackage\.js)/.test(url))).toEqual([]);
});

it("assistant status reads only metadata while disabled",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"soda-disabled-status-"));
 try{const result=await execute("packages/server/dist/main.js",["assistant","status","--state-dir",directory]);expect(JSON.parse(result.output).installation).toBeNull();
 expect(result.modules.filter(url=>/\/packages\/server\/dist\/(?:composeServer\.js|assistant\/(?:AssistantLaunchController|ManagedAssistant|AssistantPackage|AssistantZip|AssistantSessions|AssistantAudioUploads|CodexAudio)\.js)/.test(url))).toEqual([]);
 }finally{await rm(directory,{recursive:true,force:true})}
});
it("handoff preflight still validates the actual server module before reporting readiness",async()=>{
 const result=await execute("packages/server/dist/main.js",["__handoff-preflight","--stage","2","--probe","invalid"]);
 expect(JSON.parse(result.output).ok).toBe(false);expect(result.modules.some(url=>url.endsWith("/packages/server/dist/composeServer.js"))).toBe(true);
 expect(result.modules.filter(url=>/\/assistant\/(?:AssistantAudioUploads|CodexAudio)\.js$/.test(url))).toEqual([]);
});

it("an unavailable server implementation cannot break an unrelated help command",async()=>{
 const result=await execute("packages/server/dist/main.js",["--help"],{rejectModule:"/composeServer.js"});expect(result.output).toContain("soda");
});
it("handoff rejects an unavailable server implementation before acknowledging readiness",async()=>{
 const result=await execute("packages/server/dist/main.js",["__handoff-preflight","--stage","2","--probe","invalid"],{rejectModule:"/composeServer.js",code:1});
 expect(result.output).not.toContain('"ok"');expect(result.errors).toContain("generated unavailable feature module");
});

it("disabled server launch controller does not evaluate the native GUI host",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"soda-disabled-host-"));
 try {
  const controller=pathToFileURL(join(root,"packages/server/dist/assistant/AssistantLaunchController.js")).href;
  const result=await execute("",[],{rejectModule:"/ManagedAssistant.js",script:`import {AssistantLaunchController} from ${JSON.stringify(controller)};
   const owner=new AssistantLaunchController(${JSON.stringify(directory)},{},()=>"http://127.0.0.1:7780",()=>{});
   owner.start();await new Promise(resolve=>setTimeout(resolve,50));await owner.stop();console.log("stopped");`});
  expect(result.output).toContain("stopped");expect(result.modules.some(url=>url.endsWith("/ManagedAssistant.js"))).toBe(false);
 }finally {await rm(directory,{recursive:true,force:true});}
});
