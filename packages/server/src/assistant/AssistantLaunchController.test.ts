import * as nodeFs from "node:fs";
import * as enabledState from "./AssistantEnabledState.js";
import {EventEmitter} from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
vi.mock("node:fs",async original=>{const actual=await original<typeof nodeFs>();return {...actual,watch:vi.fn(actual.watch)};});
import { AssistantLaunchController, readAssistantEnabled, writeAssistantEnabled } from "./AssistantLaunchController.js";
import type { ManagedAssistant } from "./ManagedAssistant.js";
it("persists enable/disable without spawning and applies file changes only while owned", async () => {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-launch-"));
 const start=vi.fn(),stop=vi.fn(async()=>{}),warn=vi.fn();
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated-app"]'},()=>"http://127.0.0.1:7780",warn,{start,stop} as unknown as ManagedAssistant);
 try {
  expect(await readAssistantEnabled(dir)).toBe(false);controller.start();
  await vi.waitFor(()=>expect(stop).toHaveBeenCalled());expect(start).not.toHaveBeenCalled();
  await writeAssistantEnabled(dir,true);await vi.waitFor(()=>expect(start).toHaveBeenCalledWith({command:["generated-app"],origin:"http://127.0.0.1:7780"}));
  expect(await readAssistantEnabled(dir)).toBe(true);
  stop.mockClear();await writeAssistantEnabled(dir,false);await vi.waitFor(()=>expect(stop).toHaveBeenCalled());
  await controller.stop();start.mockClear();await writeAssistantEnabled(dir,true);expect(start).not.toHaveBeenCalled();
  controller.start();await vi.waitFor(()=>expect(start).toHaveBeenCalled());
  expect(warn).not.toHaveBeenCalled();
 } finally {await controller.stop();await rm(dir,{recursive:true,force:true});}
});
it("invalid saved state fails closed", async () => {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-state-"));
 try {await writeFile(join(dir,"assistant-launch.json"),'{"enabled":true,"command":"ignored"}');await expect(readAssistantEnabled(dir)).rejects.toThrow();}
 finally {await rm(dir,{recursive:true,force:true});}
});

it("drains accepted self-disable persistence before stopping the owner", async () => {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-drain-"));
 let disabled!:()=>void, release!:()=>void;
 const save=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));
 const app={start:vi.fn(),stop:vi.fn(async()=>{})} as unknown as ManagedAssistant;
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),onDisabled=>{disabled=onDisabled;return app;},save);
 try {
  await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(app.start).toHaveBeenCalled());disabled();let stopped=false;
  const closing=controller.stop().then(()=>{stopped=true;});
  for(let i=0;i<10;i++) await Promise.resolve();
  expect(stopped).toBe(false);
  release();await closing;expect(stopped).toBe(true);
  disabled();expect(save).toHaveBeenCalledOnce();
 } finally {release?.();await controller.stop();await rm(dir,{recursive:true,force:true});}
});
it("drains accepted writes even when the app cannot confirm exit", async () => {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-failed-stop-"));
 let disabled!:()=>void, release!:()=>void;
 const save=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));
 const stop=vi.fn(async()=>{throw Error("generated stop failure");});
 const app={start:vi.fn(),stop} as unknown as ManagedAssistant;
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),fn=>{disabled=fn;return app;},save);
 try {
  await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(app.start).toHaveBeenCalled());disabled();let done=false;
  const closing=controller.stop().then(()=>{done=true;},()=>{done=true;});
  for(let i=0;i<15;i++) await Promise.resolve();
  expect(done).toBe(false);release();await closing;expect(done).toBe(true);
 } finally {release?.();await controller.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

it("keeps an identity that arrives during disable and requests agent stop even if app stop fails", async () => {
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-late-attach-"));
 const deviceId="00000000-0000-4000-8000-000000000001";
 let attached!:(deviceId:string)=>void;
 const activate=vi.fn(),requestStop=vi.fn(async()=>{}),start=vi.fn();
 const stop=vi.fn(async()=>{attached(deviceId);throw Error("generated GUI stop failure");});
 const app={start,stop} as unknown as ManagedAssistant;
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),(_disabled,onAttached)=>{attached=onAttached;return app;},undefined,{activate,requestStop});
 try {await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(start).toHaveBeenCalled());
  await writeAssistantEnabled(dir,false);await vi.waitFor(()=>expect(requestStop).toHaveBeenCalledWith(deviceId));
  expect(activate).not.toHaveBeenCalled();
 } finally {await controller.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

it("does not load or construct the host while disabled, including stop", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-lazy-"));
 const create=vi.fn(()=>({start:vi.fn(),stop:vi.fn(async()=>{})}));
 const load=vi.fn(async()=>create);
 const controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,undefined,load);
 try {controller.start();await controller.stop();expect(load).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();}
 finally {await controller.stop();await rm(dir,{recursive:true,force:true});}
});
it("retains no host after confirmed disable and loads it only on enable",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-lazy-enable-"));
 const app={start:vi.fn(),stop:vi.fn(async()=>{})};
 const create=vi.fn(()=>app),load=vi.fn(async()=>create);
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,undefined,load);
 try {
  controller.start();await writeAssistantEnabled(dir,true);await vi.waitFor(()=>expect(app.start).toHaveBeenCalledOnce());
  expect(load).toHaveBeenCalledOnce();expect(create).toHaveBeenCalledOnce();
  await writeAssistantEnabled(dir,false);await vi.waitFor(()=>expect(app.stop).toHaveBeenCalledOnce());
  await writeAssistantEnabled(dir,true);await vi.waitFor(()=>expect(create).toHaveBeenCalledTimes(2));
 }finally{await controller.stop();await rm(dir,{recursive:true,force:true});}
});
it.each(["disable","stop"] as const)("does not construct after %s during implementation loading",async(action)=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-lazy-race-"));
 const create=vi.fn(()=>({start:vi.fn(),stop:vi.fn(async()=>{})}));
 let release!:(factory:typeof create)=>void;
 const load=vi.fn(()=>new Promise<typeof create>(resolve=>{release=resolve;}));
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,undefined,load);
 try {
  await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());
  const closing=action==="stop" ? controller.stop() : writeAssistantEnabled(dir,false);
  await Promise.resolve();if(action==="disable")await closing;
  release(create);await closing;await controller.stop();expect(create).not.toHaveBeenCalled();
 }finally{release?.(create);await controller.stop();await rm(dir,{recursive:true,force:true});}
});

it("does not spawn when OFF commits while bundled preparation retires before watch delivery",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-prepare-race-"));
 let release!:()=>void;const resolve=vi.fn(async()=>{await new Promise<void>(yes=>{release=yes;});return{command:["generated-host","generated-app"],origin:"http://127.0.0.1:7780"};});
 const watch=vi.spyOn(nodeFs,"watch").mockReturnValue(Object.assign(new EventEmitter(),{close:vi.fn()}) as unknown as nodeFs.FSWatcher);
 const create=vi.fn(()=>({start:vi.fn(),stop:vi.fn(async()=>{})}));
 const controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,undefined,async()=>create,resolve);
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledOnce());await writeAssistantEnabled(dir,false);release();await(controller as unknown as{queue:Promise<void>}).queue;expect(create).not.toHaveBeenCalled();}
 finally{release?.();await controller.stop();watch.mockRestore();await rm(dir,{recursive:true,force:true});}
});

it("disable aborts pending preparation and waits for its real retirement before another request",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-cancel-"));let release!:()=>void,signal:AbortSignal|undefined;
 const resolve=vi.fn(async(_origin:string,value:AbortSignal)=>{signal=value;await new Promise<void>(yes=>{release=yes;});return{command:["generated"],origin:"http://127.0.0.1:7780"};});
 const app={start:vi.fn(),stop:vi.fn(async()=>{})};const controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),app,undefined,undefined,undefined,resolve);
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledOnce());await controller.setEnabled(false);expect(signal?.aborted).toBe(true);expect(app.start).not.toHaveBeenCalled();release();await(controller as unknown as{queue:Promise<void>}).queue;expect(app.start).not.toHaveBeenCalled();expect((await controller.status()).phase).toBe("disabled");}
 finally{release?.();await controller.stop();await rm(dir,{recursive:true,force:true});}
});
it('retains a running identity through repeated ON and duplicate watch delivery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-idempotent-'));let attached!:(id:string)=>void;const app={start:vi.fn(),stop:vi.fn(async()=>{})},activate=vi.fn();
 const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),(_disabled,onAttached)=>{attached=onAttached;return app;},undefined,{activate,requestStop:vi.fn(async()=>{})});
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(app.start).toHaveBeenCalledOnce());attached('00000000-0000-4000-8000-000000000001');await vi.waitFor(()=>expect(activate).toHaveBeenCalledOnce());await controller.setEnabled(true);await(controller as unknown as{queue:Promise<void>}).queue;expect((await controller.status()).phase).toBe('running');expect(app.start).toHaveBeenCalledOnce();expect(activate).toHaveBeenCalledOnce();}
 finally{await controller.stop();await rm(dir,{recursive:true,force:true});}
});

it('revalidates the single attached identity when an equivalent ON arrives during authorization',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-attached-race-'));let attached!:(id:string)=>void,release!:()=>void,block=false;
 const original=enabledState.readAssistantEnabled;const read=vi.spyOn(enabledState,'readAssistantEnabled').mockImplementation(async(...args)=>{if(block){block=false;await new Promise<void>(yes=>{release=yes;});}return original(...args);});
 const app={start:vi.fn(),stop:vi.fn(async()=>{})},activate=vi.fn();const controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),(_disabled,onAttached)=>{attached=onAttached;return app;},undefined,{activate,requestStop:vi.fn(async()=>{})});
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(app.start).toHaveBeenCalledOnce());block=true;attached('00000000-0000-4000-8000-000000000001');await controller.setEnabled(true);await(controller as unknown as{queue:Promise<void>}).queue;release();await vi.waitFor(()=>expect(activate).toHaveBeenCalledOnce());expect((await controller.status()).phase).toBe('running');expect(app.start).toHaveBeenCalledOnce();}
 finally{release?.();await controller.stop();read.mockRestore();await rm(dir,{recursive:true,force:true});}
});
it.each([false,true])('a closed generated host cannot be revived by a late attached authorization result (relay=%s)',async(nativeNodeRelay)=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-closed-identity-'));let arm=false,blocked=false,release!:()=>void;
 const watch=vi.spyOn(nodeFs,"watch").mockReturnValue(Object.assign(new EventEmitter(),{close:vi.fn()}) as unknown as nodeFs.FSWatcher);
 const original=enabledState.readAssistantEnabled,read=vi.spyOn(enabledState,'readAssistantEnabled').mockImplementation(async(...args)=>{if(arm){arm=false;blocked=true;await new Promise<void>(yes=>{release=yes;});}return original(...args);});
 const trigger=join(dir,'generated-trigger');const code='const fs=require("node:fs");process.stdin.once("data",()=>{const timer=setInterval(()=>{if(!fs.existsSync('+JSON.stringify(trigger)+'))return;clearInterval(timer);process.stdout.write(JSON.stringify({type:"attached",deviceId:"00000000-0000-4000-8000-000000000001"})+"\\n");setTimeout(()=>process.exit(0),20);},5);});process.stdin.on("end",()=>process.exit(0));process.stdin.resume();';
 const activate=vi.fn(),controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,{activate,requestStop:vi.fn(async()=>{})},undefined,async()=>({command:[process.execPath,'-e',code,'--'],origin:'http://127.0.0.1:7780',nativeNodeRelay}));
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(async()=>expect((await controller.status()).phase).toBe('starting'));arm=true;await writeFile(trigger,'generated');await vi.waitFor(()=>expect(blocked).toBe(true));await vi.waitFor(async()=>expect((await controller.status()).phase).toBe('error'));const pending=[...(controller as unknown as{saves:Set<Promise<void>>}).saves];release();await Promise.all(pending);expect(activate).not.toHaveBeenCalled();expect((await controller.status()).phase).toBe('error');}
 finally{release?.();await controller.stop().catch(()=>{});read.mockRestore();watch.mockRestore();await rm(dir,{recursive:true,force:true});}
});

it('duplicate ON observations during a held preparation preserve the original preparation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-preparing-same-'));let release!:()=>void,signal:AbortSignal|undefined;
 const resolve=vi.fn(async(_origin:string,value:AbortSignal)=>{signal=value;await new Promise<void>(yes=>{release=yes;});return{command:['generated'],origin:'http://127.0.0.1:7780'};});
 const app={start:vi.fn(),stop:vi.fn(async()=>{})},controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),app,undefined,undefined,undefined,resolve);
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(resolve).toHaveBeenCalledOnce());await controller.setEnabled(true);await controller.setEnabled(true);expect(resolve).toHaveBeenCalledOnce();expect(signal?.aborted).toBe(false);release();await vi.waitFor(()=>expect(app.start).toHaveBeenCalledOnce());}
 finally{release?.();await controller.stop();await rm(dir,{recursive:true,force:true});}
});

it('rapid OFF then ON before teardown keeps the still-owned running host',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-assistant-rapid-toggle-'));let attached!:(id:string)=>void,release!:()=>void;
 const watch=vi.spyOn(nodeFs,"watch").mockReturnValue(Object.assign(new EventEmitter(),{close:vi.fn()}) as unknown as nodeFs.FSWatcher);
 const app={start:vi.fn(),stop:vi.fn(async()=>{})},controller=new AssistantLaunchController(dir,{SODA_ASSISTANT_COMMAND:'["generated"]'},()=>"http://127.0.0.1:7780",vi.fn(),(_disabled,onAttached)=>{attached=onAttached;return app;});
 const internals=controller as unknown as{queue:Promise<void>};
 try{await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(app.start).toHaveBeenCalledOnce());attached('00000000-0000-4000-8000-000000000001');await vi.waitFor(async()=>expect((await controller.status()).phase).toBe('running'));internals.queue=new Promise<void>(yes=>{release=yes;});await controller.setEnabled(false);expect((await controller.status()).phase).toBe('stopping');await controller.setEnabled(true);release();await internals.queue;expect((await controller.status()).phase).toBe('running');expect(app.start).toHaveBeenCalledOnce();expect(app.stop).not.toHaveBeenCalled();}
 finally{release?.();await controller.stop();watch.mockRestore();await rm(dir,{recursive:true,force:true});}
});
