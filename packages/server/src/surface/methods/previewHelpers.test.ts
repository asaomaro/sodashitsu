import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerPreviewMethods } from "./preview.js";
import type { MethodDeps } from "./deps.js";
import type { MethodContext } from "../ControlSurface.js";
it("rejects remote/bridge helper launch and binds start/stop to the authenticated controller client", async () => {
  const start = vi.fn(), stop = vi.fn(), startWithProof = vi.fn(async () => { throw new (await import("@sodashitsu/protocol")).RpcError("unauthorized", "proof required"); }), surface = new ControlSurface();
  registerPreviewMethods(surface, {previewHelpers:{start,stop,startWithProof}} as unknown as MethodDeps);
  const ctx = {clientId:"browser"} as MethodContext, viewerId = crypto.randomUUID();
  for (const connection of [undefined, {localSettings:false}, {sameMachine:true}]) {
    const result = await surface.invoke({...ctx, ...(connection ? {connection:connection as never}: {})},"preview.helper_start",{machineId:"B",viewerId});
    expect(result).toMatchObject({ok:false,error:{code:"unauthorized"}});
  }
  expect(start).not.toHaveBeenCalled();
  expect(await surface.invoke({...ctx,connection:{localSettings:true} as never},"preview.helper_start",{machineId:"B",viewerId})).toMatchObject({ok:true});
  expect(start).toHaveBeenCalledWith("browser","B",viewerId);
  await surface.invoke(ctx,"preview.helper_stop",{viewerId});
  expect(stop).toHaveBeenCalledWith("browser",viewerId);
  expect(await surface.invoke({...ctx,connection:{localSettings:true} as never},"preview.helper_start",{machineId:"B",viewerId,command:"anything"})).toMatchObject({ok:false,error:{code:"invalid_params"}});
});
it("accepts a valid controller-bound proof on forwarded connections without relaxing local settings", async()=>{
  const start=vi.fn(),startWithProof=vi.fn(async()=>{}),probe=vi.fn(async()=>({id:crypto.randomUUID()})),surface=new ControlSurface();
  registerPreviewMethods(surface,{previewHelpers:{start,startWithProof,probe}} as unknown as MethodDeps);
  const ctx={clientId:"browser",connection:{localSettings:false},connectionAuthorized:()=>true} as MethodContext;
  const params={machineId:"B",viewerId:crypto.randomUUID()},proof={id:crypto.randomUUID(),secret:"x".repeat(43)};
  expect(await surface.invoke(ctx,"preview.helper_probe",params)).toMatchObject({ok:true});
  expect(probe).toHaveBeenCalledWith("browser","B",params.viewerId);
  expect(await surface.invoke(ctx,"preview.helper_start",{...params,proof})).toMatchObject({ok:true});
  expect(startWithProof).toHaveBeenCalledWith("browser","B",params.viewerId,proof);
  expect(startWithProof).toHaveBeenCalledTimes(1);
  expect(await surface.invoke({...ctx,connectionAuthorized:()=>false},"preview.helper_start",{...params,proof})).toMatchObject({ok:false});
  expect(startWithProof).toHaveBeenCalledTimes(1);
});
