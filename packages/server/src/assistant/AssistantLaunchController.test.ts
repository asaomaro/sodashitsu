import * as nodeFs from "node:fs";
import {EventEmitter} from "node:events";
import * as packageState from "./AssistantPackageState.js";
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

it("rechecks committed OFF after package metadata await even before watch delivery",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-assistant-metadata-race-"));
 const installed:packageState.AssistantPackage={version:1,current:{id:"00000000-0000-4000-8000-000000000001",command:[process.execPath],sha256:"a".repeat(64)},previous:null};
 let release!:(value:packageState.AssistantPackage)=>void;
 const read=vi.spyOn(packageState,"readAssistantPackage").mockResolvedValueOnce(installed).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const watch=vi.spyOn(nodeFs,"watch").mockReturnValue(Object.assign(new EventEmitter(),{close:vi.fn()}) as unknown as nodeFs.FSWatcher);
 const create=vi.fn(()=>({start:vi.fn(),stop:vi.fn(async()=>{})}));
 const controller=new AssistantLaunchController(dir,{},()=>"http://127.0.0.1:7780",vi.fn(),undefined,undefined,undefined,async()=>create);
 try {
  await writeAssistantEnabled(dir,true);controller.start();await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(2));
  await writeAssistantEnabled(dir,false);release(installed);
  await (controller as unknown as {queue:Promise<void>}).queue;
  expect(create).not.toHaveBeenCalled();
 }finally {release?.(installed);await controller.stop();watch.mockRestore();read.mockRestore();await rm(dir,{recursive:true,force:true});}
});
