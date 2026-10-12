import {
  DisplayActionParams,
  DisplayCloseParams,
  DisplayDismissParams,
  DisplayFeaturesParams,
  DisplayGetParams,
  DisplayListParams,
  DisplaySendParams,
  DisplaySetParams,
  DisplaySubscribeParams,
  DisplayWaitParams,
  DisplayReportParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）。`set`・`close`・`list`・`wait`・`features` は pane のプログラム（sodactl の `/ws` 経路）、
 * `subscribe`・`get`・`action`・`dismiss`・`report` は画面（desktop / mobile）が使う。`deps.displays` が無ければ登録しない。
 * **handler は `RpcError` 以外を投げない**（`DisplayService` が検査して `RpcError` にする）。
 */
export function registerDisplayMethods(surface: ControlSurface, deps: MethodDeps): void {
  const displays = deps.displays;
  if (!displays) return;
  surface.register("display.set", {
    schema: DisplaySetParams,
    handler: (_ctx, { paneId, ...body }) => displays.set(paneId, body),
  });
  surface.register("display.close", {
    schema: DisplayCloseParams,
    handler: (_ctx, p) => displays.close(p.paneId, p),
  });
  surface.register("display.list", {
    schema: DisplayListParams,
    handler: (_ctx, p) => displays.list(p.paneId),
  });
  // 次の出来事か timeoutMs まで応答しない長い要求。`MethodContext` に signal は無いので、持ち主は clientId（切断は `onClientGone` が外す）。
  surface.register("display.wait", {
    schema: DisplayWaitParams,
    handler: (ctx, { paneId, ...p }) => displays.wait(paneId, p, { clientId: ctx.clientId }),
  });
  surface.register("display.features", {
    schema: DisplayFeaturesParams,
    handler: () => displays.features(),
  });
  surface.register("display.send", {
    schema: DisplaySendParams,
    handler: (_ctx, p) => displays.send(p.paneId, { name: p.name, data: p.data }),
  });
  surface.register("display.subscribe", {
    schema: DisplaySubscribeParams,
    handler: (ctx, p) => displays.subscribe(ctx.clientId, p.features),
  });
  surface.register("display.get", {
    schema: DisplayGetParams,
    handler: (ctx, p) => displays.get(ctx.clientId, p.id, p.offset),
  });
  surface.register("display.action", {
    schema: DisplayActionParams,
    handler: (ctx, p) => {
      displays.action(ctx.clientId, p);
      return {};
    },
  });
  surface.register("display.dismiss", {
    schema: DisplayDismissParams,
    handler: (ctx, p) => {
      const instances = deps.session.snapshot().tabs.flatMap((tab) =>
        (tab.views ?? []).flatMap((v) => {
          if (!deps.session.hasPane(v.paneId)) return [];
          const matches = displays
            .list(v.paneId)
            .displays.filter((d) => d.name === v.display || d.name === v.terminalDisplay);
          return matches.map((display) => ({
            tabId: tab.id,
            viewId: v.id,
            displayId: display.id,
            paneId: v.paneId,
            name: display.name,
          }));
        }),
      );
      const result = displays.dismiss(ctx.clientId, p);
      const removed = new Set<string>();
      for (const v of instances)
        if (
          !removed.has(v.viewId) &&
          (p.id === v.displayId || (p.id === undefined && p.paneId === v.paneId)) &&
          result.closed.includes(v.name)
        ) {
          removed.add(v.viewId);
          deps.session.removeTabView(v.tabId, v.viewId);
          for (const sibling of instances.filter((i) => i.viewId === v.viewId))
            displays.close(sibling.paneId, { name: sibling.name });
        }
      return result;
    },
  });
  surface.register("display.report", {
    schema: DisplayReportParams,
    handler: (ctx, p) => displays.report(ctx.clientId, p),
  });
}
