import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { registerExecMethods } from "./exec.js";
import { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
it("requires a live authenticated connection for start/read/cancel, not an internal or pane context", async () => {
  const surface = new ControlSurface(), exec = { start: vi.fn(() => ({id: randomUUID()})), read: vi.fn(), cancel: vi.fn() };
  registerExecMethods(surface, { exec } as unknown as MethodDeps);
  const base = {clientId:"a",sink:{clientId:"a",bufferedAmount:0,sendOutput(){},sendSnapshot(){}}};
  const args = { "exec.start":{command:"echo test",cwd:"/tmp"}, "exec.read":{id:randomUUID()}, "exec.cancel":{id:randomUUID()} };
  for (const context of [base, {...base,connection:{}}, {...base,connection:{},connectionAuthorized:()=>false}])
    for (const [name,p] of Object.entries(args))
      expect(await surface.invoke(context as never,name,p)).toMatchObject({ok:false,error:{code:"unauthorized"}});
  expect(exec.start).not.toHaveBeenCalled(); expect(exec.read).not.toHaveBeenCalled(); expect(exec.cancel).not.toHaveBeenCalled();
  expect(await surface.invoke({...base,connection:{},connectionAuthorized:()=>true} as never,"exec.start",args["exec.start"])).toMatchObject({ok:true});
  expect(exec.start).toHaveBeenCalledWith("a",{command:"echo test",cwd:"/tmp",timeoutMs:30000,encoding:"utf-8"});
});
