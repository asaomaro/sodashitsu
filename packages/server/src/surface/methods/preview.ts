import { PreviewMethods, PreviewHelperMethods, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerPreviewMethods(surface: ControlSurface, deps: MethodDeps): void {
  const helpers = deps.previewHelpers;
  if (helpers) {
    surface.register("preview.helper_probe", { schema: PreviewHelperMethods["preview.helper_probe"], handler: async (c, p) => {
      if (c.connectionAuthorized?.() === false) throw new RpcError("unauthorized", "接続が切れました");
      return helpers.probe(c.clientId, p.machineId, p.viewerId);
    } });
    surface.register("preview.helper_start", { schema: PreviewHelperMethods["preview.helper_start"], handler: async (c, p) => {
      if (c.connectionAuthorized?.() === false) throw new RpcError("unauthorized", "接続が切れました");
      if (c.connection?.localSettings === true) await helpers.start(c.clientId, p.machineId, p.viewerId);
      else await helpers.startWithProof(c.clientId, p.machineId, p.viewerId, p.proof);
      return {};
    } });
    surface.register("preview.helper_stop", { schema: PreviewHelperMethods["preview.helper_stop"], handler: async (c, p) => {
      await helpers.stop(c.clientId, p.viewerId); return {};
    } });
  }
  const s = deps.previews; if (!s) return;
  surface.register("preview.register", { schema: PreviewMethods["preview.register"], handler: (_c, p) => s.register(p) });
  surface.register("preview.list", { schema: PreviewMethods["preview.list"], handler: (_c, p) => s.list(p.paneId) });
  surface.register("preview.stop", { schema: PreviewMethods["preview.stop"], handler: (_c, p) => s.stop(p.appId, p.remove) });
  surface.register("preview.viewers", { schema: PreviewMethods["preview.viewers"], handler: (_c, p) => s.viewerList(p.paneId) });
  surface.register("preview.watch", { schema: PreviewMethods["preview.watch"], handler: (c, p) => s.watch(c.clientId, p.paneId, p.origin, p.viewId) });
  surface.register("preview.unwatch", { schema: PreviewMethods["preview.unwatch"], handler: (c, p) => s.unwatch(c.clientId, p.viewId) });
  surface.register("preview.poll", { schema: PreviewMethods["preview.poll"], handler: (c, p) => s.poll(c.clientId, p.viewId) });
  surface.register("preview.helper", { schema: PreviewMethods["preview.helper"], handler: (c, p) => s.helper(c.clientId, p.viewerId) });
  surface.register("preview.work", { schema: PreviewMethods["preview.work"], handler: (c) => s.work(c.clientId) });
  surface.register("preview.ready", { schema: PreviewMethods["preview.ready"], handler: (c, p) => s.ready(c.clientId, p) });
  surface.register("preview.open", { schema: PreviewMethods["preview.open"], handler: (c, p) => s.open(c.clientId, p.appId, p.viewerId) });
  surface.register("preview.abort_open", { schema: PreviewMethods["preview.abort_open"], handler: (c, p) => s.abortOpen(c.clientId, p.appId) });
  surface.register("preview.ack", { schema: PreviewMethods["preview.ack"], handler: (c, p) => s.ack(c.clientId, p.requestId) });
  surface.register("preview.close", { schema: PreviewMethods["preview.close"], handler: (c, p) => s.closeView(c.clientId, p.requestId) });
  surface.register("preview.http.begin", { schema: PreviewMethods["preview.http.begin"], handler: (c, p) => s.streams.begin(c.clientId, p) });
  surface.register("preview.http.write", { schema: PreviewMethods["preview.http.write"], handler: (c, p) => s.streams.write(c.clientId, p) });
  surface.register("preview.http.read", { schema: PreviewMethods["preview.http.read"], handler: (c, p) => s.streams.read(c.clientId, p.streamId, p.maxBytes) });
  surface.register("preview.cancel", { schema: PreviewMethods["preview.cancel"], handler: (c, p) => s.streams.cancel(c.clientId, p.streamId) });
  surface.register("preview.ws.begin", { schema: PreviewMethods["preview.ws.begin"], handler: (c, p) => s.streams.wsBegin(c.clientId, p) });
  surface.register("preview.ws.write", { schema: PreviewMethods["preview.ws.write"], handler: (c, p) => s.streams.wsWrite(c.clientId, p) });
  surface.register("preview.ws.read", { schema: PreviewMethods["preview.ws.read"], handler: (c, p) => s.streams.wsRead(c.clientId, p.streamId) });
}
