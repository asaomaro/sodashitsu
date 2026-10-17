import { expect, it, vi } from "vitest";
import { ControlSurface, type MethodContext } from "../ControlSurface.js";
import { registerDesktopCdpMethods } from "./desktopCdp.js";
import type { DesktopCdpRelay } from "../../desktop/DesktopCdpRelay.js";

it("does not expose GUI operations through pane.sock, schedules or missing/revoked connections", async () => {
  const openRpc=vi.fn(),sendRpc=vi.fn(),surface=new ControlSurface();
  registerDesktopCdpMethods(surface,{openRpc,sendRpc} as unknown as DesktopCdpRelay);
  const ctx={clientId:"test",sink:{}} as MethodContext;
  for(const method of ["vscode.cdp.open","vscode.cdp.send"]){
    const result=await surface.invoke(ctx,method,method.endsWith("open")?{}:{message:{type:"launch"}});
    expect(result).toMatchObject({ok:false,error:{code:"not_found"}});
  }
  expect(openRpc).not.toHaveBeenCalled();expect(sendRpc).not.toHaveBeenCalled();
  const result=await surface.invoke({...ctx,connection:{} as any,connectionAuthorized:()=>false},"vscode.cdp.open",{});
  expect(result).toMatchObject({ok:false,error:{code:"not_found"}});
});
it("keeps remote control messages narrow and uses the live gateway connection", async () => {
  const openRpc=vi.fn(),sendRpc=vi.fn(),surface=new ControlSurface();
  registerDesktopCdpMethods(surface,{openRpc,sendRpc} as unknown as DesktopCdpRelay);
  const ctx={clientId:"test",sink:{},connection:{},connectionAuthorized:()=>true} as MethodContext;
  expect(await surface.invoke(ctx,"vscode.cdp.open",{})).toMatchObject({ok:true});
  expect(openRpc).toHaveBeenCalledWith(ctx.connection,ctx.connectionAuthorized);
  expect(await surface.invoke(ctx,"vscode.cdp.send",{message:{type:"launch",command:"bad"}})).toMatchObject({ok:false});
  expect(await surface.invoke(ctx,"vscode.cdp.send",{message:{type:"Runtime.evaluate",expression:"bad"}})).toMatchObject({ok:false});
  expect(sendRpc).not.toHaveBeenCalled();
  expect(await surface.invoke(ctx,"vscode.cdp.send",{message:{type:"launch"}})).toMatchObject({ok:true});
  expect(sendRpc).toHaveBeenCalledWith(ctx.connection,{type:"launch"});
});
