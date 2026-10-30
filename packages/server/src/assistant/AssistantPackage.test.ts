import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { installAssistantPackage, readAssistantPackage, rollbackAssistantPackage } from "./AssistantPackage.js";
import { AssistantLaunchController, readAssistantEnabled, writeAssistantEnabled } from "./AssistantLaunchController.js";
import type { ManagedAssistant } from "./ManagedAssistant.js";
import { zipSync, strToU8 } from "fflate";

async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),"soda-package-")),state=join(dir,"state"),source=join(dir,"source"),destination=join(dir,"installed");
 await mkdir(join(source,"resources"),{recursive:true});
 await writeFile(join(source,"Sodashitsu Assistant.exe"),"generated executable, never run");
 await writeFile(join(source,"resources","app.asar"),"generated app");
 return {dir,state,source,destination,close:()=>rm(dir,{recursive:true,force:true})};
}
it("installs and rolls back without overwriting a running version or enabling the app",async()=>{
 const f=await fixture();
 try {
  const first=await installAssistantPackage(f.state,f.source,f.destination);
  await writeFile(join(f.source,"resources","app.asar"),"generated second app");
  const second=await installAssistantPackage(f.state,f.source,f.destination);
  expect(second.current.id).not.toBe(first.current.id);expect(second.current.sha256).not.toBe(first.current.sha256);
  expect(second.previous).toEqual(first.current);
  expect(await readFile(join(first.current.command[0],"..","resources","app.asar"),"utf8")).toBe("generated app");
  expect(await readAssistantEnabled(f.state)).toBe(false);
  expect((await rollbackAssistantPackage(f.state)).current).toEqual(first.current);
  expect((await rollbackAssistantPackage(f.state)).current).toEqual(second.current);
 } finally {await f.close();}
});
it("failed or concurrent installs retain the current pointer and enabled state",async()=>{
 const f=await fixture();
 try {
  const first=await installAssistantPackage(f.state,f.source,f.destination);
  await writeAssistantEnabled(f.state,true);
  await writeFile(join(f.state,"assistant-package.lock"),"");
  await expect(installAssistantPackage(f.state,f.source,f.destination)).rejects.toThrow("進行中");
  await rm(join(f.state,"assistant-package.lock"));
  if(process.platform==="win32") await writeFile(join(f.source,"resources","app.asar"),"");
  else await symlink(join(f.source,"Sodashitsu Assistant.exe"),join(f.source,"unexpected-link"));
  await expect(installAssistantPackage(f.state,f.source,f.destination)).rejects.toThrow(process.platform==="win32"?"配布フォルダー":"リンク");
  expect(await readAssistantPackage(f.state)).toEqual(first);
  expect(await readAssistantEnabled(f.state)).toBe(true);
  expect(await readdir(f.state)).not.toContain("assistant-package.lock");
  expect(await readdir(f.destination)).toEqual([first.current.id]);
  await expect(rollbackAssistantPackage(f.state)).rejects.toThrow("前版");
 } finally {await f.close();}
});
it("refuses rollback to changed, empty, missing or expanded prior contents",async()=>{
 for(const change of ["changed","empty","missing","extra"] as const) {
  const f=await fixture();
  try {
   const first=await installAssistantPackage(f.state,f.source,f.destination);
   const second=await installAssistantPackage(f.state,f.source,f.destination);
   const root=join(first.current.command[0],".."),asar=join(root,"resources","app.asar");
   if(change==="missing") await rm(asar);
   else if(change==="extra") await writeFile(join(root,"unexpected.txt"),"extra");
   else await writeFile(asar,change==="empty"?"":"corrupt");
   await expect(rollbackAssistantPackage(f.state)).rejects.toThrow();
   expect(await readAssistantPackage(f.state)).toEqual(second);
  } finally {await f.close();}
 }
});
it("rejects an install destination inside its source before copying",async()=>{
 const f=await fixture();
 try {await expect(installAssistantPackage(f.state,f.source,join(f.source,"nested"))).rejects.toThrow("外");expect(await readAssistantPackage(f.state)).toBeNull();}
 finally {await f.close();}
});
it("accepts Windows ZIP contents but rejects traversal and case collisions without switching",async()=>{
 const f=await fixture(),archive=join(f.dir,"assistant.zip");
 const files={"Sodashitsu Assistant.exe":strToU8("generated executable"),"resources/app.asar":strToU8("generated archive")};
 try {
  await writeFile(archive,zipSync(files));const first=await installAssistantPackage(f.state,archive,f.destination);
  expect(await readFile(first.current.command[0],"utf8")).toBe("generated executable");
  for(const unsafe of [{"../escape.txt":strToU8("escape")},{"resources/APP.ASAR":strToU8("collision")},{"C:/escape.txt":strToU8("drive")},{"NUL.txt":strToU8("device")}]) {
   await writeFile(archive,zipSync({...files,...unsafe}));
   await expect(installAssistantPackage(f.state,archive,f.destination)).rejects.toThrow();
   expect(await readAssistantPackage(f.state)).toEqual(first);
  }
  await expect(readFile(join(f.dir,"escape.txt"))).rejects.toThrow();
  const valid=zipSync(files,{level:0});
  for(const broken of [valid.subarray(0,valid.length-22),(()=>{const result=valid.slice(),index="Sodashitsu Assistant.exe".length+30;result[index]=result[index]!^1;return result;})()]) {
   await writeFile(archive,broken);
   await expect(installAssistantPackage(f.state,archive,f.destination)).rejects.toThrow();
   expect(await readAssistantPackage(f.state)).toEqual(first);
  }
 } finally {await f.close();}
});
it("an enabled owner stops before switching package; disabled owner never starts it",async()=>{
 const f=await fixture(),events:string[]=[];
 const start=vi.fn((value:{command:string[]})=>{events.push(`start:${value.command[0]}`);});
 const stop=vi.fn(async()=>{events.push("stop");});const warn=vi.fn();
 const controller=new AssistantLaunchController(f.state,{},()=>"http://127.0.0.1:7780",warn,{start,stop} as unknown as ManagedAssistant);
 try {
  const first=await installAssistantPackage(f.state,f.source,f.destination);controller.start();
  await vi.waitFor(()=>expect(stop).toHaveBeenCalled());expect(start).not.toHaveBeenCalled();
  await writeAssistantEnabled(f.state,true);
  await vi.waitFor(()=>expect(start).toHaveBeenCalledWith({command:first.current.command,origin:"http://127.0.0.1:7780"}));
  events.length=0;
  const second=await installAssistantPackage(f.state,f.source,f.destination);
  await vi.waitFor(()=>expect(events).toContain(`start:${second.current.command[0]}`));
  expect(events[0]).toBe("stop");expect(warn).not.toHaveBeenCalled();
  await writeAssistantEnabled(f.state,false);await controller.stop();start.mockClear();
  await rollbackAssistantPackage(f.state);controller.start();
  await vi.waitFor(()=>expect(stop).toHaveBeenCalled());expect(start).not.toHaveBeenCalled();
 } finally {await controller.stop();await f.close();}
});
it("explicit command override is preserved when an installation changes",async()=>{
 const f=await fixture(),start=vi.fn(),stop=vi.fn(async()=>{});
 const controller=new AssistantLaunchController(f.state,{SODA_ASSISTANT_COMMAND:'["explicit-app"]'},()=>"http://127.0.0.1:7780",vi.fn(),{start,stop} as unknown as ManagedAssistant);
 try {
  await installAssistantPackage(f.state,f.source,f.destination);await writeAssistantEnabled(f.state,true);controller.start();
  await vi.waitFor(()=>expect(start).toHaveBeenCalledWith({command:["explicit-app"],origin:"http://127.0.0.1:7780"}));
  stop.mockClear();const applied=start.mock.calls.length;await installAssistantPackage(f.state,f.source,f.destination);
  await vi.waitFor(()=>expect(start.mock.calls.length).toBeGreaterThan(applied));expect(stop).not.toHaveBeenCalled();
 } finally {await controller.stop();await f.close();}
});
it.each(["disable","handoff","newer"] as const)("discards a pending update after %s during app shutdown",async(change)=>{
 const f=await fixture(),start=vi.fn();let release!:()=>void,entered!:()=>void;
 const stopped=new Promise<void>(resolve=>{entered=resolve;});let block=false;
 const stop=vi.fn(async()=>{if(block){block=false;entered();await new Promise<void>(resolve=>{release=resolve;});}});
 const controller=new AssistantLaunchController(f.state,{},()=>"http://127.0.0.1:7780",vi.fn(),{start,stop} as unknown as ManagedAssistant);
 try {
  await installAssistantPackage(f.state,f.source,f.destination);await writeAssistantEnabled(f.state,true);controller.start();
  await vi.waitFor(()=>expect(start).toHaveBeenCalled());start.mockClear();
  block=true;await installAssistantPackage(f.state,f.source,f.destination);await stopped;
  expect(start).not.toHaveBeenCalled();
  let closing:Promise<void>|undefined;let newest:string[]|undefined;
  if(change==="disable") await writeAssistantEnabled(f.state,false);
  else if(change==="handoff") closing=controller.stop();
  else newest=(await installAssistantPackage(f.state,f.source,f.destination)).current.command;
  release();
  if(change==="disable") await vi.waitFor(()=>expect(stop.mock.calls.length).toBeGreaterThan(1));
  if(newest) await vi.waitFor(()=>expect(start).toHaveBeenCalledWith({command:newest,origin:"http://127.0.0.1:7780"}));
  await (closing??controller.stop());
  if(newest) expect(start.mock.calls.every(call=>JSON.stringify(call[0].command)===JSON.stringify(newest))).toBe(true);
  else expect(start).not.toHaveBeenCalled();
 } finally {release?.();await controller.stop();await f.close();}
});
