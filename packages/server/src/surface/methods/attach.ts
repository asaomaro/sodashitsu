import {
  PaneAttachParams,
  PaneAttachResizeParams,
  PaneDetachParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * pane への直結（20260926-pane-direct-connect。herdr の terminal attach）。所有者と大きさの鍵は `SizeAuthority` が持つ。
 * 出力は既存の `pane.subscribe`、入力は既存の INPUT フレームで運ぶ（ここは所有者と大きさだけ）。
 */
export function registerAttachMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("pane.attach", {
    schema: PaneAttachParams,
    handler: (ctx, params) => {
      if (!deps.session.getPane(params.paneId))
        throw new RpcError("not_found", `pane not found: ${params.paneId}`);
      deps.sizeAuthority.attach(
        ctx.clientId,
        params.paneId,
        params.cols,
        params.rows,
        params.takeover ?? false,
      );
      const pane = deps.session.getPane(params.paneId)!;
      return { cols: pane.cols, rows: pane.rows };
    },
  });

  surface.register("pane.attach_resize", {
    schema: PaneAttachResizeParams,
    handler: (ctx, params) => {
      if (!deps.session.getPane(params.paneId))
        throw new RpcError("not_found", `pane not found: ${params.paneId}`);
      deps.sizeAuthority.resizeAttached(ctx.clientId, params.paneId, params.cols, params.rows);
      return {};
    },
  });

  surface.register("pane.detach", {
    schema: PaneDetachParams,
    handler: (ctx, params) => {
      deps.sizeAuthority.detach(ctx.clientId, params.paneId);
      return {};
    },
  });
}
