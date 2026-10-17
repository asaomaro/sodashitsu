import { DesktopCdpOpenParams, DesktopCdpSendParams, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { DesktopCdpRelay } from "../../desktop/DesktopCdpRelay.js";

export function registerDesktopCdpMethods(surface: ControlSurface, relay: DesktopCdpRelay): void {
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
