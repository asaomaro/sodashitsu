import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerPreviewMethods } from "./preview.js";
import type { MethodDeps } from "./deps.js";
import type { MethodContext } from "../ControlSurface.js";
it("rejects remote/bridge helper launch and binds start/stop to the authenticated controller client", async () => {
  const start = vi.fn(), stop = vi.fn(), surface = new ControlSurface();
  registerPreviewMethods(surface, {previewHelpers:{start,stop}} as unknown as MethodDeps);
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
