import {expect,it,vi} from "vitest";
import {EventEmitter} from "node:events";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {parseArgs} from "../cliArgs.js";
import {runDesktopNativeHelper} from "./desktopNativeHelper.js";
it("parses local native helper only, requiring an exact browser origin",()=>{
 expect(parseArgs(["desktop","native-helper","--origin","https://browser.example"],{})).toEqual({kind:"desktop-native-helper",origin:"https://browser.example"});
 for(const args of [["desktop","native-helper"],["desktop","native-helper","--origin","https://browser.example/path"],["desktop","native-helper","--origin","file:///tmp"],["--machine","sr-pc","desktop","native-helper","--origin","https://browser.example"],["desktop","native-helper","--origin","https://browser.example","--token","secret"]])expect(()=>parseArgs(args,{})).toThrow();
});
it("prints only the localhost locator and waits shutdown completion on interruption",async()=>{
 const signals=new EventEmitter();let resolve!:(value:boolean)=>void;const done=new Promise<boolean>(yes=>{resolve=yes;}),write=vi.fn(),close=vi.fn(async()=>{}),listen=vi.fn(async()=>({descriptor:()=>({id:crypto.randomUUID(),origin:"http://n00000000000000000000000000000000.localhost:1234",url:"http://n00000000000000000000000000000000.localhost:1234/bridge?id=generated"}),close,done}));
 let finished=false;const running=runDesktopNativeHelper({origin:"https://browser.example"},{listen,write,signals}).then(()=>{finished=true;});await Promise.resolve();signals.emit("SIGINT");await Promise.resolve();expect(close).toHaveBeenCalledOnce();expect(finished).toBe(false);expect(write.mock.calls[0]![0]).toMatch(/^http:\/\/n.*\/bridge\?id=generated\n$/);resolve(true);await running;expect(finished).toBe(true);expect(signals.listenerCount("SIGINT")).toBe(0);expect(listen).toHaveBeenCalledWith("https://browser.example");
});
it("runs the actual local CLI without login and exits after its owned helper drains",async()=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL("../../dist/main.js",import.meta.url)),"desktop","native-helper","--origin","https://generated-browser.example"],{stdio:["ignore","pipe","pipe"]});
 const closed=once(child,"close");let output="",diagnostics="";child.stderr.on("data",bytes=>{diagnostics+=bytes;});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("no local CLI locator: "+diagnostics)),5000);child.stdout.on("data",bytes=>{output+=bytes;if(output.includes("\n")){clearTimeout(timer);resolve();}});child.once("error",error=>{clearTimeout(timer);reject(error);});});
  expect(output).toMatch(/^http:\/\/n[a-f0-9]{32}\.localhost:\d+\/bridge\?id=[a-f0-9-]+\n$/);child.kill("SIGINT");expect(await closed).toEqual([0,null]);expect(diagnostics).toBe("");
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill("SIGTERM");await closed;}}
},10000);
