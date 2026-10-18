import { DesktopCdpOpenParams, DesktopCdpSendParams, VscodeSharingMethods, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { DesktopCdpRelay } from "../../desktop/DesktopCdpRelay.js";

export function registerDesktopCdpMethods(surface: ControlSurface, relay: DesktopCdpRelay, settings?: import("../../desktop/VscodeSharingSettings.js").VscodeSharingSettings): void {
  if(settings){
    surface.register("vscode.settings.get",{schema:VscodeSharingMethods["vscode.settings.get"],handler:c=>settings.get(c.connection?.localSettings===true)});
    surface.register("vscode.settings.set",{schema:VscodeSharingMethods["vscode.settings.set"],handler:(c,p)=>{
      if(c.connection?.localSettings!==true)throw new RpcError("unauthorized","共有するPCのlocalhostの画面、または端末版で設定してください。");
      return settings.set(p);
    }});
  }
  const connection = (ctx: MethodContext) => {
    if (!ctx.connection || !ctx.connectionAuthorized?.())
      throw new RpcError("not_found", "A live authenticated connection is required");
    return ctx.connection;
  };
  surface.register("vscode.cdp.open", {schema:DesktopCdpOpenParams,handler:async ctx => {
    await relay.openRpc(connection(ctx), ctx.connectionAuthorized!); return {};
  }});
  surface.register("vscode.cdp.send", {schema:DesktopCdpSendParams,handler:(ctx,params) => {
    relay.sendRpc(connection(ctx), params.message); return {};
  }});
}
