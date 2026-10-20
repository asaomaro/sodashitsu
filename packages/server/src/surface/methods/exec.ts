import { ExecMethods, RpcError } from "@sodashitsu/protocol";
import type { MethodContext, ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
export function registerExecMethods(surface: ControlSurface, deps: MethodDeps): void {
  const exec = deps.exec;
  if (!exec) return;
  const authorize = (ctx: MethodContext) => {
    if (!ctx.connection || !ctx.connectionAuthorized?.()) throw new RpcError("unauthorized", "A live authenticated connection is required");
  };
  surface.register("exec.start", { schema: ExecMethods["exec.start"], handler: (ctx, p) => { authorize(ctx); return exec.start(ctx.clientId, p); } });
  surface.register("exec.read", { schema: ExecMethods["exec.read"], handler: (ctx, p) => { authorize(ctx); return exec.read(ctx.clientId, p.id); } });
  surface.register("exec.cancel", { schema: ExecMethods["exec.cancel"], handler: (ctx, p) => { authorize(ctx); exec.cancel(ctx.clientId, p.id); return {}; } });
}
