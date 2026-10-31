import { spawn } from "node:child_process";
import { expect, it, vi } from "vitest";
import { assistantLaunchFromEnv, ManagedAssistant } from "./ManagedAssistant.js";
it("does not inspect commands or launch anything while disabled", () => {
 const launch=vi.fn<typeof spawn>(); const app=new ManagedAssistant(vi.fn(),launch as unknown as typeof spawn);
 app.start(assistantLaunchFromEnv({SODA_ASSISTANT_COMMAND:"invalid JSON"},"invalid origin"));
 expect(launch).not.toHaveBeenCalled();
 expect(()=>assistantLaunchFromEnv({SODA_ASSISTANT_ENABLED:"1",SODA_ASSISTANT_COMMAND:'["x","a\\nexit"]'},"http://127.0.0.1:7780")).toThrow();
});
it("starts a single owned process and releases it on stdin EOF without a background keeper", async () => {
 const spawned:ReturnType<typeof spawn>[]=[];
 const launch:typeof spawn=((...args:Parameters<typeof spawn>)=>{const c=spawn(...args);spawned.push(c);return c;}) as typeof spawn;
 const disabled=vi.fn(); const app=new ManagedAssistant(vi.fn(),launch,disabled);
 // Owned generated Node program only: no Electron, desktop, model or device.
 const config={command:[process.execPath,"-e",'process.stdin.once("data",()=>process.stdout.write(JSON.stringify({type:"disabled"})+"\\n"));process.stdin.on("end",()=>process.exit(0));process.stdin.resume();',"--"],origin:"http://127.0.0.1:7780"};
 try {
  app.start(config);app.start(config);expect(spawned).toHaveLength(1);
  await vi.waitFor(()=>expect(disabled).toHaveBeenCalledOnce());
  const first=app.stop();expect(app.stop()).toBe(first);await first;
  expect(spawned[0]!.exitCode).toBe(0);
 } finally {await app.stop();}
});

it("reports an existing instance without claiming or killing that instance", async () => {
 const warn=vi.fn(),app=new ManagedAssistant(warn);
 try {app.start({command:[process.execPath,"-e","process.exit(75)","--"],origin:"http://127.0.0.1:7780"});
  await vi.waitFor(()=>expect(warn).toHaveBeenCalledWith(expect.stringContaining("既存のアシスタント")));
 } finally {await app.stop();}
});
it('keeps the generic runtime in GUI mode instead of inheriting Node mode options',async()=>{
 vi.stubEnv('ELECTRON_RUN_AS_NODE','1');vi.stubEnv('NODE_OPTIONS','--inspect');vi.stubEnv('NODE_PATH','generated-untrusted-path');
 const spawned:ReturnType<typeof spawn>[]=[];const launch=vi.fn((...args:Parameters<typeof spawn>)=>{const child=spawn(...args);spawned.push(child);return child;}) as unknown as typeof spawn;
 const app=new ManagedAssistant(vi.fn(),launch);
 try{app.start({command:[process.execPath,'-e','process.stdin.on("end",()=>process.exit(0));process.stdin.resume();','--'],origin:'http://127.0.0.1:7780'});const options=vi.mocked(launch).mock.calls[0]![2] as{env:NodeJS.ProcessEnv};expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();expect(options.env.NODE_OPTIONS).toBeUndefined();expect(options.env.NODE_PATH).toBeUndefined();await app.stop();expect(spawned).toHaveLength(1);}finally{await app.stop();vi.unstubAllEnvs();}
});
it('uses Node mode only for the bundled native relay and carries it through WSLENV',async()=>{
 vi.stubEnv('WSLENV','EXAMPLE/u:ELECTRON_RUN_AS_NODE/u');vi.stubEnv('NODE_OPTIONS','--inspect');
 const launch=vi.fn((...args:Parameters<typeof spawn>)=>spawn(...args)) as unknown as typeof spawn;
 const app=new ManagedAssistant(vi.fn(),launch);
 try{
  app.start({command:[process.execPath,'-e','process.stdin.on("data",()=>{});process.stdin.on("end",()=>{process.stdout.write(\'{"type":"retired"}\\n\',()=>process.exit(0))});','--'],origin:'http://127.0.0.1:7780',nativeNodeRelay:true});
  const env=(vi.mocked(launch).mock.calls[0]![2] as{env:NodeJS.ProcessEnv}).env;
  expect(env.ELECTRON_RUN_AS_NODE).toBe('1');expect(env.WSLENV).toBe('EXAMPLE/u:ELECTRON_RUN_AS_NODE');expect(env.NODE_OPTIONS).toBeUndefined();
  await app.stop();
 }finally{await app.stop();vi.unstubAllEnvs();}
});
it('keeps a failed relay slot until GUI retirement is proved, including forced relay exit',async()=>{
 const ended=vi.fn(), launch=vi.fn((...args:Parameters<typeof spawn>)=>spawn(...args)) as unknown as typeof spawn;
 const app=new ManagedAssistant(vi.fn(),launch,undefined,undefined,ended);
 const config={command:[process.execPath,'-e','process.exit(0)','--'],origin:'http://127.0.0.1:7780',nativeNodeRelay:true};
 app.start(config);await vi.waitFor(()=>expect(ended).toHaveBeenCalledWith(false));
 await expect(app.stop()).rejects.toThrow('終了を確認');app.start(config);expect(launch).toHaveBeenCalledOnce();
});
