import { PaneSubscribeParams, PaneUnsubscribeParams, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerSubscribeMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("pane.subscribe", {
    schema: PaneSubscribeParams,
    handler: (ctx, params) => {
      const host = deps.terminals.get(params.paneId);
      // モデルの pane か、この接続が開いた独自コマンドの popup（20260927-custom-command-keys。モデルに入らない端末。持ち主の接続だけが購読できる）。
      const pane = deps.session.getPane(params.paneId);
      const size = pane
        ? { cols: pane.cols, rows: pane.rows }
        : deps.commands?.popupSize(ctx.clientId, params.paneId);
      if (!host || !size) throw new RpcError("not_found", `pane not found: ${params.paneId}`);
      deps.clients.addSubscription(ctx.clientId, params.paneId);
      host.fanout.subscribe(ctx.sink, params.scrollbackLines);
      return size;
    },
  });

  surface.register("pane.unsubscribe", {
    schema: PaneUnsubscribeParams,
    handler: (ctx, params) => {
      deps.clients.removeSubscription(ctx.clientId, params.paneId);
      deps.terminals.get(params.paneId)?.fanout.unsubscribe(ctx.clientId);
      return {};
    },
  });
}
