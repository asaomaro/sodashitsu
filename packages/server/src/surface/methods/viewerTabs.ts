import { randomUUID } from "node:crypto";
import { loadViewerTabs, MAX_VIEWER_TABS, ViewerTabMethods, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/** These records belong to the controller server, never to the target's workspace/session model. */
export function registerViewerTabs(surface: ControlSurface, deps: MethodDeps): void {
  const store = deps.prefs;
  if (!store) return;
  let queue: Promise<unknown> = Promise.resolve();
  const read = () => loadViewerTabs(store.get().prefs.viewerTabs);
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };
  surface.register("viewer_tabs.list", {
    schema: ViewerTabMethods["viewer_tabs.list"],
    handler: () => ({ tabs: read(), rev: store.get().rev }),
  });
  surface.register("viewer_tabs.create", {
    schema: ViewerTabMethods["viewer_tabs.create"],
    handler: (ctx, p) =>
      serial(async () => {
        const tabs = read();
        if (tabs.length >= MAX_VIEWER_TABS)
          throw new RpcError("invalid_params", "閲覧タブの上限です");
        const tab = { ...p, id: randomUUID() };
        tabs.push(tab);
        const saved = await store.set({ viewerTabs: tabs }, ctx.clientId);
        return { tabs, tab, rev: saved.rev };
      }),
  });
  surface.register("viewer_tabs.update", {
    schema: ViewerTabMethods["viewer_tabs.update"],
    handler: (ctx, p) =>
      serial(async () => {
        const tabs = read(),
          index = tabs.findIndex((t) => t.id === p.id);
        if (index < 0) throw new RpcError("not_found", "閲覧タブがありません");
        const tab = tabs[index]!;
        if (p.label !== undefined) tab.label = p.label;
        if (p.position !== undefined) {
          tabs.splice(index, 1);
          tabs.splice(Math.min(p.position, tabs.length), 0, tab);
        }
        const saved = await store.set({ viewerTabs: tabs }, ctx.clientId);
        return { tabs, rev: saved.rev };
      }),
  });
  surface.register("viewer_tabs.remove", {
    schema: ViewerTabMethods["viewer_tabs.remove"],
    handler: (ctx, p) =>
      serial(async () => {
        const tabs = read().filter((t) => t.id !== p.id);
        const saved = await store.set({ viewerTabs: tabs }, ctx.clientId);
        return { tabs, rev: saved.rev };
      }),
  });
}
